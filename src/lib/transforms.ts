// Product transformation utilities
// Converts Commerce Hub products to external platform formats

import type { WooCommercePushPayload } from './woocommerce'
import {
  generateShopifyVariants,
  generateWooCommerceVariants,
  generateCommerceHubVariants,
  DEFAULT_TEMPLATE,
  STANDARD_TEMPLATE,
  PREMIUM_TEMPLATE,
  MINIMAL_TEMPLATE,
  type PricingTemplate,
  type ShopifyVariant as GeneratedShopifyVariant,
  type ShopifyOption as GeneratedShopifyOption,
} from './pricing-templates'

// Re-export pricing template utilities for convenience
export { 
  generateCommerceHubVariants,
  DEFAULT_TEMPLATE,
  STANDARD_TEMPLATE,
  PREMIUM_TEMPLATE,
  MINIMAL_TEMPLATE,
}
export type { PricingTemplate }

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
    id?: number
    title?: string
    price: string
    compare_at_price: string | null
    sku: string
    barcode?: string | null
    position?: number
    inventory_quantity: number
    inventory_management: string | null
    option1: string | null
    option2: string | null
    option3?: string | null
    weight?: number
    weight_unit?: string
  }[]
  // Shopify options (Color, Size, etc.)
  options?: {
    id?: number
    name: string
    position?: number
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
    requires_shipping?: boolean
    weight?: number
    weight_unit?: string
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
 * Transform options for variant generation
 */
export interface TransformOptions {
  /** Generate variants if product has none (default: true) */
  generateVariants?: boolean
  /** Pricing template to use (default: STANDARD_TEMPLATE) */
  pricingTemplate?: PricingTemplate
}

/**
 * Transform Commerce Hub product to WooCommerce format
 * @param product - Commerce Hub product from Supabase
 * @param categoryMap - Optional map of category names to WooCommerce IDs
 * @param options - Transform options for variant generation
 */
export function transformToWooCommerce(
  product: CommerceHubProduct,
  categoryMap?: WooCategoryMap,
  options: TransformOptions = {}
): WooCommercePushPayload {
  const { generateVariants: shouldGenerateVariants = true, pricingTemplate = STANDARD_TEMPLATE } = options
  
  // Map Commerce Hub status to WooCommerce status
  const statusMap: Record<string, string> = {
    active: 'publish',
    draft: 'draft',
    archived: 'private'
  }

  // Check if we need to generate variants
  const hasVariants = product.variants && product.variants.length > 0
  const hasAttributes = product.attributes && product.attributes.length > 0
  const isVariable = shouldGenerateVariants && !hasVariants && !hasAttributes && !product.is_digital

  const payload: WooCommercePushPayload = {
    name: product.title,
    type: isVariable ? 'variable' : (product.is_digital ? 'simple' : undefined),
    status: statusMap[product.status] || 'draft',
    description: product.description || '',
    short_description: product.artist 
      ? `By ${product.artist}` 
      : undefined,
    sku: product.sku || `CH-${product.id.slice(0, 8)}`,
  }

  // For variable products, don't set regular_price (it's set per variation)
  // For simple products, set the price
  if (!isVariable) {
    payload.regular_price = product.price.toFixed(2)
  }

  // Generate attributes for variable products
  if (isVariable) {
    const baseSku = product.sku || `CH-${product.id.slice(0, 8)}`
    const { attributes } = generateWooCommerceVariants(baseSku, pricingTemplate)
    payload.attributes = attributes
    // Note: Variations must be created via separate API calls after product creation
    // We'll store the variation data for the API to use
    payload._pendingVariations = generateWooCommerceVariants(baseSku, pricingTemplate).variations
  }

  // Pass through existing attributes if present
  if (hasAttributes && product.attributes) {
    payload.attributes = product.attributes.map(attr => ({
      id: attr.id,
      name: attr.name,
      position: attr.position ?? 0,
      visible: attr.visible ?? true,
      variation: attr.variation ?? false,
      options: attr.options
    }))
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
      imageUrl = `https://res.cloudinary.com/dh4qwuvuo/image/fetch/${encodeURIComponent(product.image_url)}.jpg`
    }
    
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

  // Handle digital downloads
  if (product.is_digital && product.digital_file_url) {
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
 * @param product - Commerce Hub product from Supabase
 * @param vendorName - Default vendor name if not set on product
 * @param shopifyTags - Optional tags string
 * @param options - Transform options for variant generation
 */
export function transformToShopify(
  product: CommerceHubProduct,
  vendorName: string = 'Commerce Hub',
  shopifyTags?: string,
  options: TransformOptions = {}
): ShopifyPushPayload {
  const { generateVariants: shouldGenerateVariants = true, pricingTemplate = STANDARD_TEMPLATE } = options
  
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

  // Build tags - fallback to artist-based tags if none provided
  let tags = shopifyTags || ''
  if (!tags && product.artist) {
    tags = `art, print, ${product.artist.toLowerCase()}`
  } else if (!tags) {
    tags = 'art, print'
  }
  if (product.is_digital && !tags.toLowerCase().includes('digital')) {
    tags = tags ? `${tags}, digital-download` : 'digital-download'
  }

  // Determine if we should generate variants
  const hasExistingVariants = product.variants && product.variants.length > 0
  const hasExistingOptions = product.options && product.options.length > 0
  const shouldGenerate = shouldGenerateVariants && !hasExistingVariants && !hasExistingOptions && !product.is_digital

  let variants: ShopifyPushPayload['variants']
  let productOptions: ShopifyPushPayload['options'] | undefined

  if (shouldGenerate) {
    // Generate new variants from pricing template
    const baseSku = product.sku || `CH-${product.id.slice(0, 8)}`
    const generated = generateShopifyVariants(baseSku, pricingTemplate)
    
    variants = generated.variants.map(v => ({
      price: v.price,
      compare_at_price: v.compare_at_price,
      sku: v.sku,
      inventory_quantity: v.inventory_quantity,
      inventory_management: v.inventory_management,
      option1: v.option1,
      option2: v.option2,
      requires_shipping: v.requires_shipping,
      weight: v.weight,
      weight_unit: v.weight_unit,
    }))
    
    productOptions = generated.options.map(opt => ({
      name: opt.name,
      values: opt.values,
    }))
  } else if (hasExistingVariants && product.variants) {
    // Pass through existing variants with their IDs (critical for updates!)
    variants = product.variants.map(v => ({
      id: v.id,
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
    
    // Also pass through existing options
    if (hasExistingOptions && product.options) {
      productOptions = product.options.map(opt => ({
        id: opt.id,
        name: opt.name,
        values: opt.values
      }))
    }
  } else {
    // Default single variant for simple products or digital downloads
    variants = [{
      price: product.price.toFixed(2),
      sku: product.sku || `CH-${product.id.slice(0, 8)}`,
      inventory_quantity: product.is_digital ? 999 : 100,
      inventory_management: product.is_digital ? null : 'shopify'
    }]
  }

  const payload: ShopifyPushPayload = {
    title: product.title,
    body_html: bodyHtml,
    vendor: product.vendor || vendorName,
    product_type: product.category || 'Art Print',
    tags,
    status: statusMap[product.status] || 'draft',
    variants
  }

  // Add options if we have them (either generated or existing)
  if (productOptions && productOptions.length > 0) {
    payload.options = productOptions
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
  categoryMap?: WooCategoryMap,
  options?: TransformOptions
): WooCommercePushPayload[] {
  return products.map(p => transformToWooCommerce(p, categoryMap, options))
}

export function transformBatchToShopify(
  products: CommerceHubProduct[],
  vendorName?: string,
  shopifyTags?: string,
  options?: TransformOptions
): ShopifyPushPayload[] {
  return products.map(p => transformToShopify(p, vendorName, shopifyTags, options))
}

/**
 * Escape HTML for safe embedding
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, char => map[char])
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

// ============================================
// GALLERY STORE TRANSFORMS
// ============================================

/**
 * Gallery Store Artwork structure (from Smithsonian JSON)
 */
export interface GalleryStoreArtwork {
  title: string
  artist: string
  year_created: string
  medium: string
  image: string
  museum: string
  location: string
  description: string
  accession_number: string
  smithsonian_id: string
  object_type: string
  dimensions: string
  credit_line: string
  created_date: string
  // Optional pricing override
  pricing_template?: 'standard' | 'premium' | 'minimal'
  tags?: string[]
}

/**
 * Cloudinary cloud name for image proxying
 */
const CLOUDINARY_CLOUD = 'dh4qwuvuo'

/**
 * Transform Gallery Store artwork to Commerce Hub product format
 * Now includes variant generation!
 * 
 * @param artwork - Gallery Store artwork from Smithsonian JSON
 * @param storeId - Store ID for the Gallery Store in Supabase
 * @param options - Transform options for variant generation
 * @returns Commerce Hub product ready for Supabase insert
 */
export function transformFromGalleryStore(
  artwork: GalleryStoreArtwork,
  storeId: string,
  options: TransformOptions = {}
): Omit<CommerceHubProduct, 'id'> & { options?: CommerceHubProduct['options'], variants?: CommerceHubProduct['variants'] } {
  const { generateVariants: shouldGenerateVariants = true } = options
  
  // Select pricing template based on artwork or use default
  let pricingTemplate: PricingTemplate
  switch (artwork.pricing_template) {
    case 'premium':
      pricingTemplate = PREMIUM_TEMPLATE
      break
    case 'minimal':
      pricingTemplate = MINIMAL_TEMPLATE
      break
    default:
      pricingTemplate = options.pricingTemplate || STANDARD_TEMPLATE
  }
  
  // Normalize artist name (handle "Last, First" format)
  const artistNormalized = normalizeArtistName(artwork.artist)
  
  // Generate SKU from smithsonian_id
  const sku = `GS-${artwork.smithsonian_id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`
  
  // Proxy Smithsonian images through Cloudinary for reliable loading
  const imageUrl = proxySmithsonianImage(artwork.image)
  
  // Build description with artwork metadata
  let description = artwork.description || ''
  if (artwork.medium && artwork.medium !== 'Mixed media') {
    description += `\n\nMedium: ${artwork.medium}`
  }
  if (artwork.year_created && artwork.year_created !== 'Date unknown') {
    description += `\nCreated: ${artwork.year_created}`
  }
  if (artwork.credit_line) {
    description += `\n\n${artwork.credit_line}`
  }

  // Generate variants if enabled
  let productOptions: CommerceHubProduct['options'] | undefined
  let productVariants: CommerceHubProduct['variants'] | undefined
  let basePrice = 49.99  // Default price for simple products
  let productType: 'simple' | 'variable' = 'simple'

  if (shouldGenerateVariants) {
    const generated = generateCommerceHubVariants(sku, pricingTemplate)
    productOptions = generated.options
    productVariants = generated.variants.map((v, index) => ({
      ...v,
      id: index + 1,  // Temporary ID, will be replaced by Shopify
      position: index + 1,
      barcode: null,
      inventory_management: null,
    }))
    basePrice = generated.lowestPrice  // Use lowest variant price as base
    productType = 'variable'
  }
  
  return {
    title: artwork.title,
    description: description.trim(),
    price: basePrice,
    artist: artistNormalized,
    vendor: artistNormalized,
    category: artwork.object_type || 'Art Print',
    image_url: imageUrl,
    sku: sku,
    status: 'active',
    store_id: storeId,
    product_type: productType,
    attributes: undefined,
    options: productOptions,
    variants: productVariants,
  }
}

/**
 * Transform batch of Gallery Store artworks
 */
export function transformBatchFromGalleryStore(
  artworks: GalleryStoreArtwork[],
  storeId: string,
  options?: TransformOptions
): (Omit<CommerceHubProduct, 'id'> & { options?: CommerceHubProduct['options'], variants?: CommerceHubProduct['variants'] })[] {
  return artworks.map(a => transformFromGalleryStore(a, storeId, options))
}

/**
 * Normalize artist name from "Last, First" to "First Last"
 */
function normalizeArtistName(artist: string): string {
  if (!artist) return 'Unknown Artist'
  
  // Check if in "Last, First" format
  if (artist.includes(', ')) {
    const parts = artist.split(', ')
    if (parts.length === 2) {
      return `${parts[1]} ${parts[0]}`
    }
  }
  
  return artist
}

/**
 * Proxy Smithsonian image URLs through Cloudinary
 * This solves CORS and format issues with ids.si.edu URLs
 */
function proxySmithsonianImage(imageUrl: string): string {
  if (!imageUrl) return ''
  
  // Only proxy Smithsonian URLs
  if (imageUrl.includes('ids.si.edu')) {
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD}/image/fetch/${encodeURIComponent(imageUrl)}.jpg`
  }
  
  return imageUrl
}

/**
 * Validate Gallery Store JSON structure
 */
export function validateGalleryStoreData(data: unknown): data is { 
  collection_info: { total_items: number }
  artworks: GalleryStoreArtwork[] 
} {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  
  if (!obj.artworks || !Array.isArray(obj.artworks)) return false
  if (obj.artworks.length === 0) return false
  
  // Check first artwork has required fields
  const first = obj.artworks[0] as Record<string, unknown>
  return typeof first.title === 'string' && 
         typeof first.artist === 'string' &&
         typeof first.image === 'string'
}
