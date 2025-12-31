/**
 * Unified Product Schema
 * 
 * This is the canonical product structure used by Commerce Hub.
 * All platform-specific formats (WooCommerce, Shopify, Gallery Store)
 * transform TO and FROM this schema.
 * 
 * Design Principles:
 * - Prices stored in cents (avoids float precision issues)
 * - Weights stored in grams (Shopify native, easy to convert)
 * - Categories as flat string array (lowest common denominator)
 * - platformMeta preserves platform-specific data for round-trips
 */

// ============================================
// UNIFIED PRODUCT SCHEMA
// ============================================

export interface UnifiedProduct {
  // ---------- Identity ----------
  /** Commerce Hub internal UUID */
  id: string
  
  /** Platform's original product ID (for updates) */
  externalId: string | null
  
  /** Where this product was imported from */
  sourcePlatform: 'woocommerce' | 'shopify' | 'gallery-store' | 'manual'
  
  /** URL-safe slug */
  handle: string

  // ---------- Core Fields ----------
  title: string
  description: string
  shortDescription: string

  // ---------- Pricing (in cents) ----------
  /** Regular price in cents (e.g., 1999 = $19.99) */
  price: number
  
  /** Original price for sale comparison, in cents */
  compareAtPrice: number | null
  
  /** Cost per item for profit calculations */
  costPerItem: number | null

  // ---------- Inventory ----------
  sku: string
  barcode: string | null
  trackInventory: boolean
  inventoryQuantity: number

  // ---------- Physical Properties ----------
  /** Weight in grams */
  weight: number
  
  /** Always 'g' - we normalize everything to grams */
  weightUnit: 'g'
  
  /** Dimensions in cm */
  dimensions: {
    length: number
    width: number
    height: number
  } | null

  // ---------- Taxonomy ----------
  /** Product type: simple, variable, grouped, external */
  productType: ProductType
  
  /** Flat list of category names */
  categories: string[]
  
  /** Tags for filtering/search */
  tags: string[]
  
  /** Brand/artist/manufacturer */
  vendor: string

  // ---------- Media ----------
  images: ProductImage[]

  // ---------- Variants ----------
  hasVariants: boolean
  
  /** Product options like Color, Size */
  options: ProductOption[]
  
  /** Individual variant combinations */
  variants: ProductVariant[]

  // ---------- Status ----------
  status: ProductStatus

  // ---------- Timestamps ----------
  createdAt: string
  updatedAt: string

  // ---------- Platform-Specific Data ----------
  /** 
   * Preserved platform data for round-trip fidelity.
   * Store anything that doesn't map to unified schema.
   */
  platformMeta: Record<string, unknown>
}

// ============================================
// SUPPORTING TYPES
// ============================================

export type ProductType = 'simple' | 'variable' | 'grouped' | 'external'

export type ProductStatus = 'active' | 'draft' | 'archived'

export interface ProductImage {
  src: string
  alt: string
  position: number
}

export interface ProductOption {
  /** Option name: "Color", "Size", "Material" */
  name: string
  
  /** Available values: ["Red", "Blue", "Green"] */
  values: string[]
}

export interface ProductVariant {
  /** Variant ID (from platform or generated) */
  id: string
  
  /** Display title: "Red / Large" */
  title: string
  
  /** Variant SKU */
  sku: string
  
  /** Price in cents */
  price: number
  
  /** Compare at price in cents */
  compareAtPrice: number | null
  
  /** Stock level */
  inventoryQuantity: number
  
  /** Option values (max 3 per Shopify limit) */
  option1: string | null
  option2: string | null
  option3: string | null
  
  /** Weight in grams */
  weight: number
  
  /** Barcode/GTIN */
  barcode: string | null
}

// ============================================
// PLATFORM-SPECIFIC TYPES (for reference)
// ============================================

/**
 * WooCommerce REST API Product
 * https://woocommerce.github.io/woocommerce-rest-api-docs/#product-properties
 */
