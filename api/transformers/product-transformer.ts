/**
 * Product Transformer
 * 
 * Pure transformation functions for converting between platform formats.
 * 
 * ARCHITECTURE:
 *   Platform A → fromPlatformA() → UniversalProduct → toPlatformB() → Platform B
 * 
 * RULES:
 * 1. No side effects - pure functions only
 * 2. No API calls - that's the adapter's job
 * 3. No database access - that's the service's job
 * 4. Handle missing/malformed data gracefully
 */

import type { UniversalProduct, ProductVariant, ProductOption, ProductImage } from '../types/product'
import type { WooCommerceProduct, WooCommerceVariation } from '../adapters/woocommerce'
import type { ShopifyProduct, ShopifyVariant, ShopifyOption, ShopifyImage } from '../adapters/shopify'

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Strip HTML tags from string
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

/**
 * Parse price string to number
 */
function parsePrice(price: string | number | null | undefined): number {
  if (typeof price === 'number') return price
  if (!price) return 0
  return parseFloat(price) || 0
}

/**
 * Map status between platforms
 */
const STATUS_MAP = {
  // WooCommerce → Universal
  'publish': 'active',
  'draft': 'draft',
  'pending': 'draft',
  'private': 'archived',
  // Shopify → Universal (already matches)
  'active': 'active',
  'archived': 'archived',
} as const

// =============================================================================
// FROM WOOCOMMERCE
// =============================================================================

/**
 * Transform WooCommerce product to Universal format
 * 
 * @param wooProduct - Raw WooCommerce product from API
 * @param variations - Optional: pre-fetched variations for variable products
 */
export function fromWooCommerce(
  wooProduct: WooCommerceProduct,
  variations?: WooCommerceVariation[]
): UniversalProduct {
  const status = STATUS_MAP[wooProduct.status] || 'draft'
  
  // Handle images
  const images: ProductImage[] = wooProduct.images?.map((img, i) => ({
    src: img.src,
    alt: img.alt || '',
    position: i,
  })) || []

  // Handle simple product (no variants)
  if (wooProduct.type === 'simple') {
    return {
      external_id: String(wooProduct.id),
      title: wooProduct.name,
      description: stripHtml(wooProduct.description || wooProduct.short_description || ''),
      price: parsePrice(wooProduct.price),
      compare_at_price: parsePrice(wooProduct.regular_price) > parsePrice(wooProduct.price) 
        ? parsePrice(wooProduct.regular_price) 
        : undefined,
      sku: wooProduct.sku || undefined,
      vendor: undefined,
      product_type: wooProduct.categories?.[0]?.name || undefined,
      tags: wooProduct.tags?.map(t => t.name) || [],
      status,
      inventory: {
        quantity: wooProduct.stock_quantity || 0,
        tracked: wooProduct.manage_stock,
        allow_backorder: wooProduct.stock_status === 'onbackorder',
      },
      images,
      variants: [{
        sku: wooProduct.sku || undefined,
        price: parsePrice(wooProduct.price),
        compare_at_price: parsePrice(wooProduct.regular_price) > parsePrice(wooProduct.price)
          ? parsePrice(wooProduct.regular_price)
          : undefined,
        inventory_quantity: wooProduct.stock_quantity || 0,
        inventory_tracked: wooProduct.manage_stock,
      }],
      options: [],
      metadata: {
        woocommerce_id: wooProduct.id,
        woocommerce_type: wooProduct.type,
      },
    }
  }

  // Handle variable product
  const options: ProductOption[] = wooProduct.attributes
    ?.filter(attr => attr.variation)
    .map((attr, i) => ({
      name: attr.name,
      position: attr.position || i,
      values: attr.options,
    })) || []

  const productVariants: ProductVariant[] = variations?.map(v => ({
    id: v.id,
    sku: v.sku || undefined,
    price: parsePrice(v.price),
    compare_at_price: parsePrice(v.regular_price) > parsePrice(v.price)
      ? parsePrice(v.regular_price)
      : undefined,
    option1: v.attributes?.[0]?.option || undefined,
    option2: v.attributes?.[1]?.option || undefined,
    option3: v.attributes?.[2]?.option || undefined,
    inventory_quantity: v.stock_quantity || 0,
    inventory_tracked: v.manage_stock,
  })) || []

  // Find lowest price for base price
  const lowestPrice = productVariants.length > 0
    ? Math.min(...productVariants.map(v => v.price))
    : parsePrice(wooProduct.price)

  return {
    external_id: String(wooProduct.id),
    title: wooProduct.name,
    description: stripHtml(wooProduct.description || wooProduct.short_description || ''),
    price: lowestPrice,
    sku: wooProduct.sku || undefined,
    vendor: undefined,
    product_type: wooProduct.categories?.[0]?.name || undefined,
    tags: wooProduct.tags?.map(t => t.name) || [],
    status,
    inventory: {
      quantity: productVariants.reduce((sum, v) => sum + v.inventory_quantity, 0),
      tracked: wooProduct.manage_stock,
    },
    images,
    variants: productVariants,
    options,
    metadata: {
      woocommerce_id: wooProduct.id,
      woocommerce_type: wooProduct.type,
    },
  }
}

