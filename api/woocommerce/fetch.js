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

  const { credentials, endpoint = 'products' } = req.body

  if (!credentials) {
    return res.status(400).json({ error: 'Missing credentials' })
  }

  const { siteUrl, consumerKey, consumerSecret } = credentials

  if (!siteUrl || !consumerKey || !consumerSecret) {
    return res.status(400).json({ error: 'Missing WooCommerce credentials' })
  }

  try {
    const baseUrl = siteUrl.replace(/\/$/, '')
    
    // Use query param auth (same as original working code)
    const apiUrl = `${baseUrl}/wp-json/wc/v3/${endpoint}?per_page=100&consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`

    const response = await fetch(apiUrl)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('WooCommerce fetch failed:', response.status, errorText)
      return res.status(response.status).json({ 
        error: `WooCommerce API error: ${response.status}`,
        details: errorText
      })
    }

    const data = await response.json()
    return res.status(200).json(data)
  } catch (error) {
    console.error('WooCommerce fetch error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    })
  }
}
