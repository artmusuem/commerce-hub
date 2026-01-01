// Shopify Category Taxonomy API
// Finds matching taxonomy category and sets it on a product via GraphQL

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { shop, accessToken, productId, categoryName } = req.body

  if (!shop || !accessToken || !productId) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  const cleanDomain = shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const apiDomain = cleanDomain.includes('.myshopify.com') 
    ? cleanDomain 
    : `${cleanDomain}.myshopify.com`
  
  const graphqlUrl = `https://${apiDomain}/admin/api/2024-10/graphql.json`

  try {
    // Step 1: Fetch taxonomy categories from Shopify
    const searchQuery = `
      query {
        taxonomy {
          categories(first: 250) {
            nodes {
              id
              name
              fullName
              isLeaf
            }
          }
        }
      }
    `

    const searchResponse = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: searchQuery })
    })

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error('Taxonomy fetch error:', searchResponse.status, errorText)
      return res.status(searchResponse.status).json({
        error: `Shopify API error: ${searchResponse.status}`,
        details: errorText
      })
    }

    const searchData = await searchResponse.json()
    
    if (searchData.errors) {
      console.error('GraphQL errors:', searchData.errors)
      return res.status(400).json({
        error: 'GraphQL query failed',
        details: searchData.errors
      })
    }

    const categories = searchData.data?.taxonomy?.categories?.nodes || []
    const searchTerm = (categoryName || 'paintings').toLowerCase()
    
    console.log(`Searching for category: ${searchTerm} among ${categories.length} categories`)
    
    // Find best match
    let bestMatch = null
    
    // 1. Exact name match (leaf preferred)
    bestMatch = categories.find(c => 
      c.name.toLowerCase() === searchTerm && c.isLeaf
    )
    
    // 2. Exact name match (any)
    if (!bestMatch) {
      bestMatch = categories.find(c => 
        c.name.toLowerCase() === searchTerm
      )
    }
    
    // 3. Name contains search term (leaf preferred)
    if (!bestMatch) {
      bestMatch = categories.find(c => 
        c.name.toLowerCase().includes(searchTerm) && c.isLeaf
      )
    }
    
    // 4. Full name contains search term (for things like "Visual Artwork > Paintings")
    if (!bestMatch) {
      bestMatch = categories.find(c => 
        c.fullName?.toLowerCase().includes(searchTerm) && c.isLeaf
      )
    }
    
    // 5. Look for artwork-related fallback
    if (!bestMatch) {
      bestMatch = categories.find(c => 
        (c.fullName?.toLowerCase().includes('artwork') || 
         c.fullName?.toLowerCase().includes('visual') ||
         c.fullName?.toLowerCase().includes('poster') ||
         c.fullName?.toLowerCase().includes('print')) && c.isLeaf
      )
    }

    if (!bestMatch) {
      // Log available categories for debugging
      const artCategories = categories.filter(c => 
        c.fullName?.toLowerCase().includes('art') || 
        c.name.toLowerCase().includes('art')
      ).map(c => ({ name: c.name, fullName: c.fullName, id: c.id }))
      
      console.log('Art-related categories found:', artCategories)
      
      return res.status(200).json({
        success: false,
        message: 'No matching taxonomy category found',
        searchedFor: categoryName,
        totalCategories: categories.length,
        artRelatedCategories: artCategories.slice(0, 10)
      })
    }

    console.log(`Found taxonomy category: ${bestMatch.fullName} (${bestMatch.id})`)

    // Step 2: Update product with the category via GraphQL
    // Using NEW ProductUpdateInput (not deprecated ProductInput)
    const updateMutation = `
      mutation productUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            category {
              id
              name
              fullName
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `

    console.log(`Setting category ${bestMatch.id} on product ${productId}`)

    const updateResponse = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: updateMutation,
        variables: {
          product: {
            id: `gid://shopify/Product/${productId}`,
            category: bestMatch.id
          }
        }
      })
    })

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text()
      console.error('Product update error:', errorText)
      return res.status(updateResponse.status).json({
        error: 'Failed to update product category',
        details: errorText
      })
    }

    const updateData = await updateResponse.json()

    if (updateData.errors) {
      console.error('GraphQL mutation errors:', updateData.errors)
      return res.status(400).json({
        error: 'GraphQL mutation failed',
        details: updateData.errors
      })
    }

    const userErrors = updateData.data?.productUpdate?.userErrors || []
    if (userErrors.length > 0) {
      console.error('User errors:', userErrors)
      return res.status(400).json({
        error: 'Product update failed',
        details: userErrors
      })
    }

    const updatedProduct = updateData.data?.productUpdate?.product

    return res.status(200).json({
      success: true,
      categorySet: {
        id: bestMatch.id,
        name: bestMatch.name,
        fullName: bestMatch.fullName
      },
      product: updatedProduct
    })

  } catch (error) {
    console.error('Category taxonomy error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}
