// Shopify Category Taxonomy API
// Sets product category using verified Shopify taxonomy IDs
// Reference: https://github.com/Shopify/product-taxonomy

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

  // VERIFIED category mappings from Shopify's Standard Product Taxonomy
  // Source: https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/categories.txt
  // Path: Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork
  const ART_CATEGORY_MAP = {
    // Primary art categories
    'paintings': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4',
    'painting': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4',
    'oil painting': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4',
    'watercolor': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4',
    
    'prints': 'gid://shopify/TaxonomyCategory/hg-3-4-2-2',
    'print': 'gid://shopify/TaxonomyCategory/hg-3-4-2-2',
    'art print': 'gid://shopify/TaxonomyCategory/hg-3-4-2-2',
    'giclee': 'gid://shopify/TaxonomyCategory/hg-3-4-2-2',
    
    'posters': 'gid://shopify/TaxonomyCategory/hg-3-4-2-1',
    'poster': 'gid://shopify/TaxonomyCategory/hg-3-4-2-1',
    
    'visual artwork': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'artwork': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'photographs': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'photograph': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'photography': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'photo': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'drawings': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'drawing': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'sketch': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    
    'sculptures': 'gid://shopify/TaxonomyCategory/hg-3-4-3',
    'sculpture': 'gid://shopify/TaxonomyCategory/hg-3-4-3',
    'statue': 'gid://shopify/TaxonomyCategory/hg-3-4-3',
    'statues': 'gid://shopify/TaxonomyCategory/hg-3-4-3',
    
    'tapestry': 'gid://shopify/TaxonomyCategory/hg-3-4-1',
    'tapestries': 'gid://shopify/TaxonomyCategory/hg-3-4-1',
    
    // Parent categories (use for generic art)
    'art': 'gid://shopify/TaxonomyCategory/hg-3-4-2',  // Posters, Prints & Visual Artwork
    'wall art': 'gid://shopify/TaxonomyCategory/hg-3-4-2',
    'fine art': 'gid://shopify/TaxonomyCategory/hg-3-4-2',
    
    // Default fallback
    'default': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4'  // Paintings
  }

  try {
    const searchTerm = (categoryName || 'paintings').toLowerCase().trim()
    
    // Look up category ID from our map
    let categoryId = ART_CATEGORY_MAP[searchTerm] || ART_CATEGORY_MAP['default']
    
    console.log(`Mapping "${searchTerm}" to category: ${categoryId}`)

    // Update product with the category via GraphQL
    // Using ProductUpdateInput (not deprecated ProductInput)
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
        categoryId,
        categoryPath: updatedProduct?.category?.fullName || 'Unknown'
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
