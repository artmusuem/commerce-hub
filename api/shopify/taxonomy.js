// Shopify Category Taxonomy API
// Sets product category using Shopify Standard Product Taxonomy
// NOTE: Category metafields (Color, Painting medium, etc.) are AI-suggested by Shopify Magic
// Source: https://github.com/Shopify/product-taxonomy

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

  // ===========================================================================
  // CATEGORY MAPPINGS (Verified from Shopify's taxonomy repository)
  // ===========================================================================
  const CATEGORY_MAP = {
    // Art categories (Home & Garden > Decor > Artwork)
    'paintings': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4',
    'painting': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4',
    'prints': 'gid://shopify/TaxonomyCategory/hg-3-4-2-2',
    'print': 'gid://shopify/TaxonomyCategory/hg-3-4-2-2',
    'posters': 'gid://shopify/TaxonomyCategory/hg-3-4-2-1',
    'poster': 'gid://shopify/TaxonomyCategory/hg-3-4-2-1',
    'visual artwork': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'artwork': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'photographs': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'photography': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'sculptures': 'gid://shopify/TaxonomyCategory/hg-3-4-3',
    'sculpture': 'gid://shopify/TaxonomyCategory/hg-3-4-3',
    'statues': 'gid://shopify/TaxonomyCategory/hg-3-4-3',
    'tapestries': 'gid://shopify/TaxonomyCategory/hg-3-4-1',
    'tapestry': 'gid://shopify/TaxonomyCategory/hg-3-4-1',
    // Smithsonian categories
    'graphic arts': 'gid://shopify/TaxonomyCategory/hg-3-4-2-2',  // Maps to Prints
    'graphic art': 'gid://shopify/TaxonomyCategory/hg-3-4-2-2',
    'drawings': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'drawing': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
    'watercolors': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4',
    'watercolor': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4',
    'oil painting': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4',
    'oil paintings': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4',
    'default': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4'
  }

  try {
    const searchTerm = (categoryName || 'paintings').toLowerCase().trim()
    const categoryId = CATEGORY_MAP[searchTerm] || CATEGORY_MAP['default']
    
    console.log(`Setting category: ${searchTerm} → ${categoryId}`)

    // Update product with category
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
        error: 'Failed to update product',
        details: errorText
      })
    }

    const updateData = await updateResponse.json()

    if (updateData.errors) {
      console.error('GraphQL errors:', updateData.errors)
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
        searchTerm,
        categoryId,
        name: updatedProduct?.category?.name,
        fullName: updatedProduct?.category?.fullName
      },
      product: updatedProduct,
      note: 'Category metafields (Color, Painting medium, Theme, etc.) are suggested by Shopify Magic. Click "Accept all" in Shopify admin to confirm them.'
    })

  } catch (error) {
    console.error('Taxonomy error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}
