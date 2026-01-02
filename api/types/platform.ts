/**
 * Platform Configuration Types
 * 
 * Configuration for connecting to external platforms.
 * Stored in the `stores` table in Supabase.
 */

/**
 * Supported platforms
 */
export type Platform = 'woocommerce' | 'shopify' | 'etsy' | 'gallery-store'

/**
 * WooCommerce connection config
 */
export interface WooCommerceConfig {
  url: string           // https://example.com
  consumer_key: string  // ck_xxx
  consumer_secret: string // cs_xxx
}

/**
 * Shopify connection config
 */
export interface ShopifyConfig {
  shop: string          // example.myshopify.com
  access_token: string  // OAuth access token
}

/**
 * Etsy connection config
 */
export interface EtsyConfig {
  shop_id: string
  access_token: string
  refresh_token: string
}

/**
 * Store record (from Supabase)
 */
export interface Store {
  id: string
  user_id: string
  platform: Platform
  store_name: string
  store_url: string
  api_credentials: WooCommerceConfig | ShopifyConfig | EtsyConfig
  is_connected: boolean
  created_at: string
  updated_at: string
}

/**
 * Sync mapping - tracks which product IDs map across platforms
 */
export interface SyncMapping {
  id: string
  product_id: string           // Our product UUID
  platform: Platform
  platform_product_id: string  // Platform's product ID
  platform_variant_ids?: Record<string, string> // SKU -> variant ID
  sync_status: 'synced' | 'pending' | 'error'
  last_synced_at: string
  error_message?: string
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  pagination?: {
    page: number
    per_page: number
    total: number
    total_pages: number
  }
}
