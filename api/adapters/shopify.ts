/**
 * Shopify Adapter
 * 
 * Clean API wrapper for Shopify Admin REST API.
 * ONLY handles API communication - NO data transformation.
 * 
 * Returns raw Shopify API responses.
 * Transformation happens in ProductTransformer.
 */

import type { ShopifyConfig } from '../types/platform'

/**
 * Raw Shopify product from API
 */
export interface ShopifyProduct {
  id: number
  title: string
  body_html: string
  vendor: string
  product_type: string
  handle: string
  status: 'active' | 'draft' | 'archived'
  tags: string  // Comma-separated
  variants: ShopifyVariant[]
  options: ShopifyOption[]
  images: ShopifyImage[]
}

/**
 * Raw Shopify variant
 */
export interface ShopifyVariant {
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
  option1: string | null
  option2: string | null
  option3: string | null
  weight: number
  weight_unit: 'lb' | 'kg' | 'oz' | 'g'
}

/**
 * Raw Shopify option
 */
export interface ShopifyOption {
  id: number
  product_id: number
  name: string
  position: number
  values: string[]
}

/**
 * Raw Shopify image
 */
export interface ShopifyImage {
  id: number
  product_id: number
  src: string
  alt: string | null
  position: number
  width: number
  height: number
}

/**
 * Shopify collection
 */
export interface ShopifyCollection {
  id: number
  title: string
  handle: string
  body_html: string
  published_at: string | null
  sort_order: string
}

const API_VERSION = '2024-10'

export class ShopifyAdapter {
  private baseUrl: string
  private accessToken: string

  constructor(config: ShopifyConfig) {
    const shop = config.shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
    this.baseUrl = `https://${shop}/admin/api/${API_VERSION}`
    this.accessToken = config.access_token
  }

  /**
   * GET request to Shopify API
   */
  private async get<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`)
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))

    const response = await fetch(url.toString(), {
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Shopify API error ${response.status}: ${error}`)
    }

    return response.json()
  }

  /**
   * POST request to Shopify API
   */
  private async post<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Shopify API error ${response.status}: ${error}`)
    }

    return response.json()
  }

  /**
   * PUT request to Shopify API
   */
  private async put<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Shopify API error ${response.status}: ${error}`)
    }

    return response.json()
  }

  // =========================================================================
  // PRODUCTS
  // =========================================================================

  /**
   * Fetch products from Shopify
   * Returns RAW Shopify format - transform elsewhere
   */
  async getProducts(params: {
    limit?: number
    page_info?: string
    status?: 'active' | 'draft' | 'archived'
    ids?: number[]
  } = {}): Promise<{ products: ShopifyProduct[] }> {
    const queryParams: Record<string, string> = {}
    if (params.limit) queryParams.limit = String(params.limit)
    if (params.page_info) queryParams.page_info = params.page_info
    if (params.status) queryParams.status = params.status
    if (params.ids) queryParams.ids = params.ids.join(',')

    return this.get<{ products: ShopifyProduct[] }>('products.json', queryParams)
  }

  /**
   * Fetch single product by ID
   */
  async getProduct(id: number): Promise<{ product: ShopifyProduct }> {
    return this.get<{ product: ShopifyProduct }>(`products/${id}.json`)
  }

  /**
   * Create a product in Shopify
   * Accepts RAW Shopify format
   */
  async createProduct(data: { product: Partial<ShopifyProduct> }): Promise<{ product: ShopifyProduct }> {
    return this.post<{ product: ShopifyProduct }>('products.json', data)
  }

  /**
   * Update a product in Shopify
   */
  async updateProduct(id: number, data: { product: Partial<ShopifyProduct> }): Promise<{ product: ShopifyProduct }> {
    return this.put<{ product: ShopifyProduct }>(`products/${id}.json`, data)
  }

  // =========================================================================
  // COLLECTIONS
  // =========================================================================

  /**
   * Fetch all smart collections
   */
  async getSmartCollections(): Promise<{ smart_collections: ShopifyCollection[] }> {
    return this.get<{ smart_collections: ShopifyCollection[] }>('smart_collections.json')
  }

  /**
   * Create a smart collection
   */
  async createSmartCollection(data: {
    title: string
    rules: Array<{ column: string; relation: string; condition: string }>
  }): Promise<{ smart_collection: ShopifyCollection }> {
    return this.post<{ smart_collection: ShopifyCollection }>('smart_collections.json', {
      smart_collection: {
        title: data.title,
        rules: data.rules,
      },
    })
  }

  // =========================================================================
  // HEALTH CHECK
  // =========================================================================

  /**
   * Test connection to Shopify
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getProducts({ limit: 1 })
      return true
    } catch {
      return false
    }
  }
}
