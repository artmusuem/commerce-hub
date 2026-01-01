/**
 * Art Print Pricing Templates
 * 
 * Defines standard sizes, frames, and pricing for Gallery Store products.
 * Used by transforms.ts to generate variants for Shopify/WooCommerce.
 */

// =============================================================================
// SIZE DEFINITIONS
// =============================================================================

export const PRINT_SIZES = {
  '8x10': { width: 8, height: 10, basePrice: 29.99, weight: 0.5 },
  '11x14': { width: 11, height: 14, basePrice: 39.99, weight: 0.8 },
  '16x20': { width: 16, height: 20, basePrice: 59.99, weight: 1.2 },
  '18x24': { width: 18, height: 24, basePrice: 79.99, weight: 1.5 },
  '24x36': { width: 24, height: 36, basePrice: 129.99, weight: 2.5 },
} as const

export type PrintSize = keyof typeof PRINT_SIZES

// =============================================================================
// FRAME DEFINITIONS
// =============================================================================

export const FRAME_OPTIONS = {
  'Unframed': { 
    upcharge: 0, 
    sku_code: 'UNF',
    description: 'Museum-quality print on archival matte paper'
  },
  'Black Frame': { 
    upcharge: 45, 
    sku_code: 'BLK',
    description: 'Classic black wood frame with UV-protective glass'
  },
  'White Frame': { 
    upcharge: 45, 
    sku_code: 'WHT',
    description: 'Clean white wood frame with UV-protective glass'
  },
  'Natural Wood': { 
    upcharge: 55, 
    sku_code: 'NAT',
    description: 'Natural oak frame with UV-protective glass'
  },
} as const

export type FrameOption = keyof typeof FRAME_OPTIONS

// =============================================================================
// PRICING TEMPLATES
// =============================================================================

export interface PricingTemplate {
  name: string
  sizes: PrintSize[]
  frames: FrameOption[]
  compareAtMarkup: number  // 1.3 = show 30% higher "was" price
}

/**
 * Standard template for most art prints
 * 4 sizes × 4 frames = 16 variants
 */
export const STANDARD_TEMPLATE: PricingTemplate = {
  name: 'standard',
  sizes: ['8x10', '11x14', '16x20', '18x24'],
  frames: ['Unframed', 'Black Frame', 'White Frame', 'Natural Wood'],
  compareAtMarkup: 1.3,
}

/**
 * Premium template for featured/large works
 * 5 sizes × 4 frames = 20 variants
 */
export const PREMIUM_TEMPLATE: PricingTemplate = {
  name: 'premium',
  sizes: ['8x10', '11x14', '16x20', '18x24', '24x36'],
  frames: ['Unframed', 'Black Frame', 'White Frame', 'Natural Wood'],
  compareAtMarkup: 1.25,
}

/**
 * Minimal template for testing
 * 2 sizes × 2 frames = 4 variants
 */
export const MINIMAL_TEMPLATE: PricingTemplate = {
  name: 'minimal',
  sizes: ['8x10', '11x14'],
  frames: ['Unframed', 'Black Frame'],
  compareAtMarkup: 1.3,
}

// Default template for all products
export const DEFAULT_TEMPLATE = STANDARD_TEMPLATE

// =============================================================================
// VARIANT GENERATION
// =============================================================================

/**
 * Calculate price for a specific size + frame combination
 */
export function calculatePrice(size: PrintSize, frame: FrameOption): number {
  const basePrice = PRINT_SIZES[size].basePrice
  const frameUpcharge = FRAME_OPTIONS[frame].upcharge
  return Math.round((basePrice + frameUpcharge) * 100) / 100
}

/**
 * Generate SKU for a variant
 * Format: {baseSku}-{sizeCode}-{frameCode}
 * Example: GS-ABC123-8x10-BLK
 */
export function generateVariantSku(
  baseSku: string,
  size: PrintSize,
  frame: FrameOption
): string {
  const sizeCode = size.replace('x', '')
  const frameCode = FRAME_OPTIONS[frame].sku_code
  return `${baseSku}-${sizeCode}-${frameCode}`
}

// =============================================================================
// SHOPIFY VARIANT GENERATION
// =============================================================================

export interface ShopifyVariant {
  option1: string           // Size
  option2: string           // Frame
  price: string
  compare_at_price: string | null
  sku: string
  inventory_quantity: number
  inventory_management: string | null
  requires_shipping: boolean
  weight: number
  weight_unit: 'lb'
}

export interface ShopifyOption {
  name: string
  values: string[]
}

export interface ShopifyVariantResult {
  options: ShopifyOption[]
  variants: ShopifyVariant[]
}

/**
 * Generate Shopify-compatible options and variants
 */
