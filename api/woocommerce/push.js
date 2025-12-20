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

  const { credentials, product, existingProductId } = req.body

  if (!credentials || !product) {
    return res.status(400).json({ error: 'Missing credentials or product data' })
  }

  const { siteUrl, consumerKey, consumerSecret } = credentials

  if (!siteUrl || !consumerKey || !consumerSecret) {
    return res.status(400).json({ error: 'Missing WooCommerce credentials' })
  }

  try {
    const baseUrl = siteUrl.replace(/\/$/, '')
    
    // Determine if creating or updating
    const isUpdate = !!existingProductId
    const endpoint = isUpdate
      ? `${baseUrl}/wp-json/wc/v3/products/${existingProductId}`
      : `${baseUrl}/wp-json/wc/v3/products`
    
    const method = isUpdate ? 'PUT' : 'POST'

    // Build auth header (Basic Auth)
    const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authString}`
      },
      body: JSON.stringify(product)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('WooCommerce push failed:', response.status, errorText)
      
      // Parse WooCommerce error if JSON
      try {
        const errorJson = JSON.parse(errorText)
        return res.status(response.status).json({ 
          error: errorJson.message || 'WooCommerce API error',
          details: errorJson
        })
      } catch {
        return res.status(response.status).json({ 
          error: `WooCommerce API error: ${response.status}`,
          details: errorText
        })
      }
    }

    const data = await response.json()
    
    return res.status(200).json(data)
  } catch (error) {
    console.error('WooCommerce push error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    })
  }
}
