// WooCommerce Category API
// Creates categories in WooCommerce store

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { credentials, categoryName } = req.body

  if (!credentials?.siteUrl || !credentials?.consumerKey || !credentials?.consumerSecret) {
    return res.status(400).json({ error: 'Missing WooCommerce credentials' })
  }

  if (!categoryName) {
    return res.status(400).json({ error: 'Missing category name' })
  }

  try {
    const { siteUrl, consumerKey, consumerSecret } = credentials
    const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')
    
    // Create category in WooCommerce
    const response = await fetch(`${siteUrl}/wp-json/wc/v3/products/categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authString}`
      },
      body: JSON.stringify({
        name: categoryName
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('WooCommerce category create error:', response.status, errorText)
      
      // Check if category already exists (term_exists error)
      if (errorText.includes('term_exists')) {
        return res.status(409).json({ 
          error: 'Category already exists',
          details: errorText
        })
      }
      
      return res.status(response.status).json({ 
        error: `WooCommerce API error: ${response.status}`,
        details: errorText
      })
    }

    const category = await response.json()
    
    return res.status(200).json({
      id: category.id,
      name: category.name,
      slug: category.slug
    })

  } catch (error) {
    console.error('Category creation error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    })
  }
}
