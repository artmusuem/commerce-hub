/**
 * Sync Service
 * 
 * Orchestrates synchronization between platforms.
 * 
 * ARCHITECTURE:
 *   1. Fetch from source (via adapter)
 *   2. Transform to universal format (via transformer)
 *   3. Transform to destination format (via transformer)
 *   4. Push to destination (via adapter)
 *   5. Record mapping (via database)
 * 
 * This service handles the WORKFLOW, not the details.
 * Adapters handle API communication.
 * Transformers handle data conversion.
 */

import { WooCommerceAdapter } from '../adapters/woocommerce'
import { ShopifyAdapter } from '../adapters/shopify'
import * as ProductTransformer from '../transformers/product-transformer'
import type { UniversalProduct, SyncResult } from '../types/product'
import type { SyncMapping } from '../types/platform'

export interface SyncOptions {
  /** Don't actually push - just log what would happen */
  dryRun?: boolean
  /** Update existing product if mapping exists, otherwise create */
  upsert?: boolean
}

export class SyncService {
  constructor(
    private woo?: WooCommerceAdapter,
    private shopify?: ShopifyAdapter,
    // TODO: Add database client for storing mappings
  ) {}

  // =========================================================================
  // WOOCOMMERCE → SHOPIFY
  // =========================================================================

  /**
   * Sync a single product from WooCommerce to Shopify
   */
  async syncWooToShopify(
    wooProductId: number,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    if (!this.woo) throw new Error('WooCommerce adapter not configured')
    if (!this.shopify) throw new Error('Shopify adapter not configured')

    const timestamp = new Date().toISOString()

    try {
      // 1. Fetch from WooCommerce
      const wooProduct = await this.woo.getProduct(wooProductId)
      
      // Fetch variations if variable product
      let variations
      if (wooProduct.type === 'variable') {
        variations = await this.woo.getVariations(wooProductId)
      }

      // 2. Transform to universal format
      const universal = ProductTransformer.fromWooCommerce(wooProduct, variations)

      // 3. Transform to Shopify format
      const shopifyPayload = ProductTransformer.toShopify(universal)

      if (options.dryRun) {
        console.log('DRY RUN - Would create in Shopify:', JSON.stringify(shopifyPayload, null, 2))
        return {
          success: true,
          source_id: String(wooProductId),
          timestamp,
        }
      }

      // 4. Push to Shopify
      // TODO: Check if mapping exists for upsert
      const created = await this.shopify.createProduct(shopifyPayload)

      // 5. Record mapping (TODO: database)
      const mapping: SyncMapping = {
        id: crypto.randomUUID(),
        product_id: universal.id || crypto.randomUUID(),
        platform: 'shopify',
        platform_product_id: String(created.product.id),
        platform_variant_ids: created.product.variants.reduce((acc, v) => {
          if (v.sku) acc[v.sku] = String(v.id)
          return acc
        }, {} as Record<string, string>),
        sync_status: 'synced',
        last_synced_at: timestamp,
      }

      console.log('Created mapping:', mapping)

      return {
        success: true,
        source_id: String(wooProductId),
        destination_id: String(created.product.id),
        timestamp,
      }
    } catch (error) {
      return {
        success: false,
        source_id: String(wooProductId),
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp,
      }
    }
  }

