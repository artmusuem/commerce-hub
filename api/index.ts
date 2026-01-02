/**
 * Commerce Hub API
 * 
 * Clean architecture for multi-channel e-commerce synchronization.
 * 
 * STRUCTURE:
 *   /api/types/       - Type definitions
 *   /api/adapters/    - Platform API wrappers
 *   /api/transformers/- Data conversion functions
 *   /api/services/    - Business logic orchestration
 */

// Types
export * from './types/product'
export * from './types/platform'

// Adapters
export { WooCommerceAdapter } from './adapters/woocommerce'
export type { WooCommerceProduct, WooCommerceVariation, WooCommerceCategory } from './adapters/woocommerce'

export { ShopifyAdapter } from './adapters/shopify'
export type { ShopifyProduct, ShopifyVariant, ShopifyOption, ShopifyImage, ShopifyCollection } from './adapters/shopify'

// Transformers
export * as ProductTransformer from './transformers/product-transformer'

// Services
export { SyncService } from './services/sync-service'
export type { SyncOptions } from './services/sync-service'
