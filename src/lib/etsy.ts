const ETSY_API_KEY = import.meta.env.VITE_ETSY_API_KEY

// Generate random string for PKCE
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Generate code challenge from verifier (SHA256 + base64url)
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Scopes we need for inventory management
const ETSY_SCOPES = [
  'listings_r',    // Read listings
  'listings_w',    // Write listings
  'listings_d',    // Delete listings
  'shops_r',       // Read shop info
  'shops_w',       // Write shop info
  'transactions_r' // Read orders
].join('%20')

export async function initiateEtsyOAuth(): Promise<void> {
  const codeVerifier = generateRandomString(64)
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = generateRandomString(16)

  // Store for callback
  sessionStorage.setItem('etsy_code_verifier', codeVerifier)
  sessionStorage.setItem('etsy_oauth_state', state)

  const redirectUri = `${window.location.origin}/stores/etsy/callback`
  
  const authUrl = new URL('https://www.etsy.com/oauth/connect')
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', ETSY_API_KEY)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', ETSY_SCOPES)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')

  window.location.href = authUrl.toString()
}

export async function exchangeCodeForToken(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
  user_id: number
}> {
  const codeVerifier = sessionStorage.getItem('etsy_code_verifier')
  if (!codeVerifier) throw new Error('Missing code verifier')

  const redirectUri = `${window.location.origin}/stores/etsy/callback`

  // Call our serverless function to exchange the code
  const response = await fetch('/api/etsy/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier, redirectUri })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Failed to exchange token')
  }

  // Clear session storage
  sessionStorage.removeItem('etsy_code_verifier')
  sessionStorage.removeItem('etsy_oauth_state')

  return response.json()
}

export async function getEtsyShop(accessToken: string): Promise<{
  shop_id: number
  shop_name: string
  user_id: number
}> {
  const response = await fetch('https://openapi.etsy.com/v3/application/users/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-api-key': ETSY_API_KEY
    }
  })

  if (!response.ok) throw new Error('Failed to fetch user info')
  const user = await response.json()

  // Get shop info
  const shopResponse = await fetch(`https://openapi.etsy.com/v3/application/users/${user.user_id}/shops`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'x-api-key': ETSY_API_KEY
    }
  })

  if (!shopResponse.ok) throw new Error('Failed to fetch shop info')
  const shops = await shopResponse.json()

  return {
    shop_id: shops.results[0]?.shop_id,
    shop_name: shops.results[0]?.shop_name,
    user_id: user.user_id
  }
}

export async function getEtsyListings(accessToken: string, shopId: number): Promise<any[]> {
  const response = await fetch(
    `https://openapi.etsy.com/v3/application/shops/${shopId}/listings?state=active&limit=100`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'x-api-key': ETSY_API_KEY
      }
    }
  )

  if (!response.ok) throw new Error('Failed to fetch listings')
  const data = await response.json()
  return data.results || []
}
