// Vercel Serverless Function: WooCommerce Product Fetch
// Gets products from WooCommerce store

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { credentials, endpoint = 'products', params = {} } = req.body

  if (!credentials) {
    return res.status(400).json({ error: 'Missing credentials' })
  }

  const { siteUrl, consumerKey, consumerSecret } = credentials

  if (!siteUrl || !consumerKey || !consumerSecret) {
    return res.status(400).json({ error: 'Missing WooCommerce credentials' })
  }

  try {
    const baseUrl = siteUrl.replace(/\/$/, '')
    
    // Build query string
    const queryParams = new URLSearchParams({
      per_page: '100',
      ...params
    })

    const url = `${baseUrl}/wp-json/wc/v3/${endpoint}?${queryParams}`
    
    // Basic Auth
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

    console.log(`[WooCommerce] GET ${url}`)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`
      }
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`[WooCommerce] Error ${response.status}:`, text)
      return res.status(response.status).json({ 
        error: `WooCommerce error: ${response.status}`,
        details: text
      })
    }

    const data = await response.json()
    
    // Include pagination headers
    return res.status(200).json({
      data,
      total: response.headers.get('x-wp-total'),
      totalPages: response.headers.get('x-wp-totalpages')
    })

  } catch (error) {
    console.error('[WooCommerce] Fetch error:', error)
    return res.status(500).json({ 
      error: 'Server error',
      message: error.message
    })
  }
}
