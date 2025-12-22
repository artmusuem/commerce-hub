import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface ShopifyVariant {
  id: number
  product_id: number
  title: string
  price: string
  compare_at_price: string | null
  sku: string
  barcode: string | null
  position: number
  inventory_quantity: number
  inventory_policy: string
  inventory_management: string | null
  option1: string | null
  option2: string | null
  option3: string | null
  weight: number
  weight_unit: string
}

interface ShopifyImage {
  id: number
  product_id: number
  position: number
  src: string
  alt: string | null
  width: number
  height: number
}

interface ShopifyOption {
  id: number
  product_id: number
  name: string
  position: number
  values: string[]
}

interface ShopifyProduct {
  id: number
  title: string
  body_html: string
  vendor: string
  product_type: string
  tags: string
  status: string
  handle: string
  created_at: string
  updated_at: string
  variants: ShopifyVariant[]
  images: ShopifyImage[]
  options: ShopifyOption[]
}

interface ShopifyStore {
  id: string
  store_url: string
  store_name: string | null
  api_credentials: { access_token?: string } | null
}

export default function ShopifyImport() {
  const navigate = useNavigate()
  const [stores, setStores] = useState<ShopifyStore[]>([])
  const [selectedStore, setSelectedStore] = useState<ShopifyStore | null>(null)
  const [step, setStep] = useState<'select' | 'preview' | 'importing' | 'done'>('select')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [products, setProducts] = useState<ShopifyProduct[]>([])
  const [imported, setImported] = useState(0)

  // Load connected Shopify stores
  useEffect(() => {
    async function loadStores() {
      const { data } = await supabase
        .from('stores')
        .select('id, store_url, store_name, api_credentials')
        .eq('platform', 'shopify')
      
      if (data && data.length > 0) {
        setStores(data)
        // Auto-select if only one store
        if (data.length === 1) {
          setSelectedStore(data[0])
        }
      }
    }
    loadStores()
  }, [])

  async function fetchProducts() {
    if (!selectedStore?.api_credentials?.access_token) {
      setError('No access token found. Please reconnect your Shopify store.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Use serverless proxy to avoid CORS
      const response = await fetch('/api/shopify/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: selectedStore.store_url,
          accessToken: selectedStore.api_credentials.access_token,
          action: 'fetch'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch products')
      }

      const data = await response.json()
      setProducts(data.products || [])
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch products')
    } finally {
      setLoading(false)
    }
  }

  async function importProducts() {
    if (!selectedStore) return

    setStep('importing')
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      let count = 0
      let updated = 0
      const errors: string[] = []
      
      for (const product of products) {
        const mainVariant = product.variants[0]
        const mainImage = product.images[0]
        const externalId = String(product.id)

        // Check if product already exists (by external_id + store_id)
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('store_id', selectedStore.id)
          .eq('external_id', externalId)
          .single()

        // Transform variants for storage
        const variants = product.variants.map(v => ({
          id: v.id,
          title: v.title,
          price: v.price,
          compare_at_price: v.compare_at_price,
          sku: v.sku,
          barcode: v.barcode,
          position: v.position,
          inventory_quantity: v.inventory_quantity,
          inventory_management: v.inventory_management,
          option1: v.option1,
          option2: v.option2,
          option3: v.option3,
          weight: v.weight,
          weight_unit: v.weight_unit
        }))

        // Transform images for storage
        const images = product.images.map(img => ({
          id: img.id,
          position: img.position,
          src: img.src,
          alt: img.alt,
          width: img.width,
          height: img.height
        }))

        // Transform options for storage
        const options = product.options.map(opt => ({
          id: opt.id,
          name: opt.name,
          position: opt.position,
          values: opt.values
        }))

        // Calculate total inventory across all variants
        const totalInventory = product.variants.reduce(
          (sum, v) => sum + (v.inventory_quantity || 0), 0
        )

        // Determine product type (simple vs variable)
        const productType = product.variants.length > 1 ? 'variable' : 'simple'

        const productData = {
          user_id: user.id,
          store_id: selectedStore.id,
          external_id: externalId,
          title: product.title,
          description: product.body_html?.replace(/<[^>]*>/g, '') || '',
          price: parseFloat(mainVariant?.price || '0'),
          sku: mainVariant?.sku || '',
          image_url: mainImage?.src || '',
          status: product.status === 'active' ? 'active' : 'draft',
          category: product.product_type || '',
          artist: '', // Keep artist separate from vendor
          vendor: product.vendor || '',
          product_type: productType,
          url_handle: product.handle || '',
          tags: product.tags || '',
          // Full variant/option data
          variants: variants,
          images: images,
          options: options,
          // Inventory
          quantity: totalInventory,
          track_inventory: mainVariant?.inventory_management === 'shopify',
          // Sync tracking
          sync_status: 'synced',
          last_synced_at: new Date().toISOString(),
          remote_updated_at: product.updated_at,
          // Platform-specific attributes
          attributes: {
            shopify_tags: product.tags || '',
            platform: 'shopify',
            shopify_created_at: product.created_at,
            has_variants: product.variants.length > 1
          }
        }

        let error
        if (existing) {
          // Update existing product
          const { error: updateError } = await supabase
            .from('products')
            .update(productData)
            .eq('id', existing.id)
          error = updateError
          if (!updateError) updated++
        } else {
          // Insert new product
          const { error: insertError } = await supabase
            .from('products')
            .insert(productData)
          error = insertError
          if (!insertError) count++
        }

        if (error) {
          console.error('Error for', product.title, error)
          errors.push(`${product.title}: ${error.message}`)
        }
        
        setImported(count + updated)
      }

      if (errors.length > 0) {
        console.error('Import errors:', errors)
      }
      
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setStep('preview')
    }
  }

  if (stores.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Link to="/stores" className="text-blue-600 hover:underline mb-4 inline-block">
          ← Back to Stores
        </Link>
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <div className="text-gray-400 text-5xl mb-4">🏪</div>
          <h2 className="text-xl font-semibold mb-2">No Shopify Stores Connected</h2>
          <p className="text-gray-600 mb-4">Connect a Shopify store first to import products.</p>
          <Link
            to="/stores/shopify/connect"
            className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
          >
            Connect Shopify Store
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to="/stores" className="text-blue-600 hover:underline mb-4 inline-block">
        ← Back to Stores
      </Link>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <span className="text-2xl">🛍️</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Import from Shopify</h1>
            <p className="text-gray-500">Pull products from your Shopify store</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">{error}</div>
        )}

        {/* Step 1: Select Store */}
        {step === 'select' && (
          <div className="space-y-4">
            {stores.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Store
                </label>
                <select
                  value={selectedStore?.id || ''}
                  onChange={(e) => setSelectedStore(stores.find(s => s.id === e.target.value) || null)}
                  className="w-full px-4 py-2 border rounded-lg"
                >
                  <option value="">Choose a store...</option>
                  {stores.map(store => (
                    <option key={store.id} value={store.id}>
                      {store.store_name || store.store_url}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {selectedStore && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium">{selectedStore.store_name || selectedStore.store_url}</p>
                <p className="text-sm text-gray-500">{selectedStore.store_url}</p>
              </div>
            )}

            <button
              onClick={fetchProducts}
              disabled={!selectedStore || loading}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Fetching Products...' : 'Fetch Products'}
            </button>
          </div>
        )}

        {/* Step 2: Preview Products */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">Found {products.length} products</h3>
              <button
                onClick={() => setStep('select')}
                className="text-sm text-blue-600 hover:underline"
              >
                ← Back
              </button>
            </div>

            {/* Import Summary */}
            <div className="grid grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{products.length}</div>
                <div className="text-sm text-gray-500">Products</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {products.reduce((sum, p) => sum + p.variants.length, 0)}
                </div>
                <div className="text-sm text-gray-500">Variants</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {products.reduce((sum, p) => sum + p.images.length, 0)}
                </div>
                <div className="text-sm text-gray-500">Images</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {products.filter(p => p.status === 'active').length}
                </div>
                <div className="text-sm text-gray-500">Active</div>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto border rounded-lg">
              {products.map(product => (
                <div key={product.id} className="flex items-center gap-3 p-3 border-b last:border-b-0 hover:bg-gray-50">
                  {product.images[0] && (
                    <img
                      src={product.images[0].src}
                      alt={product.title}
                      className="w-12 h-12 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{product.title}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span>${product.variants[0]?.price || '0'}</span>
                      <span>•</span>
                      <span className={product.status === 'active' ? 'text-green-600' : 'text-gray-400'}>
                        {product.status}
                      </span>
                      {product.variants.length > 1 && (
                        <>
                          <span>•</span>
                          <span className="text-purple-600">{product.variants.length} variants</span>
                        </>
                      )}
                      {product.images.length > 1 && (
                        <>
                          <span>•</span>
                          <span className="text-blue-600">{product.images.length} images</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={importProducts}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700"
            >
              Import {products.length} Products
            </button>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === 'importing' && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-lg font-medium">Importing products...</p>
            <p className="text-gray-500">{imported} of {products.length}</p>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && (
          <div className="text-center py-8">
            <div className="text-green-600 text-5xl mb-4">✓</div>
            <h3 className="text-xl font-semibold mb-2">Import Complete!</h3>
            <p className="text-gray-600 mb-4">
              Successfully imported {imported} products from Shopify.
            </p>
            <button
              onClick={() => navigate('/products')}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"
            >
              View Products
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
