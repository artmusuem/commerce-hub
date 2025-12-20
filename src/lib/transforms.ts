// Product transformation utilities
// Converts Commerce Hub products to external platform formats

import type { WooCommercePushPayload } from './woocommerce'

/**
 * Commerce Hub product structure (from Supabase)
 */
export interface CommerceHubProduct {
  id: string
  title: string
  description: string | null
  price: number
  artist: string | null
  category: string | null
  image_url: string | null
  sku: string | null
  status: 'draft' | 'active' | 'archived'
  store_id?: string
}

/**
 * Shopify product push payload
 */
export interface ShopifyPushPayload {
  title: string
  body_html: string
  vendor: string
  product_type: string
  status: 'active' | 'draft' | 'archived'
  variants: {
    price: string
    sku?: string
    inventory_quantity?: number
    inventory_management?: string
  }[]
  images?: { src: string; alt?: string }[]
}

/**
 * Transform Commerce Hub product to WooCommerce format
 */
export function transformToWooCommerce(
  product: CommerceHubProduct
): WooCommercePushPayload {
  // Map Commerce Hub status to WooCommerce status
  const statusMap: Record<string, string> = {
    active: 'publish',
    draft: 'draft',
    archived: 'private'
  }

  const payload: WooCommercePushPayload = {
    name: product.title,
    type: 'simple',
    status: statusMap[product.status] || 'draft',
    regular_price: product.price.toFixed(2),
    description: product.description || '',
    short_description: product.artist 
      ? `By ${product.artist}` 
      : undefined,
    sku: product.sku || `CH-${product.id.slice(0, 8)}`,
  }

  // Add image if present
  if (product.image_url) {
    payload.images = [{
      src: product.image_url,
      alt: product.title
    }]
  }

  return payload
}

/**
 * Transform Commerce Hub product to Shopify format
 */
export function transformToShopify(
  product: CommerceHubProduct,
  vendorName: string = 'Commerce Hub'
): ShopifyPushPayload {
  // Map Commerce Hub status to Shopify status
  const statusMap: Record<string, 'active' | 'draft' | 'archived'> = {
    active: 'active',
    draft: 'draft',
    archived: 'archived'
  }

  // Build HTML description
  let bodyHtml = ''
  if (product.description) {
    bodyHtml += `<p>${escapeHtml(product.description)}</p>`
  }
  if (product.artist) {
    bodyHtml += `<p><strong>Artist:</strong> ${escapeHtml(product.artist)}</p>`
  }

  const payload: ShopifyPushPayload = {
    title: product.title,
    body_html: bodyHtml,
    vendor: vendorName,
    product_type: product.category || 'Art Print',
    status: statusMap[product.status] || 'draft',
    variants: [{
      price: product.price.toFixed(2),
      sku: product.sku || `CH-${product.id.slice(0, 8)}`,
      inventory_quantity: 100,
      inventory_management: 'shopify'
    }]
  }

  // Add image if present
  if (product.image_url) {
    payload.images = [{
      src: product.image_url,
      alt: product.title
    }]
  }

  return payload
}

/**
 * Transform Commerce Hub products in bulk
 */
export function transformBatchToWooCommerce(
  products: CommerceHubProduct[]
): WooCommercePushPayload[] {
  return products.map(p => transformToWooCommerce(p))
}

export function transformBatchToShopify(
  products: CommerceHubProduct[],
  vendorName?: string
): ShopifyPushPayload[] {
  return products.map(p => transformToShopify(p, vendorName))
}

/**
 * Escape HTML for safe embedding
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Get push status summary
 */
export interface PushResult {
  success: boolean
  productId: string
  externalId?: string | number
  error?: string
  platform: 'woocommerce' | 'shopify'
}

export function summarizePushResults(results: PushResult[]): {
  total: number
  succeeded: number
  failed: number
  errors: string[]
} {
  const succeeded = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const errors = results
    .filter(r => !r.success && r.error)
    .map(r => `${r.productId}: ${r.error}`)

  return { total: results.length, succeeded, failed, errors }
}
