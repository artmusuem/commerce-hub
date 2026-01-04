// Product transformation utilities - Pure pass-through, no variant generation
import type { WooCommercePushPayload } from './woocommerce'

export interface CommerceHubProduct {
  id: string
  title: string
  description: string | null
  price: number
  artist: string | null
  vendor?: string | null
  category: string | null
  image_url: string | null
  sku: string | null
  status: 'draft' | 'active' | 'archived'
  store_id?: string
  external_id?: string
  platform_ids?: Record<string, string>
  product_type?: 'simple' | 'variable'
  tags?: string[]
  attributes?: { id?: number; name: string; position?: number; visible?: boolean; variation?: boolean; options: string[] }[]
  variants?: { id?: number; price: string; compare_at_price: string | null; sku: string; barcode?: string | null; position?: number; inventory_quantity: number; inventory_management: string | null; option1: string | null; option2: string | null; option3?: string | null }[]
  options?: { id?: number; name: string; position?: number; values: string[] }[]
  is_digital?: boolean
  digital_file_url?: string | null
  digital_file_name?: string | null
  download_limit?: number
  download_expiry?: number
}

export interface ShopifyPushPayload {
  title: string
  body_html: string
  vendor: string
  product_type: string
  tags?: string
  status: 'active' | 'draft' | 'archived'
  variants?: { id?: number; price: string; compare_at_price?: string | null; sku?: string; barcode?: string | null; inventory_quantity?: number; inventory_management?: string | null; option1?: string | null; option2?: string | null; option3?: string | null }[]
  options?: { id?: number; name: string; values: string[] }[]
  images?: { src: string; alt?: string }[]
}

export type WooCategoryMap = Record<string, number>

export interface PushResult {
  success: boolean
  productId: string
  externalId?: string | number
  error?: string
}

