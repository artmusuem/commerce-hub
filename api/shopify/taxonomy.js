// Shopify Category Taxonomy API
// Sets product category using known art taxonomy IDs

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

  // Known art category mappings from Shopify's Standard Product Taxonomy
  // Source: https://shopify.github.io/product-taxonomy/
  const ART_CATEGORY_MAP = {
    'paintings': 'gid://shopify/TaxonomyCategory/hg-4-7-4',      // Paintings in Posters, Prints & Visual Artwork
    'painting': 'gid://shopify/TaxonomyCategory/hg-4-7-4',
    'prints': 'gid://shopify/TaxonomyCategory/hg-4-7-5',         // Prints in Posters, Prints & Visual Artwork
    'print': 'gid://shopify/TaxonomyCategory/hg-4-7-5',
    'photographs': 'gid://shopify/TaxonomyCategory/hg-4-7-3',    // Photographs
    'photograph': 'gid://shopify/TaxonomyCategory/hg-4-7-3',
    'photography': 'gid://shopify/TaxonomyCategory/hg-4-7-3',
    'posters': 'gid://shopify/TaxonomyCategory/hg-4-7-6',        // Posters
    'poster': 'gid://shopify/TaxonomyCategory/hg-4-7-6',
    'sculptures': 'gid://shopify/TaxonomyCategory/hg-4-8',       // Sculptures & Statues
    'sculpture': 'gid://shopify/TaxonomyCategory/hg-4-8',
    'drawings': 'gid://shopify/TaxonomyCategory/hg-4-7-2',       // Drawings & Sketches
    'drawing': 'gid://shopify/TaxonomyCategory/hg-4-7-2',
    'art': 'gid://shopify/TaxonomyCategory/hg-4-7',              // Posters, Prints & Visual Artwork (parent)
    'visual artwork': 'gid://shopify/TaxonomyCategory/hg-4-7',
    'default': 'gid://shopify/TaxonomyCategory/hg-4-7-4'         // Default to Paintings
  }

  try {
    const searchTerm = (categoryName || 'paintings').toLowerCase().trim()
    
    // Look up category ID from our map
    let categoryId = ART_CATEGORY_MAP[searchTerm] || ART_CATEGORY_MAP['default']
    
    console.log(`Mapping "${searchTerm}" to category: ${categoryId}`)

    // Update product with the category via GraphQL
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

    console.log(`Setting category ${categoryId} on product ${productId}`)

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
      categoryMapped: {
        searchTerm,
        categoryId
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
