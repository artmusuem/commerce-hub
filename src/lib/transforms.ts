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
  vendor?: string | null  // Shopify vendor field
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
  // Shopify variants (JSONB from database)
  variants?: {
    id: number
    title: string
    price: string
    compare_at_price: string | null
    sku: string
    barcode: string | null
    position: number
    inventory_quantity: number
    inventory_management: string | null
    option1: string | null
    option2: string | null
    option3: string | null
  }[]
  // Shopify options (Color, Size, etc.)
  options?: {
    id: number
    name: string
    position: number
    values: string[]
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
    id?: number  // Include ID for updates (Shopify needs this to update existing variants)
    price: string
    compare_at_price?: string | null
    sku?: string
    barcode?: string | null
    inventory_quantity?: number
    inventory_management?: string | null
    option1?: string | null
    option2?: string | null
    option3?: string | null
  }[]
  options?: {
    id?: number
    name: string
    values: string[]
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
  // For URLs without proper extensions (like Smithsonian), use Cloudinary fetch
  if (product.image_url) {
    const url = product.image_url.toLowerCase()
    const hasValidExtension = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url) || 
                              url.includes('cdn.shopify.com') ||
                              url.includes('cloudinary.com')
    
    let imageUrl = product.image_url
    
    // Use Cloudinary fetch proxy for URLs that WooCommerce can't process directly
    if (!hasValidExtension && url.includes('ids.si.edu')) {
      // Cloudinary fetch: proxies any URL and serves with proper headers
      // URL must be encoded for Cloudinary to fetch it correctly
      // Append .jpg so WooCommerce accepts the URL (it checks for file extension)
      imageUrl = `https://res.cloudinary.com/dh4qwuvuo/image/fetch/${encodeURIComponent(product.image_url)}.jpg`
    }
    
    // Only add image if we have a valid URL (original or proxied)
    if (hasValidExtension || url.includes('ids.si.edu')) {
      payload.images = [{
        src: imageUrl,
        alt: product.title
      }]
    }
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
    // Digital products must be simple type (not variable)
    payload.type = 'simple'
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

  // Build variants - preserve existing variants if present, otherwise create default
  let variants: ShopifyPushPayload['variants']
  
  if (product.variants && product.variants.length > 0) {
    // Pass through existing variants with their IDs (critical for updates!)
    variants = product.variants.map(v => ({
      id: v.id,  // Include ID so Shopify updates existing variants instead of replacing
      price: v.price,
      compare_at_price: v.compare_at_price,
      sku: v.sku || undefined,
      barcode: v.barcode,
      inventory_quantity: v.inventory_quantity,
      inventory_management: v.inventory_management,
      option1: v.option1,
      option2: v.option2,
      option3: v.option3
    }))
  } else {
    // Default single variant for simple products
    variants = [{
      price: product.price.toFixed(2),
      sku: product.sku || `CH-${product.id.slice(0, 8)}`,
      // Digital products don't need inventory tracking
      inventory_quantity: product.is_digital ? 999 : 100,
      inventory_management: product.is_digital ? null : 'shopify'
    }]
  }

  const payload: ShopifyPushPayload = {
    title: product.title,
    body_html: bodyHtml,
    vendor: product.vendor || vendorName,  // Use product's vendor if set
    product_type: product.category || 'Art Print',
    tags,
    status: statusMap[product.status] || 'draft',
    variants
  }

  // Add options if present (Color, Size, etc.)
  if (product.options && product.options.length > 0) {
    payload.options = product.options.map(opt => ({
      id: opt.id,
      name: opt.name,
      values: opt.values
    }))
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