export interface GalleryStoreArtwork {
  smithsonian_id: string
  title: string
  artist: string
  description?: string
  image: string
  medium?: string
  year_created?: string
  credit_line?: string
  object_type?: string
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
  return text.replace(/[&<>"']/g, char => map[char])
}

function normalizeArtistName(artist: string): string {
  if (!artist) return ''
  if (artist.includes(',')) {
    const [last, first] = artist.split(',').map(s => s.trim())
    return `${first} ${last}`
  }
  return artist
}

function proxySmithsonianImage(url: string): string {
  if (!url) return ''
  if (url.includes('ids.si.edu')) {
    return `https://res.cloudinary.com/dh4qwuvuo/image/fetch/${encodeURIComponent(url)}.jpg`
  }
  return url
}

export function transformToWooCommerce(product: CommerceHubProduct, categoryMap?: WooCategoryMap): WooCommercePushPayload {
  const statusMap: Record<string, string> = { active: 'publish', draft: 'draft', archived: 'private' }
  const hasVariants = product.variants && product.variants.length > 1
  const hasAttributes = product.attributes && product.attributes.length > 0
  const isVariable = hasVariants || hasAttributes

  const payload: WooCommercePushPayload = {
    name: product.title,
    type: isVariable ? 'variable' : (product.is_digital ? 'simple' : undefined),
    status: statusMap[product.status] || 'draft',
    description: product.description || '',
    short_description: product.artist ? `By ${product.artist}` : undefined,
    sku: product.sku || undefined,
    regular_price: isVariable ? undefined : product.price.toFixed(2),
  }

  if (hasAttributes && product.attributes) {
    payload.attributes = product.attributes.map(attr => ({
      id: attr.id, name: attr.name, position: attr.position ?? 0, visible: attr.visible ?? true, variation: attr.variation ?? false, options: attr.options
    }))
  }

  if (product.image_url) {
    let imageUrl = product.image_url
    if (product.image_url.includes('ids.si.edu')) {
      imageUrl = `https://res.cloudinary.com/dh4qwuvuo/image/fetch/${encodeURIComponent(product.image_url)}.jpg`
    }
    payload.images = [{ src: imageUrl, alt: product.title }]
  }

  if (product.category && categoryMap) {
    const categoryId = categoryMap[product.category.toLowerCase()]
    if (categoryId) payload.categories = [{ id: categoryId }]
  }

  if (product.is_digital) {
    payload.type = 'simple'
    payload.downloadable = true
    payload.virtual = true
    if (product.digital_file_url) {
      payload.downloads = [{ name: product.digital_file_name || 'Download', file: product.digital_file_url }]
    }
    payload.download_limit = product.download_limit ?? -1
    payload.download_expiry = product.download_expiry ?? -1
  }

  return payload
}

export function transformToShopify(product: CommerceHubProduct, vendorName: string = 'Commerce Hub', shopifyTags?: string): ShopifyPushPayload {
  const statusMap: Record<string, 'active' | 'draft' | 'archived'> = { active: 'active', draft: 'draft', archived: 'archived' }

  let bodyHtml = ''
  if (product.description) bodyHtml += `<p>${escapeHtml(product.description)}</p>`
  if (product.artist) bodyHtml += `<p><strong>Artist:</strong> ${escapeHtml(product.artist)}</p>`
  if (product.is_digital) bodyHtml += `<p><strong>📥 Digital Download</strong></p>`

  let tags = shopifyTags || ''
  if (!tags && product.tags?.length) tags = product.tags.join(', ')
  else if (!tags && product.artist) tags = `art, ${product.artist.toLowerCase()}`
  if (product.is_digital && !tags.includes('digital')) tags = tags ? `${tags}, digital-download` : 'digital-download'

  let variants: ShopifyPushPayload['variants']
  let options: ShopifyPushPayload['options'] | undefined

  if (product.variants && product.variants.length > 0) {
    variants = product.variants.map(v => ({
      id: v.id, price: v.price, compare_at_price: v.compare_at_price, sku: v.sku || undefined, barcode: v.barcode,
      inventory_quantity: v.inventory_quantity, inventory_management: v.inventory_management, option1: v.option1, option2: v.option2, option3: v.option3
    }))
    if (product.options?.length) {
      options = product.options.map(opt => ({ id: opt.id, name: opt.name, values: opt.values }))
    }
  } else {
    variants = [{ price: product.price.toFixed(2), sku: product.sku || undefined, inventory_quantity: product.is_digital ? 999 : 100, inventory_management: product.is_digital ? null : 'shopify' }]
  }

  const payload: ShopifyPushPayload = {
    title: product.title, body_html: bodyHtml, vendor: product.vendor || vendorName, product_type: product.category || 'General',
    tags, status: statusMap[product.status] || 'draft', variants,
  }
  if (options?.length) payload.options = options
  if (product.image_url) payload.images = [{ src: product.image_url, alt: product.title }]

  return payload
}

export function transformBatchToWooCommerce(products: CommerceHubProduct[], categoryMap?: WooCategoryMap): WooCommercePushPayload[] {
  return products.map(p => transformToWooCommerce(p, categoryMap))
}

export function transformBatchToShopify(products: CommerceHubProduct[], vendorName?: string, shopifyTags?: string): ShopifyPushPayload[] {
  return products.map(p => transformToShopify(p, vendorName, shopifyTags))
}

export function summarizePushResults(results: PushResult[]): { total: number; succeeded: number; failed: number; errors: string[] } {
  const succeeded = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const errors = results.filter(r => !r.success && r.error).map(r => `${r.productId}: ${r.error}`)
  return { total: results.length, succeeded, failed, errors }
}

export function transformFromGalleryStore(artwork: GalleryStoreArtwork, storeId: string): Omit<CommerceHubProduct, 'id'> {
  const artistNormalized = normalizeArtistName(artwork.artist)
  const sku = `GS-${artwork.smithsonian_id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`
  const imageUrl = proxySmithsonianImage(artwork.image)

  let description = artwork.description || ''
  if (artwork.medium && artwork.medium !== 'Mixed media') description += `\n\nMedium: ${artwork.medium}`
  if (artwork.year_created && artwork.year_created !== 'Date unknown') description += `\nCreated: ${artwork.year_created}`
  if (artwork.credit_line) description += `\n\n${artwork.credit_line}`

  return {
    title: artwork.title, description: description.trim(), price: 49.99, artist: artistNormalized, vendor: artistNormalized,
    category: artwork.object_type || 'Art Print', image_url: imageUrl, sku, status: 'active', store_id: storeId, product_type: 'simple',
  }
}

export function transformBatchFromGalleryStore(artworks: GalleryStoreArtwork[], storeId: string): Omit<CommerceHubProduct, 'id'>[] {
  return artworks.map(a => transformFromGalleryStore(a, storeId))
}

export function validateGalleryStoreData(data: unknown): data is { artworks: GalleryStoreArtwork[] } {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  if (!Array.isArray(obj.artworks)) return false
  return obj.artworks.every((item: unknown) => {
    if (!item || typeof item !== 'object') return false
    const artwork = item as Record<string, unknown>
    return typeof artwork.smithsonian_id === 'string' && typeof artwork.title === 'string' && typeof artwork.artist === 'string' && typeof artwork.image === 'string'
  })
}
