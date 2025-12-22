// Shopify Variant Update API
// Updates individual variant price, SKU, or inventory

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

  const { shop, accessToken, variantId, updates } = req.body

  if (!shop || !accessToken || !variantId) {
    return res.status(400).json({ error: 'Missing shop, accessToken, or variantId' })
  }

  const cleanDomain = shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const baseUrl = `https://${cleanDomain}/admin/api/2024-01`

  try {
    // Update variant
    const response = await fetch(`${baseUrl}/variants/${variantId}.json`, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        variant: {
          id: variantId,
          ...updates
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Shopify variant update error:', response.status, errorText)
      return res.status(response.status).json({ 
        error: `Shopify API error: ${response.status}`,
        details: errorText
      })
    }

    const data = await response.json()
    return res.status(200).json(data)

  } catch (error) {
    console.error('Shopify variant proxy error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    })
  }
}
