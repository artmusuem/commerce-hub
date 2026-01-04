/**
 * Shopify GraphQL API Proxy
 *
 * Proxies GraphQL requests to Shopify Admin API
 * Used by shopify-push.ts for the 7-step sync process
 *
 * POST /api/shopify/graphql
 * Body: { shop, accessToken, query, variables }
 */

const SHOPIFY_API_VERSION = '2024-10'

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

  const { shop, accessToken, query, variables } = req.body

  // Validate required fields
  if (!shop) {
    return res.status(400).json({ error: 'Missing shop parameter' })
  }

  if (!accessToken) {
    return res.status(400).json({ error: 'Missing accessToken parameter' })
  }

  if (!query) {
    return res.status(400).json({ error: 'Missing query parameter' })
  }

  // Clean shop domain
  const cleanDomain = shop
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/\/admin.*$/, '')

  const graphqlUrl = `https://${cleanDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`

  try {
    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: variables || {}
      })
    })

    // Get response text first for debugging
    const responseText = await response.text()

    // Try to parse as JSON
    let data
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.error('Failed to parse Shopify response:', responseText.slice(0, 500))
      return res.status(502).json({
        error: 'Invalid response from Shopify',
        details: responseText.slice(0, 200)
      })
    }

    // Check for HTTP errors
    if (!response.ok) {
      console.error('Shopify GraphQL HTTP error:', response.status, data)
      return res.status(response.status).json({
        error: `Shopify API error: ${response.status}`,
        details: data
      })
    }

    // Check for GraphQL errors
    if (data.errors && data.errors.length > 0) {
      console.error('Shopify GraphQL errors:', JSON.stringify(data.errors, null, 2))

      // Still return 200 with errors - let client handle
      // Some mutations return partial success with errors
      return res.status(200).json(data)
    }

    // Check for user errors in mutations
    // These are validation errors, not GraphQL errors
    const hasUserErrors = checkForUserErrors(data.data)
    if (hasUserErrors) {
      console.warn('Shopify mutation user errors:', JSON.stringify(hasUserErrors, null, 2))
    }

    return res.status(200).json(data)

  } catch (error) {
    console.error('Shopify GraphQL proxy error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}

/**
 * Check for userErrors in mutation responses
 * Returns the errors if found, null otherwise
 */
function checkForUserErrors(data) {
  if (!data || typeof data !== 'object') return null

  for (const key of Object.keys(data)) {
    const value = data[key]
    if (!value || typeof value !== 'object') continue

    // Check for userErrors array
    if (Array.isArray(value.userErrors) && value.userErrors.length > 0) {
      return value.userErrors
    }

    // Check for mediaUserErrors array
    if (Array.isArray(value.mediaUserErrors) && value.mediaUserErrors.length > 0) {
      return value.mediaUserErrors
    }
  }

  return null
}
