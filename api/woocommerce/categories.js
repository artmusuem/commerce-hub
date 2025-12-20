// Vercel Serverless Function: Get WooCommerce Categories
// Simple endpoint to get category list for mapping

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { credentials } = req.body

  if (!credentials) {
    return res.status(400).json({ error: 'Missing credentials' })
  }

  const { siteUrl, consumerKey, consumerSecret } = credentials

  try {
    const baseUrl = siteUrl.replace(/\/$/, '')
    const url = `${baseUrl}/wp-json/wc/v3/products/categories?per_page=100`
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

    const response = await fetch(url, {
      headers: { 'Authorization': `Basic ${auth}` }
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch categories' })
    }

    const categories = await response.json()
    
    // Return simplified list: { id, name, slug }
    return res.status(200).json(
      categories.map(c => ({ id: c.id, name: c.name, slug: c.slug }))
    )

  } catch (error) {
    console.error('[WooCommerce] Categories error:', error)
    return res.status(500).json({ error: error.message })
  }
}
