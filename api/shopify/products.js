// Shopify Products API Proxy
// Handles CORS and keeps access token secure

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { shop, accessToken, action } = req.body

  if (!shop || !accessToken) {
    return res.status(400).json({ error: 'Missing shop or accessToken' })
  }

  const cleanDomain = shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const baseUrl = `https://${cleanDomain}/admin/api/2024-01`

  try {
    if (action === 'fetch') {
      // Fetch products
      const response = await fetch(`${baseUrl}/products.json?limit=250`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Shopify API error:', response.status, errorText)
        return res.status(response.status).json({ 
          error: `Shopify API error: ${response.status}`,
          details: errorText
        })
      }

      const data = await response.json()
      return res.status(200).json(data)
    }

    if (action === 'create') {
      // Create product
      const { product } = req.body
      
      const response = await fetch(`${baseUrl}/products.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ product })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Shopify create error:', response.status, errorText)
        return res.status(response.status).json({ 
          error: `Shopify API error: ${response.status}`,
          details: errorText
        })
      }

      const data = await response.json()
      return res.status(200).json(data)
    }

    if (action === 'update') {
      // Update product
      const { productId, product } = req.body
      
      const response = await fetch(`${baseUrl}/products/${productId}.json`, {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ product })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Shopify update error:', response.status, errorText)
        return res.status(response.status).json({ 
          error: `Shopify API error: ${response.status}`,
          details: errorText
        })
      }

      const data = await response.json()
      return res.status(200).json(data)
    }

    return res.status(400).json({ error: 'Invalid action' })

  } catch (error) {
    console.error('Shopify proxy error:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message
    })
  }
}