export interface WooCommerceProduct {
  id: number
  name: string
  slug: string
  permalink: string
  type: 'simple' | 'variable' | 'grouped' | 'external'
  status: 'publish' | 'draft' | 'pending' | 'private'
  description: string
  short_description: string
  sku: string
  price: string
  regular_price: string
  sale_price: string
  on_sale: boolean
  purchasable: boolean
  total_sales: number
  virtual: boolean
  downloadable: boolean
  weight: string  // In store's weight unit (usually lbs)
  dimensions: {
    length: string
    width: string
    height: string
  }
  categories: Array<{
    id: number
    name: string
    slug: string
  }>
  tags: Array<{
    id: number
    name: string
    slug: string
  }>
  images: Array<{
    id: number
    src: string
    name: string
    alt: string
  }>
  attributes: Array<{
    id: number
    name: string
    position: number
    visible: boolean
    variation: boolean
    options: string[]
  }>
  variations: number[]  // IDs of variation products
  meta_data: Array<{
    id: number
    key: string
    value: unknown
  }>
}

/**
 * Shopify Admin API Product
 * https://shopify.dev/docs/api/admin-rest/2024-01/resources/product
 */
export interface ShopifyProduct {
  id: number
  title: string
  body_html: string
  vendor: string
  product_type: string
  handle: string
  tags: string  // Comma-separated
  status: 'active' | 'draft' | 'archived'
  variants: Array<{
    id: number
    product_id: number
    title: string
    price: string
    compare_at_price: string | null
    sku: string
    barcode: string | null
    position: number
    inventory_quantity: number
    inventory_management: 'shopify' | null
    weight: number  // In grams
    weight_unit: 'g' | 'kg' | 'lb' | 'oz'
    option1: string | null
    option2: string | null
    option3: string | null
  }>
  options: Array<{
    id: number
    product_id: number
    name: string
    position: number
    values: string[]
  }>
  images: Array<{
    id: number
    product_id: number
    position: number
    src: string
    alt: string | null
  }>
  created_at: string
  updated_at: string
}

/**
 * Gallery Store Artwork (Smithsonian data)
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
}

// ============================================
// UTILITY TYPES
// ============================================

/** Result of a sync/push operation */
export interface SyncResult {
  success: boolean
  productId: string
  externalId?: string
  platform: 'woocommerce' | 'shopify' | 'gallery-store'
  operation: 'create' | 'update'
  error?: string
  timestamp: string
}

/** Batch sync summary */
export interface SyncSummary {
  total: number
  succeeded: number
  failed: number
  errors: Array<{
    productId: string
    error: string
  }>
  duration: number  // milliseconds
}

// ============================================
// CONVERSION CONSTANTS
// ============================================

/** Grams per pound (for WooCommerce weight conversion) */
export const GRAMS_PER_LB = 453.592

/** Grams per kg */
export const GRAMS_PER_KG = 1000

/** Grams per oz */
export const GRAMS_PER_OZ = 28.3495

// ============================================
// DEFAULT VALUES
// ============================================

/** Default values for new products */
export const PRODUCT_DEFAULTS: Partial<UnifiedProduct> = {
  description: '',
  shortDescription: '',
  compareAtPrice: null,
  costPerItem: null,
  barcode: null,
  trackInventory: true,
  inventoryQuantity: 100,
  weight: 0,
  weightUnit: 'g',
  dimensions: null,
  productType: 'simple',
  categories: [],
  tags: [],
  vendor: '',
  images: [],
  hasVariants: false,
  options: [],
  variants: [],
  status: 'draft',
  platformMeta: {}
}

/** Default price for Gallery Store art prints (in cents) */
export const DEFAULT_ART_PRINT_PRICE = 4999  // $49.99

/** Default inventory for digital products */
export const DEFAULT_DIGITAL_INVENTORY = 9999
