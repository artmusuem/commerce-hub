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

  const { code, codeVerifier, redirectUri } = req.body

  if (!code || !codeVerifier || !redirectUri) {
    return res.status(400).json({ error: 'Missing required parameters' })
  }

  const ETSY_API_KEY = process.env.VITE_ETSY_API_KEY
  const ETSY_SHARED_SECRET = process.env.ETSY_SHARED_SECRET

  if (!ETSY_API_KEY || !ETSY_SHARED_SECRET) {
    return res.status(500).json({ error: 'Server configuration error' })
  }

  try {
    const tokenResponse = await fetch('https://api.etsy.com/v3/public/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: ETSY_API_KEY,
        redirect_uri: redirectUri,
        code: code,
        code_verifier: codeVerifier
      })
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error('Etsy token error:', errorData)
      return res.status(400).json({ 
        error: 'Token exchange failed', 
        details: errorData 
      })
    }

    const tokens = await tokenResponse.json()
    return res.status(200).json(tokens)
  } catch (error) {
    console.error('Token exchange error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
