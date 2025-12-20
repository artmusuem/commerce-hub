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

  const { shop, code } = req.body

  if (!shop || !code) {
    return res.status(400).json({ error: 'Missing shop or code parameter' })
  }

  const clientId = process.env.SHOPIFY_CLIENT_ID
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Shopify credentials not configured' })
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error('Shopify token exchange failed:', errorText)
      return res.status(400).json({ error: 'Failed to exchange code for token', details: errorText })
    }

    const tokenData = await tokenResponse.json()
    
    return res.status(200).json({
      access_token: tokenData.access_token,
      scope: tokenData.scope,
    })
  } catch (error) {
    console.error('Token exchange error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}