// =============================================================================
// FROM SHOPIFY
// =============================================================================

/**
 * Transform Shopify product to Universal format
 */
export function fromShopify(shopifyProduct: ShopifyProduct): UniversalProduct {
  const status = STATUS_MAP[shopifyProduct.status] || 'draft'

  // Handle images
  const images: ProductImage[] = shopifyProduct.images?.map(img => ({
    src: img.src,
    alt: img.alt || undefined,
    position: img.position,
  })) || []

  // Handle options
  const options: ProductOption[] = shopifyProduct.options?.map(opt => ({
    name: opt.name,
    position: opt.position,
    values: opt.values,
  })) || []

  // Handle variants
  const variants: ProductVariant[] = shopifyProduct.variants?.map(v => ({
    id: v.id,
    sku: v.sku || undefined,
    price: parsePrice(v.price),
    compare_at_price: v.compare_at_price ? parsePrice(v.compare_at_price) : undefined,
    option1: v.option1 || undefined,
    option2: v.option2 || undefined,
    option3: v.option3 || undefined,
    inventory_quantity: v.inventory_quantity || 0,
    inventory_tracked: v.inventory_management === 'shopify',
    weight: v.weight,
    weight_unit: v.weight_unit,
  })) || []

  // Parse tags from comma-separated string
  const tags = shopifyProduct.tags
    ? shopifyProduct.tags.split(',').map(t => t.trim()).filter(Boolean)
    : []

  // Find lowest price for base price
  const lowestPrice = variants.length > 0
    ? Math.min(...variants.map(v => v.price))
    : 0

  // Sum inventory across variants
  const totalInventory = variants.reduce((sum, v) => sum + v.inventory_quantity, 0)

  return {
    external_id: String(shopifyProduct.id),
    title: shopifyProduct.title,
    description: stripHtml(shopifyProduct.body_html || ''),
    price: lowestPrice,
    sku: variants[0]?.sku,
    vendor: shopifyProduct.vendor || undefined,
    product_type: shopifyProduct.product_type || undefined,
    tags,
    status,
    inventory: {
      quantity: totalInventory,
      tracked: variants.some(v => v.inventory_tracked),
    },
    images,
    variants,
    options,
    metadata: {
      shopify_id: shopifyProduct.id,
      shopify_handle: shopifyProduct.handle,
    },
  }
}

// =============================================================================
// TO WOOCOMMERCE
// =============================================================================

/**
 * Transform Universal product to WooCommerce format
 */
export function toWooCommerce(product: UniversalProduct): Partial<WooCommerceProduct> {
  const isVariable = product.variants.length > 1 && product.options.length > 0

  const base: Partial<WooCommerceProduct> = {
    name: product.title,
    description: product.description,
    status: product.status === 'active' ? 'publish' : product.status === 'archived' ? 'private' : 'draft',
    sku: product.sku,
    images: product.images.map(img => ({
      id: 0, // WooCommerce assigns ID
      src: img.src,
      alt: img.alt || '',
    })),
  }

  if (isVariable) {
    // Variable product
    return {
      ...base,
      type: 'variable',
      attributes: product.options.map((opt, i) => ({
        id: 0,
        name: opt.name,
        position: opt.position || i,
        visible: true,
        variation: true,
        options: opt.values,
      })),
      // Note: Variations must be created via separate API calls after product creation
    }
  } else {
    // Simple product
    const variant = product.variants[0] || { price: product.price, inventory_quantity: 0, inventory_tracked: false }
    return {
      ...base,
      type: 'simple',
      regular_price: variant.compare_at_price?.toString() || variant.price.toString(),
      price: variant.price.toString(),
      manage_stock: variant.inventory_tracked,
      stock_quantity: variant.inventory_quantity,
    }
  }
}

