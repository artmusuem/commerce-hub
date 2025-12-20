// Vercel Serverless Function: WooCommerce Product Push
// Handles CREATE (POST) and UPDATE (PUT) based on existingProductId

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { credentials, product, existingProductId } = req.body

  if (!credentials || !product) {
    return res.status(400).json({ error: 'Missing credentials or product' })
  }

  const { siteUrl, consumerKey, consumerSecret } = credentials

  if (!siteUrl || !consumerKey || !consumerSecret) {
    return res.status(400).json({ error: 'Missing WooCommerce credentials' })
  }

  try {
    const baseUrl = siteUrl.replace(/\/$/, '')
    const isUpdate = !!existingProductId
    
    // Build endpoint - PUT for update, POST for create
    const endpoint = isUpdate
      ? `${baseUrl}/wp-json/wc/v3/products/${existingProductId}`
      : `${baseUrl}/wp-json/wc/v3/products`
    
    const method = isUpdate ? 'PUT' : 'POST'

    // Basic Auth header
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

    console.log(`[WooCommerce] ${method} ${endpoint}`)
    console.log(`[WooCommerce] Product:`, JSON.stringify(product, null, 2))

    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify(product)
    })

    const text = await response.text()
    
    if (!response.ok) {
      console.error(`[WooCommerce] Error ${response.status}:`, text)
      
      // Try to parse WooCommerce error
      try {
        const errorJson = JSON.parse(text)
        return res.status(response.status).json({ 
          error: errorJson.message || 'WooCommerce API error',
          code: errorJson.code,
          details: errorJson
        })
      } catch {
        return res.status(response.status).json({ 
          error: `WooCommerce error: ${response.status}`,
          details: text
        })
      }
    }

    const data = JSON.parse(text)
    console.log(`[WooCommerce] Success! Product ID: ${data.id}`)
    
    return res.status(200).json(data)

  } catch (error) {
    console.error('[WooCommerce] Push error:', error)
    return res.status(500).json({ 
      error: 'Server error',
      message: error.message
    })
  }
}