export function generateShopifyVariants(
  baseSku: string,
  template: PricingTemplate = DEFAULT_TEMPLATE
): ShopifyVariantResult {
  const options: ShopifyOption[] = [
    { name: 'Size', values: [...template.sizes] },
    { name: 'Frame', values: [...template.frames] },
  ]

  const variants: ShopifyVariant[] = []

  for (const size of template.sizes) {
    for (const frame of template.frames) {
      const price = calculatePrice(size, frame)
      const compareAt = Math.round(price * template.compareAtMarkup * 100) / 100

      variants.push({
        option1: size,
        option2: frame,
        price: price.toFixed(2),
        compare_at_price: compareAt.toFixed(2),
        sku: generateVariantSku(baseSku, size, frame),
        inventory_quantity: 999,        // Print on demand = unlimited
        inventory_management: null,     // Don't track inventory
        requires_shipping: true,
        weight: PRINT_SIZES[size].weight + (frame !== 'Unframed' ? 1 : 0),
        weight_unit: 'lb',
      })
    }
  }

  return { options, variants }
}

// =============================================================================
// WOOCOMMERCE VARIANT GENERATION
// =============================================================================

export interface WooAttribute {
  name: string
  visible: boolean
  variation: boolean
  options: string[]
}

export interface WooVariation {
  regular_price: string
  sale_price?: string
  sku: string
  manage_stock: boolean
  stock_status: 'instock'
  weight: string
  attributes: Array<{ name: string; option: string }>
}

export interface WooVariantResult {
  attributes: WooAttribute[]
  variations: WooVariation[]
}

/**
 * Generate WooCommerce-compatible attributes and variations
 */
export function generateWooCommerceVariants(
  baseSku: string,
  template: PricingTemplate = DEFAULT_TEMPLATE
): WooVariantResult {
  const attributes: WooAttribute[] = [
    { 
      name: 'Size', 
      visible: true, 
      variation: true, 
      options: [...template.sizes] 
    },
    { 
      name: 'Frame', 
      visible: true, 
      variation: true, 
      options: [...template.frames] 
    },
  ]

  const variations: WooVariation[] = []

  for (const size of template.sizes) {
    for (const frame of template.frames) {
      const price = calculatePrice(size, frame)
      const weight = PRINT_SIZES[size].weight + (frame !== 'Unframed' ? 1 : 0)

      variations.push({
        regular_price: price.toFixed(2),
        sku: generateVariantSku(baseSku, size, frame),
        manage_stock: false,
        stock_status: 'instock',
        weight: weight.toString(),
        attributes: [
          { name: 'Size', option: size },
          { name: 'Frame', option: frame },
        ],
      })
    }
  }

  return { attributes, variations }
}

// =============================================================================
// COMMERCE HUB VARIANT GENERATION (for database storage)
// =============================================================================

export interface CommerceHubVariant {
  title: string
  price: string
  compare_at_price: string | null
  sku: string
  option1: string
  option2: string
  inventory_quantity: number
  weight: number
}

export interface CommerceHubOption {
  name: string
  position: number
  values: string[]
}

export interface CommerceHubVariantResult {
  options: CommerceHubOption[]
  variants: CommerceHubVariant[]
  lowestPrice: number
}

/**
 * Generate variants for Commerce Hub database storage
 * These get transformed to platform-specific formats on push
 */
export function generateCommerceHubVariants(
  baseSku: string,
  template: PricingTemplate = DEFAULT_TEMPLATE
): CommerceHubVariantResult {
  const options: CommerceHubOption[] = [
    { name: 'Size', position: 1, values: [...template.sizes] },
    { name: 'Frame', position: 2, values: [...template.frames] },
  ]

  const variants: CommerceHubVariant[] = []
  let lowestPrice = Infinity

  for (const size of template.sizes) {
    for (const frame of template.frames) {
      const price = calculatePrice(size, frame)
      const compareAt = Math.round(price * template.compareAtMarkup * 100) / 100
      const weight = PRINT_SIZES[size].weight + (frame !== 'Unframed' ? 1 : 0)

      if (price < lowestPrice) lowestPrice = price

      variants.push({
        title: `${size} / ${frame}`,
        price: price.toFixed(2),
        compare_at_price: compareAt.toFixed(2),
        sku: generateVariantSku(baseSku, size, frame),
        option1: size,
        option2: frame,
        inventory_quantity: 999,
        weight,
      })
    }
  }

  return { options, variants, lowestPrice }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  PRINT_SIZES,
  FRAME_OPTIONS,
  STANDARD_TEMPLATE,
  PREMIUM_TEMPLATE,
  MINIMAL_TEMPLATE,
  DEFAULT_TEMPLATE,
  calculatePrice,
  generateVariantSku,
  generateShopifyVariants,
  generateWooCommerceVariants,
  generateCommerceHubVariants,
}