/**
 * Transform Universal variant to WooCommerce variation format
 * (For creating variations after variable product is created)
 */
export function toWooCommerceVariation(
  variant: ProductVariant,
  options: ProductOption[]
): Partial<WooCommerceVariation> {
  const attributes: Array<{ name: string; option: string }> = []
  
  if (variant.option1 && options[0]) {
    attributes.push({ name: options[0].name, option: variant.option1 })
  }
  if (variant.option2 && options[1]) {
    attributes.push({ name: options[1].name, option: variant.option2 })
  }
  if (variant.option3 && options[2]) {
    attributes.push({ name: options[2].name, option: variant.option3 })
  }

  return {
    sku: variant.sku,
    regular_price: variant.compare_at_price?.toString() || variant.price.toString(),
    price: variant.price.toString(),
    manage_stock: variant.inventory_tracked,
    stock_quantity: variant.inventory_quantity,
    stock_status: variant.inventory_quantity > 0 ? 'instock' : 'outofstock',
    attributes,
  }
}

// =============================================================================
// TO SHOPIFY
// =============================================================================

/**
 * Transform Universal product to Shopify format
 */
export function toShopify(product: UniversalProduct): { product: Partial<ShopifyProduct> } {
  // Build variants
  const variants: Partial<ShopifyVariant>[] = product.variants.map((v, i) => ({
    sku: v.sku,
    price: v.price.toString(),
    compare_at_price: v.compare_at_price?.toString() || null,
    option1: v.option1 || null,
    option2: v.option2 || null,
    option3: v.option3 || null,
    inventory_quantity: v.inventory_quantity,
    inventory_management: v.inventory_tracked ? 'shopify' : null,
    position: i + 1,
    weight: v.weight || 0,
    weight_unit: v.weight_unit || 'lb',
  }))

  // If no variants, create a default one
  if (variants.length === 0) {
    variants.push({
      sku: product.sku,
      price: product.price.toString(),
      inventory_quantity: product.inventory.quantity,
      inventory_management: product.inventory.tracked ? 'shopify' : null,
    })
  }

  // Build options
  const options: Partial<ShopifyOption>[] = product.options.map((opt, i) => ({
    name: opt.name,
    position: opt.position || i + 1,
    values: opt.values,
  }))

  return {
    product: {
      title: product.title,
      body_html: product.description,
      vendor: product.vendor || '',
      product_type: product.product_type || '',
      tags: product.tags?.join(', ') || '',
      status: product.status,
      variants: variants as ShopifyVariant[],
      options: options.length > 0 ? options as ShopifyOption[] : undefined,
      images: product.images.map((img, i) => ({
        id: 0,
        product_id: 0,
        src: img.src,
        alt: img.alt || null,
        position: img.position || i + 1,
        width: 0,
        height: 0,
      })),
    },
  }
}

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Transform multiple WooCommerce products
 */
export function batchFromWooCommerce(
  products: WooCommerceProduct[],
  variationsMap?: Map<number, WooCommerceVariation[]>
): UniversalProduct[] {
  return products.map(p => fromWooCommerce(p, variationsMap?.get(p.id)))
}

/**
 * Transform multiple Shopify products
 */
export function batchFromShopify(products: ShopifyProduct[]): UniversalProduct[] {
  return products.map(fromShopify)
}

/**
 * Transform multiple Universal products to WooCommerce
 */
export function batchToWooCommerce(products: UniversalProduct[]): Partial<WooCommerceProduct>[] {
  return products.map(toWooCommerce)
}

/**
 * Transform multiple Universal products to Shopify
 */
export function batchToShopify(products: UniversalProduct[]): { product: Partial<ShopifyProduct> }[] {
  return products.map(toShopify)
}
