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
  const graphqlUrl = `https://${cleanDomain}/admin/api/2024-10/graphql.json`

  try {
    // Step 1: Search for matching taxonomy category
    const searchQuery = `
      query searchTaxonomy($query: String!) {
        taxonomy {
          categories(first: 20, query: $query) {
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
      body: JSON.stringify({
        query: searchQuery,
        variables: { query: categoryName || 'Paintings' }
      })
    })

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text()
      console.error('Taxonomy search error:', errorText)
      return res.status(searchResponse.status).json({
        error: 'Failed to search taxonomy',
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
    
    // Find best match - prefer leaf nodes (most specific)
    let bestMatch = categories.find(c => 
      c.name.toLowerCase() === (categoryName || 'paintings').toLowerCase() && c.isLeaf
    )
    
    // If no exact leaf match, find any exact match
    if (!bestMatch) {
      bestMatch = categories.find(c => 
        c.name.toLowerCase() === (categoryName || 'paintings').toLowerCase()
      )
    }
    
    // Look for Paintings in Visual Artwork path
    if (!bestMatch) {
      bestMatch = categories.find(c => 
        c.fullName?.toLowerCase().includes('visual artwork') &&
        c.fullName?.toLowerCase().includes('painting')
      )
    }
    
    // Fallback to first leaf result
    if (!bestMatch) {
      bestMatch = categories.find(c => c.isLeaf) || categories[0]
    }

    if (!bestMatch) {
      return res.status(200).json({
        success: false,
        message: 'No matching taxonomy category found',
        searchedFor: categoryName
      })
    }

    console.log(`Found taxonomy category: ${bestMatch.fullName} (${bestMatch.id})`)

    // Step 2: Update product with the category via GraphQL
    const updateMutation = `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
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

    const updateResponse = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: updateMutation,
        variables: {
          input: {
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
