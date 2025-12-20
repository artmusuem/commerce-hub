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

  const { credentials, productId, variationId, data } = req.body

  if (!credentials || !productId || !variationId || !data) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const { siteUrl, consumerKey, consumerSecret } = credentials

  if (!siteUrl || !consumerKey || !consumerSecret) {
    return res.status(400).json({ error: 'Missing WooCommerce credentials' })
  }

  try {
    const baseUrl = siteUrl.replace(/\/$/, '')
    const endpoint = `${baseUrl}/wp-json/wc/v3/products/${productId}/variations/${variationId}`

    // Build auth header (Basic Auth)
    const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${authString}`
      },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('WooCommerce variation update failed:', response.status, errorText)
      
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

    const variation = await response.json()
    
    return res.status(200).json(variation)
  } catch (error) {
    console.error('WooCommerce variation update error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    })
  }
}
