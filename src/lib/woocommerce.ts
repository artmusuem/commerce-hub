// WooCommerce API utilities

export interface WooCommerceProduct {
  id: number
  name: string
  slug: string
  type: string
  status: string
  description: string
  short_description: string
  sku: string
  price: string
  regular_price: string
  images: { id?: number; src: string; alt?: string }[]
  categories: { id: number; name?: string }[]
}

export interface WooCommerceCredentials {
  siteUrl: string
  consumerKey: string
  consumerSecret: string
}

export interface WooCommercePushPayload {
  name: string
  type?: string
  status?: string
  regular_price: string
  description?: string
  short_description?: string
  sku?: string
  images?: { src: string; alt?: string }[]
  categories?: { id: number }[]
}

/**
 * Push a product to WooCommerce store
 * Note: This goes through our serverless function to avoid CORS
 */
export async function pushProductToWooCommerce(
  credentials: WooCommerceCredentials,
  product: WooCommercePushPayload,
  existingProductId?: number
): Promise<WooCommerceProduct> {
  const response = await fetch('/api/woocommerce/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentials,
      product,
      existingProductId
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`WooCommerce API error: ${error}`)
  }

  return response.json()
}

/**
 * Fetch products from WooCommerce
 * Note: This goes through our serverless function to avoid CORS
 */
export async function fetchWooCommerceProducts(
  credentials: WooCommerceCredentials
): Promise<WooCommerceProduct[]> {
  const response = await fetch('/api/woocommerce/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentials,
      endpoint: 'products'
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    if (response.status === 401) {
      throw new Error('Invalid API credentials')
    }
    throw new Error(errorData.error || `WooCommerce API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Get WooCommerce categories
 * Note: This goes through our serverless function to avoid CORS
 */
export async function fetchWooCommerceCategories(
  credentials: WooCommerceCredentials
): Promise<{ id: number; name: string }[]> {
  const response = await fetch('/api/woocommerce/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentials,
      endpoint: 'products/categories'
    })
  })

  if (!response.ok) {
    return []
  }

  return response.json()
}