  /**
   * Sync multiple products from WooCommerce to Shopify
   */
  async syncBatchWooToShopify(
    params: { page?: number; perPage?: number } = {},
    options: SyncOptions = {}
  ): Promise<SyncResult[]> {
    if (!this.woo) throw new Error('WooCommerce adapter not configured')

    // Fetch products from WooCommerce
    const products = await this.woo.getProducts({
      page: params.page || 1,
      per_page: params.perPage || 10,
      status: 'publish',
    })

    const results: SyncResult[] = []

    for (const product of products) {
      const result = await this.syncWooToShopify(product.id, options)
      results.push(result)
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    return results
  }

  // =========================================================================
  // SHOPIFY → WOOCOMMERCE
  // =========================================================================

  /**
   * Sync a single product from Shopify to WooCommerce
   */
  async syncShopifyToWoo(
    shopifyProductId: number,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    if (!this.shopify) throw new Error('Shopify adapter not configured')
    if (!this.woo) throw new Error('WooCommerce adapter not configured')

    const timestamp = new Date().toISOString()

    try {
      // 1. Fetch from Shopify
      const { product: shopifyProduct } = await this.shopify.getProduct(shopifyProductId)

      // 2. Transform to universal format
      const universal = ProductTransformer.fromShopify(shopifyProduct)

      // 3. Transform to WooCommerce format
      const wooPayload = ProductTransformer.toWooCommerce(universal)

      if (options.dryRun) {
        console.log('DRY RUN - Would create in WooCommerce:', JSON.stringify(wooPayload, null, 2))
        return {
          success: true,
          source_id: String(shopifyProductId),
          timestamp,
        }
      }

      // 4. Push to WooCommerce
      const created = await this.woo.createProduct(wooPayload)

      // 5. Create variations if variable product
      if (created.type === 'variable' && universal.variants.length > 1) {
        for (const variant of universal.variants) {
          const variationPayload = ProductTransformer.toWooCommerceVariation(variant, universal.options)
          await this.woo.createVariation(created.id, variationPayload)
        }
      }

      return {
        success: true,
        source_id: String(shopifyProductId),
        destination_id: String(created.id),
        timestamp,
      }
    } catch (error) {
      return {
        success: false,
        source_id: String(shopifyProductId),
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp,
      }
    }
  }

  // =========================================================================
  // IMPORT TO COMMERCE HUB
  // =========================================================================

  /**
   * Import products from WooCommerce to Commerce Hub (database)
   * Returns Universal format products ready for database insert
   */
  async importFromWooCommerce(
    params: { page?: number; perPage?: number } = {}
  ): Promise<UniversalProduct[]> {
    if (!this.woo) throw new Error('WooCommerce adapter not configured')

    // Fetch products
    const products = await this.woo.getProducts({
      page: params.page || 1,
      per_page: params.perPage || 50,
      status: 'publish',
    })

    // Fetch variations for variable products
    const variationsMap = new Map()
    for (const product of products) {
      if (product.type === 'variable' && product.variations.length > 0) {
        const variations = await this.woo.getVariations(product.id)
        variationsMap.set(product.id, variations)
      }
    }

    // Transform all to universal format
    return ProductTransformer.batchFromWooCommerce(products, variationsMap)
  }

  /**
   * Import products from Shopify to Commerce Hub (database)
   * Returns Universal format products ready for database insert
   */
  async importFromShopify(
    params: { limit?: number } = {}
  ): Promise<UniversalProduct[]> {
    if (!this.shopify) throw new Error('Shopify adapter not configured')

    const { products } = await this.shopify.getProducts({
      limit: params.limit || 50,
      status: 'active',
    })

    return ProductTransformer.batchFromShopify(products)
  }

  // =========================================================================
  // EXPORT FROM COMMERCE HUB
  // =========================================================================

  /**
   * Export Universal products to WooCommerce
   */
  async exportToWooCommerce(
    products: UniversalProduct[],
    options: SyncOptions = {}
  ): Promise<SyncResult[]> {
    if (!this.woo) throw new Error('WooCommerce adapter not configured')

    const results: SyncResult[] = []
    const timestamp = new Date().toISOString()

    for (const product of products) {
      try {
        const wooPayload = ProductTransformer.toWooCommerce(product)

        if (options.dryRun) {
          console.log('DRY RUN:', product.title)
          results.push({ success: true, source_id: product.id || '', timestamp })
          continue
        }

        const created = await this.woo.createProduct(wooPayload)

        // Create variations if needed
        if (created.type === 'variable' && product.variants.length > 1) {
          for (const variant of product.variants) {
            const variationPayload = ProductTransformer.toWooCommerceVariation(variant, product.options)
            await this.woo.createVariation(created.id, variationPayload)
          }
        }

        results.push({
          success: true,
          source_id: product.id || '',
          destination_id: String(created.id),
          timestamp,
        })
      } catch (error) {
        results.push({
          success: false,
          source_id: product.id || '',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp,
        })
      }
    }

    return results
  }

  /**
   * Export Universal products to Shopify
   */
  async exportToShopify(
    products: UniversalProduct[],
    options: SyncOptions = {}
  ): Promise<SyncResult[]> {
    if (!this.shopify) throw new Error('Shopify adapter not configured')

    const results: SyncResult[] = []
    const timestamp = new Date().toISOString()

    for (const product of products) {
      try {
        const shopifyPayload = ProductTransformer.toShopify(product)

        if (options.dryRun) {
          console.log('DRY RUN:', product.title)
          results.push({ success: true, source_id: product.id || '', timestamp })
          continue
        }

        const created = await this.shopify.createProduct(shopifyPayload)

        results.push({
          success: true,
          source_id: product.id || '',
          destination_id: String(created.product.id),
          timestamp,
        })
      } catch (error) {
        results.push({
          success: false,
          source_id: product.id || '',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp,
        })
      }
    }

    return results
  }
}
