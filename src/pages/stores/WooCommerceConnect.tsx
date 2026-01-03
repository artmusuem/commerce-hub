import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface WooProduct {
  id: number
  name: string
  slug: string
  sku: string
  description: string
  short_description: string
  price: string
  regular_price: string
  images: { src: string }[]
  categories: { name: string }[]
  status: string
  type: string
  attributes: {
    id: number
    name: string
    position: number
    visible: boolean
    variation: boolean
    options: string[]
  }[]
}

// WooCommerce variation structure from /products/{id}/variations endpoint
interface WooVariation {
  id: number
  sku: string
  price: string
  regular_price: string
  sale_price: string
  stock_quantity: number | null
  stock_status: string
  manage_stock: boolean
  attributes: {
    id: number
    name: string
    option: string
  }[]
}

interface WooCategory {
  id: number
  name: string
  slug: string
  parent: number
}

// Unified variant format for Supabase (works with both WooCommerce and Shopify)
interface UnifiedVariant {
  id: number
  price: string
  compare_at_price?: string
  sku?: string
  inventory_quantity?: number
  inventory_management?: string | null
  option1?: string
  option2?: string
  option3?: string
  // Keep original WooCommerce data for reference
  woo_attributes?: { name: string; option: string }[]
}

// Unified options format
interface UnifiedOption {
  name: string
  values: string[]
}

