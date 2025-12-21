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
  product_type?: 'simple' | 'variable' | 'grouped' | 'external'
  attributes?: {
    id?: number
    name: string
    position?: number
    visible?: boolean
    variation?: boolean
    options: string[]
  }[]
  // Digital download fields
  is_digital?: boolean
  digital_file_url?: string | null
  digital_file_name?: string | null
  download_limit?: number
  download_expiry?: number
}

/**
 * Shopify product push payload
 */
export interface ShopifyPushPayload {
  title: string
  body_html: string
  vendor: string
  product_type: string
  tags?: string
  status: 'active' | 'draft' | 'archived'
  variants: {
    price: string
    sku?: string
    inventory_quantity?: number
    inventory_management?: string | null
  }[]
  images?: { src: string; alt?: string }[]
}

/**
 * WooCommerce category map: name (lowercase) → category ID
 */
export type WooCategoryMap = Record<string, number>

/**
 * Transform Commerce Hub product to WooCommerce format
 * @param product - Commerce Hub product from Supabase
 * @param categoryMap - Optional map of category names to WooCommerce IDs
 */
export function transformToWooCommerce(
  product: CommerceHubProduct,
  categoryMap?: WooCategoryMap
): WooCommercePushPayload {
  // Map Commerce Hub status to WooCommerce status
  const statusMap: Record<string, string> = {
    active: 'publish',
    draft: 'draft',
    archived: 'private'
  }

  const payload: WooCommercePushPayload = {
    name: product.title,
    // Don't send type - let WooCommerce keep original on update, default to simple on create
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

  // Map category name to WooCommerce category ID
  if (product.category && categoryMap) {
    const categoryId = categoryMap[product.category.toLowerCase()]
    if (categoryId) {
      payload.categories = [{ id: categoryId }]
    }
  }

  // Pass through attributes if present
  if (product.attributes && product.attributes.length > 0) {
    payload.attributes = product.attributes.map(attr => ({
      id: attr.id,
      name: attr.name,
      position: attr.position ?? 0,
      visible: attr.visible ?? true,
      variation: attr.variation ?? false,
      options: attr.options
    }))
  }

  // Handle digital downloads
  if (product.is_digital && product.digital_file_url) {
    payload.downloadable = true
    payload.virtual = true
    payload.downloads = [{
      name: product.digital_file_name || 'Download',
      file: product.digital_file_url
    }]
    payload.download_limit = product.download_limit ?? -1
    payload.download_expiry = product.download_expiry ?? -1
  }

  return payload
}

/**
 * Transform Commerce Hub product to Shopify format
 */
export function transformToShopify(
  product: CommerceHubProduct,
  vendorName: string = 'Commerce Hub',
  shopifyTags?: string
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
  
  // Add digital download notice if applicable
  if (product.is_digital) {
    bodyHtml += `<p><strong>📥 Digital Download:</strong> You will receive a download link after purchase.</p>`
  }

  // Build tags - include 'digital-download' tag for digital products
  let tags = shopifyTags || ''
  if (product.is_digital && !tags.toLowerCase().includes('digital')) {
    tags = tags ? `${tags}, digital-download` : 'digital-download'
  }

  const payload: ShopifyPushPayload = {
    title: product.title,
    body_html: bodyHtml,
    vendor: vendorName,
    product_type: product.category || 'Art Print',
    tags,
    status: statusMap[product.status] || 'draft',
    variants: [{
      price: product.price.toFixed(2),
      sku: product.sku || `CH-${product.id.slice(0, 8)}`,
      // Digital products don't need inventory tracking
      inventory_quantity: product.is_digital ? 999 : 100,
      inventory_management: product.is_digital ? null : 'shopify'
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
  products: CommerceHubProduct[],
  categoryMap?: WooCategoryMap
): WooCommercePushPayload[] {
  return products.map(p => transformToWooCommerce(p, categoryMap))
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
