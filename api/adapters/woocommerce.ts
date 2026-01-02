/**
 * WooCommerce Adapter
 * 
 * Clean API wrapper for WooCommerce REST API.
 * ONLY handles API communication - NO data transformation.
 * 
 * Returns raw WooCommerce API responses.
 * Transformation happens in ProductTransformer.
 */

import type { WooCommerceConfig, ApiResponse } from '../types/platform'

/**
 * Raw WooCommerce product from API
 * This is what WooCommerce returns - NOT our universal format
 */
export interface WooCommerceProduct {
  id: number
  name: string
  slug: string
  type: 'simple' | 'variable' | 'grouped' | 'external'
  status: 'publish' | 'draft' | 'pending' | 'private'
  description: string
  short_description: string
  sku: string
  price: string
  regular_price: string
  sale_price: string
  manage_stock: boolean
  stock_quantity: number | null
  stock_status: 'instock' | 'outofstock' | 'onbackorder'
  categories: Array<{ id: number; name: string; slug: string }>
  tags: Array<{ id: number; name: string; slug: string }>
  images: Array<{ id: number; src: string; alt: string }>
  attributes: Array<{
    id: number
    name: string
    position: number
    visible: boolean
    variation: boolean
    options: string[]
  }>
  variations: number[]  // IDs of variation products
}

/**
 * Raw WooCommerce variation from API
 */
export interface WooCommerceVariation {
  id: number
  sku: string
  price: string
  regular_price: string
  sale_price: string
  manage_stock: boolean
  stock_quantity: number | null
  stock_status: 'instock' | 'outofstock' | 'onbackorder'
  attributes: Array<{ name: string; option: string }>
  image: { id: number; src: string; alt: string } | null
}

/**
 * WooCommerce category
 */
export interface WooCommerceCategory {
  id: number
  name: string
  slug: string
  parent: number
  count: number
}

export class WooCommerceAdapter {
  private baseUrl: string
  private auth: string

  constructor(config: WooCommerceConfig) {
    this.baseUrl = config.url.replace(/\/$/, '') + '/wp-json/wc/v3'
    this.auth = 'Basic ' + btoa(`${config.consumer_key}:${config.consumer_secret}`)
  }

  /**
   * GET request to WooCommerce API
   */
  private async get<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`)
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': this.auth,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`WooCommerce API error ${response.status}: ${error}`)
    }

    return response.json()
  }

  /**
   * POST request to WooCommerce API
   */
  private async post<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': this.auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`WooCommerce API error ${response.status}: ${error}`)
    }

    return response.json()
  }

  /**
   * PUT request to WooCommerce API
   */
  private async put<T>(endpoint: string, data: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'PUT',
      headers: {
        'Authorization': this.auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`WooCommerce API error ${response.status}: ${error}`)
    }

    return response.json()
  }

  // =========================================================================
  // PRODUCTS
  // =========================================================================

  /**
   * Fetch products from WooCommerce
   * Returns RAW WooCommerce format - transform elsewhere
   */
  async getProducts(params: {
    page?: number
    per_page?: number
    status?: 'publish' | 'draft' | 'pending' | 'private'
    include?: number[]
  } = {}): Promise<WooCommerceProduct[]> {
    const queryParams: Record<string, string> = {}
    if (params.page) queryParams.page = String(params.page)
    if (params.per_page) queryParams.per_page = String(params.per_page)
    if (params.status) queryParams.status = params.status
    if (params.include) queryParams.include = params.include.join(',')

    return this.get<WooCommerceProduct[]>('products', queryParams)
  }

  /**
   * Fetch single product by ID
   */
  async getProduct(id: number): Promise<WooCommerceProduct> {
    return this.get<WooCommerceProduct>(`products/${id}`)
  }

  /**
   * Create a product in WooCommerce
   * Accepts RAW WooCommerce format
   */
  async createProduct(data: Partial<WooCommerceProduct>): Promise<WooCommerceProduct> {
    return this.post<WooCommerceProduct>('products', data)
  }

  /**
   * Update a product in WooCommerce
   */
  async updateProduct(id: number, data: Partial<WooCommerceProduct>): Promise<WooCommerceProduct> {
    return this.put<WooCommerceProduct>(`products/${id}`, data)
  }

  // =========================================================================
  // VARIATIONS
  // =========================================================================

  /**
   * Fetch variations for a variable product
   */
  async getVariations(productId: number): Promise<WooCommerceVariation[]> {
    return this.get<WooCommerceVariation[]>(`products/${productId}/variations`, {
      per_page: '100',
    })
  }

  /**
   * Create a variation
   */
  async createVariation(productId: number, data: Partial<WooCommerceVariation>): Promise<WooCommerceVariation> {
    return this.post<WooCommerceVariation>(`products/${productId}/variations`, data)
  }

  // =========================================================================
  // CATEGORIES
  // =========================================================================

  /**
   * Fetch all categories
   */
  async getCategories(): Promise<WooCommerceCategory[]> {
    return this.get<WooCommerceCategory[]>('products/categories', { per_page: '100' })
  }

  /**
   * Create a category
   */
  async createCategory(name: string, parent?: number): Promise<WooCommerceCategory> {
    return this.post<WooCommerceCategory>('products/categories', { name, parent })
  }

  // =========================================================================
  // HEALTH CHECK
  // =========================================================================

  /**
   * Test connection to WooCommerce
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.get('products', { per_page: '1' })
      return true
    } catch {
      return false
    }
  }
}
