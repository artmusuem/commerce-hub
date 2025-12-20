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

  const { credentials, productId } = req.body

  if (!credentials || !productId) {
    return res.status(400).json({ error: 'Missing credentials or productId' })
  }

  const { siteUrl, consumerKey, consumerSecret } = credentials

  if (!siteUrl || !consumerKey || !consumerSecret) {
    return res.status(400).json({ error: 'Missing WooCommerce credentials' })
  }

  try {
    const baseUrl = siteUrl.replace(/\/$/, '')
    const endpoint = `${baseUrl}/wp-json/wc/v3/products/${productId}/variations?per_page=100`

    // Build auth header (Basic Auth)
    const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authString}`
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('WooCommerce variations fetch failed:', response.status, errorText)
      
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

    const variations = await response.json()
    
    return res.status(200).json(variations)
  } catch (error) {
    console.error('WooCommerce variations fetch error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    })
  }
}
