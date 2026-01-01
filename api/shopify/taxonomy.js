// Shopify Category Taxonomy API
// Sets product category AND metafields using Shopify Standard Product Taxonomy
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

  const { shop, accessToken, productId, categoryName, title, description } = req.body

  if (!shop || !accessToken || !productId) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  const cleanDomain = shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const apiDomain = cleanDomain.includes('.myshopify.com') 
    ? cleanDomain 
    : `${cleanDomain}.myshopify.com`
  
  const graphqlUrl = `https://${apiDomain}/admin/api/2024-10/graphql.json`

  // ===========================================================================
  // CATEGORY MAPPINGS
  // ===========================================================================
  const CATEGORY_MAP = {
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
    'tapestries': 'gid://shopify/TaxonomyCategory/hg-3-4-1',
    'tapestry': 'gid://shopify/TaxonomyCategory/hg-3-4-1',
    'default': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4'
  }

  // ===========================================================================
  // ATTRIBUTE VALUES (GIDs from Shopify taxonomy)
  // ===========================================================================
  const ATTRIBUTE_VALUES = {
    // Painting medium
    'medium-oil': 'gid://shopify/TaxonomyValue/26262',
    'medium-acrylic': 'gid://shopify/TaxonomyValue/26244',
    'medium-watercolor': 'gid://shopify/TaxonomyValue/26270',
    'medium-gouache': 'gid://shopify/TaxonomyValue/26256',
    'medium-tempera': 'gid://shopify/TaxonomyValue/26252',
    'medium-pastel': 'gid://shopify/TaxonomyValue/26263',
    'medium-ink': 'gid://shopify/TaxonomyValue/26258',
    'medium-charcoal': 'gid://shopify/TaxonomyValue/26248',
    'medium-digital': 'gid://shopify/TaxonomyValue/26250',
    'medium-mixed': 'gid://shopify/TaxonomyValue/26260',
    
    // Artwork authenticity
    'auth-original': 'gid://shopify/TaxonomyValue/26298',
    'auth-reproduction': 'gid://shopify/TaxonomyValue/26299',
    
    // Frame style
    'frame-framed': 'gid://shopify/TaxonomyValue/24017',
    'frame-unframed': 'gid://shopify/TaxonomyValue/7893',
    'frame-canvas': 'gid://shopify/TaxonomyValue/24015',
    'frame-gallery': 'gid://shopify/TaxonomyValue/7887',
    
    // Color
    'color-multicolor': 'gid://shopify/TaxonomyValue/2865',
    'color-black': 'gid://shopify/TaxonomyValue/1',
    'color-white': 'gid://shopify/TaxonomyValue/5',
    'color-blue': 'gid://shopify/TaxonomyValue/2',
    'color-green': 'gid://shopify/TaxonomyValue/9',
    'color-brown': 'gid://shopify/TaxonomyValue/7',
    
    // Theme
    'theme-nature': 'gid://shopify/TaxonomyValue/7911',
    'theme-animals': 'gid://shopify/TaxonomyValue/17404',
    'theme-portrait': 'gid://shopify/TaxonomyValue/7916',
    'theme-landscape': 'gid://shopify/TaxonomyValue/7908',
    'theme-architecture': 'gid://shopify/TaxonomyValue/7896',
    'theme-religious': 'gid://shopify/TaxonomyValue/7917',
    'theme-historical': 'gid://shopify/TaxonomyValue/7906',
    'theme-maritime': 'gid://shopify/TaxonomyValue/7909',
    'theme-floral': 'gid://shopify/TaxonomyValue/17407',
    'theme-abstract': 'gid://shopify/TaxonomyValue/7894',
    'theme-mythology': 'gid://shopify/TaxonomyValue/17412',
    'theme-spirituality': 'gid://shopify/TaxonomyValue/7920',
  }

  // ===========================================================================
  // PARSING FUNCTIONS
  // ===========================================================================
  
  function parseMedium(desc) {
    if (!desc) return null
    const text = desc.toLowerCase()
    
    if (/oil\s*(on\s*canvas|painting)?/.test(text)) return ATTRIBUTE_VALUES['medium-oil']
    if (/watercolor|water\s*color/.test(text)) return ATTRIBUTE_VALUES['medium-watercolor']
    if (/acrylic/.test(text)) return ATTRIBUTE_VALUES['medium-acrylic']
    if (/gouache/.test(text)) return ATTRIBUTE_VALUES['medium-gouache']
    if (/tempera/.test(text)) return ATTRIBUTE_VALUES['medium-tempera']
    if (/pastel/.test(text)) return ATTRIBUTE_VALUES['medium-pastel']
    if (/ink/.test(text)) return ATTRIBUTE_VALUES['medium-ink']
    if (/charcoal/.test(text)) return ATTRIBUTE_VALUES['medium-charcoal']
    if (/digital/.test(text)) return ATTRIBUTE_VALUES['medium-digital']
    if (/mixed\s*media/.test(text)) return ATTRIBUTE_VALUES['medium-mixed']
    
    return null
  }
  
  function parseTheme(titleText, descText) {
    const text = `${titleText || ''} ${descText || ''}`.toLowerCase()
    
    if (/landscape|scenery|vista|valley/.test(text)) return ATTRIBUTE_VALUES['theme-landscape']
    if (/portrait/.test(text)) return ATTRIBUTE_VALUES['theme-portrait']
    if (/maritime|sea\s|ship|ocean|naval|boat|sailing/.test(text)) return ATTRIBUTE_VALUES['theme-maritime']
    if (/religious|biblical|christian|church|madonna|christ/.test(text)) return ATTRIBUTE_VALUES['theme-religious']
    if (/animal|bird|horse|dog|cat|wildlife/.test(text)) return ATTRIBUTE_VALUES['theme-animals']
    if (/flower|floral|botanical|garden/.test(text)) return ATTRIBUTE_VALUES['theme-floral']
    if (/nature|tree|forest|mountain|river|lake/.test(text)) return ATTRIBUTE_VALUES['theme-nature']
    if (/architecture|building|city|urban/.test(text)) return ATTRIBUTE_VALUES['theme-architecture']
    if (/abstract/.test(text)) return ATTRIBUTE_VALUES['theme-abstract']
    if (/historical|battle|war|military/.test(text)) return ATTRIBUTE_VALUES['theme-historical']
    if (/mythology|mythological|greek|roman|gods/.test(text)) return ATTRIBUTE_VALUES['theme-mythology']
    if (/spiritual|meditation|contemplat/.test(text)) return ATTRIBUTE_VALUES['theme-spirituality']
    
    return null
  }
  
  function buildMetafields(titleText, descText, catName) {
    const metafields = []
    
    // Always set as reproduction (museum prints)
    metafields.push({
      namespace: 'custom',
      key: 'artwork_authenticity', 
      value: 'Reproduction',
      type: 'single_line_text_field'
    })
    
    // Default to unframed
    metafields.push({
      namespace: 'custom',
      key: 'frame_style',
      value: 'Unframed', 
      type: 'single_line_text_field'
    })
    
    // Default to multicolor
    metafields.push({
      namespace: 'custom',
      key: 'color',
      value: 'Multicolor',
      type: 'single_line_text_field'
    })
    
    // Parse medium from description
    const mediumGid = parseMedium(descText)
    if (mediumGid) {
      // Extract just the value name for display
      const mediumName = descText.toLowerCase().includes('oil') ? 'Oil' :
                        descText.toLowerCase().includes('watercolor') ? 'Watercolor' :
                        descText.toLowerCase().includes('acrylic') ? 'Acrylic' :
                        descText.toLowerCase().includes('pastel') ? 'Pastel' : 'Other'
      metafields.push({
        namespace: 'custom',
        key: 'painting_medium',
        value: mediumName,
        type: 'single_line_text_field'
      })
    }
    
    // Parse theme
    const themeGid = parseTheme(titleText, descText)
    if (themeGid) {
      const text = `${titleText || ''} ${descText || ''}`.toLowerCase()
      const themeName = /landscape/.test(text) ? 'Landscape' :
                       /portrait/.test(text) ? 'Portrait' :
                       /maritime|sea|ship|ocean/.test(text) ? 'Maritime' :
                       /religious|biblical/.test(text) ? 'Religious' :
                       /animal|bird|horse/.test(text) ? 'Animals' :
                       /flower|floral|botanical/.test(text) ? 'Floral' :
                       /nature|tree|forest|mountain/.test(text) ? 'Nature' :
                       /architecture|building/.test(text) ? 'Architecture' : 'Other'
      metafields.push({
        namespace: 'custom',
        key: 'theme',
        value: themeName,
        type: 'single_line_text_field'
      })
    }
    
    return metafields
  }

  // ===========================================================================
  // MAIN LOGIC
  // ===========================================================================
  
  try {
    const searchTerm = (categoryName || 'paintings').toLowerCase().trim()
    const categoryId = CATEGORY_MAP[searchTerm] || CATEGORY_MAP['default']
    
    // Build metafields from product data
    const metafields = buildMetafields(title, description, categoryName)
    
    console.log(`Category: ${searchTerm} → ${categoryId}`)
    console.log(`Metafields: ${JSON.stringify(metafields)}`)

    // Update product with category AND metafields
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
            metafields(first: 10) {
              nodes {
                namespace
                key
                value
              }
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
            category: categoryId,
            metafields: metafields
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
        fullName: updatedProduct?.category?.fullName
      },
      metafieldsSet: metafields.map(m => `${m.key}: ${m.value}`),
      product: updatedProduct
    })

  } catch (error) {
    console.error('Taxonomy error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}