export function WooCommerceConnect() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'connect' | 'preview' | 'importing' | 'done'>('connect')
  const [siteUrl, setSiteUrl] = useState('https://rapidwoo.com/commerce')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [products, setProducts] = useState<WooProduct[]>([])
  const [categories, setCategories] = useState<WooCategory[]>([])
  const [imported, setImported] = useState(0)
  const [importProgress, setImportProgress] = useState('')

  async function testConnection() {
    setLoading(true)
    setError('')

    try {
      // Build WooCommerce API URL
      const baseUrl = siteUrl.replace(/\/$/, '')
      
      // Fetch ALL products with pagination
      const allProducts: WooProduct[] = []
      let page = 1
      let hasMore = true
      
      while (hasMore) {
        const productsUrl = `${baseUrl}/wp-json/wc/v3/products?per_page=100&page=${page}&consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`
        const productsRes = await fetch(productsUrl)
        
        if (!productsRes.ok) {
          if (productsRes.status === 401) {
            throw new Error('Invalid API credentials. Check your Consumer Key and Secret.')
          }
          throw new Error(`Failed to connect: ${productsRes.status}`)
        }

        const productsData: WooProduct[] = await productsRes.json()
        
        if (productsData.length === 0) {
          hasMore = false
        } else {
          allProducts.push(...productsData)
          page++
          // Stop if we got less than 100 (last page)
          if (productsData.length < 100) {
            hasMore = false
          }
        }
      }
      
      setProducts(allProducts)

      // Fetch categories
      const categoriesUrl = `${baseUrl}/wp-json/wc/v3/products/categories?per_page=100&consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`
      const categoriesRes = await fetch(categoriesUrl)
      
      // Categories fetch is optional - don't fail if it errors
      if (categoriesRes.ok) {
        const categoriesData: WooCategory[] = await categoriesRes.json()
        setCategories(categoriesData)
      }

      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  // Fetch variations for a single variable product
  async function fetchVariationsForProduct(
    baseUrl: string, 
    productId: number,
    consumerKey: string,
    consumerSecret: string
  ): Promise<WooVariation[]> {
    const url = `${baseUrl}/wp-json/wc/v3/products/${productId}/variations?per_page=100&consumer_key=${consumerKey}&consumer_secret=${consumerSecret}`
    
    try {
      const response = await fetch(url)
      if (!response.ok) {
        console.warn(`Failed to fetch variations for product ${productId}: ${response.status}`)
        return []
      }
      return await response.json()
    } catch (err) {
      console.warn(`Error fetching variations for product ${productId}:`, err)
      return []
    }
  }

  // Transform WooCommerce variations to unified format
  function transformVariations(
    wooVariations: WooVariation[], 
    productAttributes: WooProduct['attributes']
  ): { variants: UnifiedVariant[], options: UnifiedOption[] } {
    
    // Build options from product attributes that are marked for variations
    const variationAttributes = productAttributes.filter(attr => attr.variation)
    const options: UnifiedOption[] = variationAttributes.map(attr => ({
      name: attr.name,
      values: attr.options
    }))

    // Transform each variation
    const variants: UnifiedVariant[] = wooVariations.map(v => {
      const variant: UnifiedVariant = {
        id: v.id,
        price: v.price || v.regular_price || '0',
        compare_at_price: v.sale_price && v.regular_price && v.sale_price !== v.regular_price 
          ? v.regular_price 
          : undefined,
        sku: v.sku || undefined,
        inventory_quantity: v.stock_quantity ?? undefined,
        inventory_management: v.manage_stock ? 'shopify' : null,
        woo_attributes: v.attributes.map(a => ({ name: a.name, option: a.option }))
      }

      // Map variation attributes to option1, option2, option3 (Shopify format)
      // The order matches the options array order
      variationAttributes.forEach((attr, index) => {
        const varAttr = v.attributes.find(a => a.name === attr.name || a.id === attr.id)
        if (varAttr) {
          if (index === 0) variant.option1 = varAttr.option
          else if (index === 1) variant.option2 = varAttr.option
          else if (index === 2) variant.option3 = varAttr.option
        }
      })

      return variant
    })

    return { variants, options }
  }

  async function importProducts() {
    setStep('importing')
    setError('')
    setImportProgress('Starting import...')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const baseUrl = siteUrl.replace(/\/$/, '')

      // Build api_credentials with categories for sync
      const apiCredentials = {
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
        categories: categories.map(c => ({ id: c.id, name: c.name }))
      }

      // Create or update store record
      const storeName = new URL(siteUrl).hostname
      let storeId: string | null = null

      // Check if store already exists
      const { data: existingStore } = await supabase
        .from('stores')
        .select()
        .eq('user_id', user.id)
        .eq('platform', 'woocommerce')
        .single()

      if (existingStore) {
        // Update existing store with latest credentials and categories
        const { error: updateError } = await supabase
          .from('stores')
          .update({
            store_url: siteUrl,
            api_credentials: apiCredentials,
            is_connected: true
          })
          .eq('id', existingStore.id)
        
        if (updateError) {
          console.error('Store update error:', updateError)
        }
        storeId = existingStore.id
      } else {
        const { data: storeRecord, error: storeError } = await supabase
          .from('stores')
          .insert({
            user_id: user.id,
            platform: 'woocommerce',
            store_name: storeName,
            store_url: siteUrl,
            is_connected: true,
            api_credentials: apiCredentials
          })
          .select()
          .single()

        if (storeError) {
          console.error('Store creation error:', storeError)
          // Continue without store link
        } else {
          storeId = storeRecord.id
        }
      }

      // Delete existing products for this store before import (prevents duplicates)
      if (storeId) {
        setImportProgress('Clearing old products...')
        const { error: deleteError } = await supabase
          .from('products')
          .delete()
          .eq('store_id', storeId)
        
        if (deleteError) {
          console.error('Error clearing old products:', deleteError)
        }
      }

      // Filter publishable products
      const publishedProducts = products.filter(p => p.name && p.status === 'publish')
      
      // Count variable products for progress tracking
      const variableProducts = publishedProducts.filter(p => p.type === 'variable')
      let variationsFetched = 0

      // Transform WooCommerce products to our format
      // For variable products, fetch their variations
      const transformedProducts = []
      
      for (const p of publishedProducts) {
        setImportProgress(`Processing ${p.name}...`)
        
        let variants: UnifiedVariant[] = []
        let options: UnifiedOption[] = []

        // Fetch variations for variable products
        if (p.type === 'variable') {
          variationsFetched++
          setImportProgress(`Fetching variations for ${p.name} (${variationsFetched}/${variableProducts.length})...`)
          
          const wooVariations = await fetchVariationsForProduct(
            baseUrl,
            p.id,
            consumerKey,
            consumerSecret
          )
          
          if (wooVariations.length > 0) {
            const transformed = transformVariations(wooVariations, p.attributes)
            variants = transformed.variants
            options = transformed.options
          }
        }

        const base: Record<string, unknown> = {
          user_id: user.id,
          title: p.name,
          description: stripHtml(p.description || p.short_description || ''),
          price: parseFloat(p.price) || parseFloat(p.regular_price) || 0,
          category: p.categories?.[0]?.name || 'Uncategorized',
          image_url: p.images?.[0]?.src || null,
          status: 'active' as const,
          external_id: String(p.id),  // WooCommerce product ID for sync
          sku: p.sku || null,
          attributes: p.attributes || [],  // WooCommerce attributes array
          product_type: p.type || 'simple',  // simple, variable, grouped, external
          variants: variants,  // Variation data with prices, SKUs, etc.
          options: options,    // Option definitions (Color, Size, etc.)
          platform_ids: { woocommerce: String(p.id) },  // Track WooCommerce ID
        }
        
        // Only add store_id if we have one (migration may not have run)
        if (storeId) {
          base.store_id = storeId
        }
        
        transformedProducts.push(base)
      }

      setImportProgress(`Saving ${transformedProducts.length} products to database...`)

      // Batch insert
      const { error: insertError } = await supabase
        .from('products')
        .insert(transformedProducts)

      if (insertError) {
        // If optional columns don't exist, retry without them
        if (insertError.message.includes('store_id') || 
            insertError.message.includes('external_id') || 
            insertError.message.includes('attributes') || 
            insertError.message.includes('sku') || 
            insertError.message.includes('product_type') ||
            insertError.message.includes('variants') ||
            insertError.message.includes('options') ||
            insertError.message.includes('platform_ids')) {
          
          console.warn('Some columns missing, retrying with basic fields only')
          const productsWithoutOptional = transformedProducts.map(p => {
            const { store_id, external_id, attributes, sku, product_type, variants, options, platform_ids, ...rest } = p
            return rest
          })
          const { error: retryError } = await supabase
            .from('products')
            .insert(productsWithoutOptional)
          
          if (retryError) throw retryError
        } else {
          throw insertError
        }
      }

      setImported(transformedProducts.length)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setStep('preview')
    }
  }

  function stripHtml(html: string): string {
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    return tmp.textContent || tmp.innerText || ''
  }

  if (step === 'done') {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">WooCommerce Connected!</h2>
        <p className="text-gray-600 mb-6">{imported} products imported from your store</p>
        <p className="text-sm text-gray-500 mb-6">Variable products now include full variation data (prices, SKUs, inventory)</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate('/products')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            View Products
          </button>
          <Link
            to="/stores"
            className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            Back to Stores
          </Link>
        </div>
      </div>
    )
  }

  if (step === 'importing') {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="animate-spin text-4xl mb-4">⚙️</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Importing Products...</h2>
        <p className="text-gray-600 mb-4">{importProgress}</p>
        <p className="text-sm text-gray-500">This may take a moment for stores with many variable products</p>
      </div>
    )
  }

  if (step === 'preview') {
    const variableCount = products.filter(p => p.type === 'variable').length
    const simpleCount = products.filter(p => p.type === 'simple').length
    
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Preview: {products.length} products found
          </h2>
          <div className="flex gap-3">
            <button
              onClick={() => setStep('connect')}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              ← Back
            </button>
            <button
              onClick={importProducts}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Import All Products
            </button>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-blue-800">
            <strong>{variableCount} variable products</strong> will have their variations fetched (prices, SKUs, inventory).
            <br />
            <strong>{simpleCount} simple products</strong> will be imported directly.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Product</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Category</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-600">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.slice(0, 20).map((product) => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {product.images?.[0] && (
                        <img
                          src={product.images[0].src}
                          alt=""
                          className="w-10 h-10 rounded object-cover"
                        />
                      )}
                      <span className="text-sm font-medium text-gray-900">{product.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${
                      product.type === 'variable' 
                        ? 'bg-purple-100 text-purple-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {product.type}
                      {product.type === 'variable' && product.attributes?.filter(a => a.variation).length > 0 && (
                        <span className="ml-1">
                          ({product.attributes.filter(a => a.variation).map(a => a.name).join(', ')})
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {product.categories?.[0]?.name || 'Uncategorized'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">
                    ${product.price || product.regular_price || '0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {products.length > 20 && (
            <div className="px-4 py-3 bg-gray-50 text-center text-sm text-gray-500">
              ...and {products.length - 20} more products
            </div>
          )}
        </div>
      </div>
    )
  }

  // Connect form (step === 'connect')
  return (
    <div className="max-w-xl mx-auto">
      <Link to="/stores" className="text-blue-600 hover:underline mb-4 inline-block">
        ← Back to Stores
      </Link>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Connect WooCommerce Store</h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Store URL
            </label>
            <input
              type="url"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://yourstore.com"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Consumer Key
            </label>
            <input
              type="text"
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
              placeholder="ck_..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Consumer Secret
            </label>
            <input
              type="password"
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
              placeholder="cs_..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <strong>How to get API keys:</strong>
            <ol className="list-decimal ml-4 mt-2 space-y-1">
              <li>Go to WooCommerce → Settings → Advanced → REST API</li>
              <li>Click "Add key"</li>
              <li>Give it a name, select "Read/Write" permissions</li>
              <li>Copy the Consumer Key and Secret</li>
            </ol>
          </div>

          <button
            onClick={testConnection}
            disabled={loading || !siteUrl || !consumerKey || !consumerSecret}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? 'Connecting...' : 'Connect & Preview Products'}
          </button>
        </div>
      </div>
    </div>
  )
}
