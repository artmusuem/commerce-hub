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
 * Note: This goes through our serverless function to keep secrets secure
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
 */
export async function fetchWooCommerceProducts(
  credentials: WooCommerceCredentials
): Promise<WooCommerceProduct[]> {
  const { siteUrl, consumerKey, consumerSecret } = credentials
  const baseUrl = siteUrl.replace(/\/$/, '')
  const apiUrl = `${baseUrl}/wp-json/wc/v3/products?per_page=100&consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`

  const response = await fetch(apiUrl)

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid API credentials')
    }
    throw new Error(`WooCommerce API error: ${response.status}`)
  }

  return response.json()
}

/**
 * Get WooCommerce categories
 */
export async function fetchWooCommerceCategories(
  credentials: WooCommerceCredentials
): Promise<{ id: number; name: string }[]> {
  const { siteUrl, consumerKey, consumerSecret } = credentials
  const baseUrl = siteUrl.replace(/\/$/, '')
  const apiUrl = `${baseUrl}/wp-json/wc/v3/products/categories?per_page=100&consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`

  const response = await fetch(apiUrl)

  if (!response.ok) {
    return []
  }

  return response.json()
}
