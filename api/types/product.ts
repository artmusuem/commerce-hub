/**
 * Universal Product Format
 * 
 * This is the "hub" - all platforms convert to/from this format.
 * NO platform-specific logic here. NO art prints. NO Smithsonian.
 * Just the data structures that every e-commerce platform has.
 */

/**
 * Product image - universal across all platforms
 */
export interface ProductImage {
  src: string
  alt?: string
  position?: number
}

/**
 * Product variant - handles variable products
 * Shopify: max 3 options, 100 variants
 * WooCommerce: unlimited attributes
 * We use the Shopify model as the lowest common denominator
 */
export interface ProductVariant {
  id?: string | number  // Platform-assigned ID (for updates)
  sku?: string
  price: number
  compare_at_price?: number
  option1?: string
  option2?: string
  option3?: string
  inventory_quantity: number
  inventory_tracked: boolean
  weight?: number
  weight_unit?: 'lb' | 'kg' | 'oz' | 'g'
}

/**
 * Product option definition (e.g., "Size" with values ["S", "M", "L"])
 */
export interface ProductOption {
  name: string
  position: number
  values: string[]
}

/**
 * Inventory settings
 */
export interface ProductInventory {
  quantity: number
  tracked: boolean
  allow_backorder?: boolean
}

/**
 * Universal Product Format
 * 
 * The canonical representation of a product in Commerce Hub.
 * All platform adapters convert to/from this format.
 */
export interface UniversalProduct {
  // === IDENTITY ===
  // These are set by the source platform, used for mapping
  id?: string                    // Our internal ID (UUID)
  external_id?: string           // Source platform's ID
  
  // === CORE FIELDS ===
  title: string
  description: string
  price: number                  // Base price (or lowest variant price)
  compare_at_price?: number      // "Was" price for sales
  sku?: string
  
  // === CATEGORIZATION ===
  vendor?: string                // Brand/manufacturer
  product_type?: string          // Category/type
  tags?: string[]
  
  // === STATUS ===
  status: 'active' | 'draft' | 'archived'
  
  // === INVENTORY ===
  inventory: ProductInventory
  
  // === MEDIA ===
  images: ProductImage[]
  
  // === VARIANTS ===
  // If empty or single variant with no options = simple product
  // If multiple variants with options = variable product
  variants: ProductVariant[]
  options: ProductOption[]
  
  // === METADATA ===
  // Platform-specific data that doesn't fit the universal model
  // Use sparingly - if you're putting a lot here, the model needs updating
  metadata?: Record<string, unknown>
}

/**
 * Minimal product for listing views (less data to fetch)
 */
export interface ProductSummary {
  id: string
  external_id?: string
  title: string
  price: number
  status: 'active' | 'draft' | 'archived'
  image_url?: string
  sku?: string
  inventory_quantity: number
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean
  source_id: string
  destination_id?: string
  error?: string
  timestamp: string
}
