// Shopify Category Taxonomy API
// Finds matching taxonomy category and sets it on a product via GraphQL

// Pre-defined mapping of common art categories to Shopify taxonomy IDs
// These are from Shopify's Standard Product Taxonomy
const CATEGORY_MAP = {
  'paintings': 'gid://shopify/TaxonomyCategory/aa-4-7-4',      // Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork > Paintings
  'prints': 'gid://shopify/TaxonomyCategory/aa-4-7-5',         // Posters, Prints & Visual Artwork > Prints
  'photographs': 'gid://shopify/TaxonomyCategory/aa-4-7-3',    // Posters, Prints & Visual Artwork > Photographs
  'posters': 'gid://shopify/TaxonomyCategory/aa-4-7-2',        // Posters, Prints & Visual Artwork > Posters
  'drawings': 'gid://shopify/TaxonomyCategory/aa-4-7-1',       // Posters, Prints & Visual Artwork > Drawings & Sketches
  'sculptures': 'gid://shopify/TaxonomyCategory/aa-4-8',       // Home & Garden > Decor > Sculptures & Statues
  'graphic arts': 'gid://shopify/TaxonomyCategory/aa-4-7',     // Posters, Prints & Visual Artwork (parent)
  'visual artwork': 'gid://shopify/TaxonomyCategory/aa-4-7',   // Posters, Prints & Visual Artwork (parent)
}

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
    // Look up category ID from our mapping
    const searchTerm = (categoryName || 'paintings').toLowerCase().trim()
    let categoryId = CATEGORY_MAP[searchTerm]
    
    // If not in map, try partial match
    if (!categoryId) {
      for (const [key, value] of Object.entries(CATEGORY_MAP)) {
        if (searchTerm.includes(key) || key.includes(searchTerm)) {
          categoryId = value
          break
        }
      }
    }
    
    // Default to "Posters, Prints & Visual Artwork" if no match
    if (!categoryId) {
      categoryId = CATEGORY_MAP['visual artwork']
    }

    console.log(`Setting category for product ${productId}: ${categoryName} -> ${categoryId}`)

    // Update product with the category via GraphQL
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
            category: categoryId
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
        id: categoryId,
        name: categoryName,
        fullName: updatedProduct?.category?.fullName || categoryName
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
