// Shopify API utilities
const SHOPIFY_CLIENT_ID = '4a7cdbc57f846a3e0b2e66d1037801e0'
const REDIRECT_URI = `${window.location.origin}/auth/shopify/callback`
const SCOPES = 'read_products,write_products,read_inventory,write_inventory'

export interface ShopifyProduct {
  tags?: string
  id: number
  title: string
  body_html: string
  vendor: string
  product_type: string
  handle: string
  status: string
  variants: ShopifyVariant[]
  images: ShopifyImage[]
}

export interface ShopifyVariant {
  id: number
  product_id: number
  title: string
  price: string
  sku: string
  inventory_quantity: number
}

export interface ShopifyImage {
  id: number
  product_id: number
  src: string
  alt: string | null
}

// Generate OAuth URL for Shopify
export function getShopifyAuthUrl(shopDomain: string): string {
  const state = crypto.randomUUID()
  sessionStorage.setItem('shopify_oauth_state', state)
  sessionStorage.setItem('shopify_shop_domain', shopDomain)
  
  // Ensure shop domain is properly formatted
  const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  
  const params = new URLSearchParams({
    client_id: SHOPIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state: state,
  })
  
  return `https://${cleanDomain}/admin/oauth/authorize?${params.toString()}`
}

// Exchange authorization code for access token
export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<{ access_token: string; scope: string }> {
  // This needs to go through a backend to keep client secret secure
  // For now, we'll use Supabase Edge Function or direct call
  const response = await fetch('/api/shopify/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop, code })
  })
  
  if (!response.ok) {
    throw new Error('Failed to exchange code for token')
  }
  
  return response.json()
}

// Fetch products from Shopify store
export async function fetchShopifyProducts(
  shopDomain: string,
  accessToken: string
): Promise<ShopifyProduct[]> {
  const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  
  const response = await fetch(
    `https://${cleanDomain}/admin/api/2024-01/products.json?limit=250`,
    {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    }
  )
  
  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`)
  }
  
  const data = await response.json()
  return data.products
}

// Push product to Shopify
export async function pushProductToShopify(
  shopDomain: string,
  accessToken: string,
  product: {
    title: string
    body_html?: string
    vendor?: string
    product_type?: string
    variants?: { price: string; sku?: string }[]
    images?: { src: string }[]
  }
): Promise<ShopifyProduct> {
  const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  
  const response = await fetch(
    `https://${cleanDomain}/admin/api/2024-01/products.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ product })
    }
  )
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Shopify API error: ${error}`)
  }
  
  const data = await response.json()
  return data.product
}

// Validate HMAC for OAuth callback (simplified - full validation should be server-side)
export function validateOAuthState(state: string): boolean {
  const savedState = sessionStorage.getItem('shopify_oauth_state')
  return savedState === state
}

export function getSavedShopDomain(): string | null {
  return sessionStorage.getItem('shopify_shop_domain')
}

export function clearOAuthSession(): void {
  sessionStorage.removeItem('shopify_oauth_state')
  sessionStorage.removeItem('shopify_shop_domain')
}