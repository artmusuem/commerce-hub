import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface ShopifyVariant {
  id: number
  title: string
  price: string
  compare_at_price: string | null
  sku: string
  barcode: string | null
  position: number
  inventory_quantity: number
  inventory_management: string | null
  option1: string | null
  option2: string | null
  option3: string | null
}

interface ShopifyOption {
  id: number
  product_id: number
  name: string
  position: number
  values: string[]
}

interface ShopifyImage {
  id: number
  src: string
  alt: string | null
  position: number
  width: number
  height: number
}

interface ShopifyProduct {
  id: number
  title: string
  body_html: string
  vendor: string
  product_type: string
  tags: string
  status: string
  variants: ShopifyVariant[]
  options: ShopifyOption[]
  images: ShopifyImage[]
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

        // Convert Shopify tags (comma-separated string) to array for PostgreSQL TEXT[]
        const tagsArray = product.tags 
          ? product.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
          : null

        // Determine product type based on variants
        const productType = product.variants.length > 1 ? 'variable' : 'simple'

        // Transform variants for JSONB storage
        const variantsData = product.variants.map(v => ({
          id: v.id,
          title: v.title,
          price: v.price,
          compare_at_price: v.compare_at_price,
          sku: v.sku || '',
          barcode: v.barcode,
          position: v.position,
          inventory_quantity: v.inventory_quantity || 0,
          inventory_management: v.inventory_management,
          option1: v.option1,
          option2: v.option2,
          option3: v.option3
        }))

        // Transform options for JSONB storage (e.g., "Color", "Size")
        const optionsData = product.options?.map(opt => ({
          id: opt.id,
          name: opt.name,
          position: opt.position,
          values: opt.values
        })) || []

        // Extract all image URLs for the images array
        const allImageUrls = product.images?.map(img => img.src) || []

        const productData = {
          user_id: user.id,
          store_id: selectedStore.id,
          external_id: externalId,
          title: product.title,
          description: product.body_html?.replace(/<[^>]*>/g, '') || '',
          price: parseFloat(mainVariant?.price || '0'),
          sku: mainVariant?.sku || '',
          image_url: mainImage?.src || '',
          images: allImageUrls.length > 0 ? allImageUrls : null,  // All product images
          status: product.status === 'active' ? 'active' : 'draft',
          category: product.product_type || '',
          artist: '',  // Keep empty for Shopify products
          vendor: product.vendor || '',  // Shopify vendor field
          product_type: productType,  // 'simple' or 'variable'
          variants: variantsData,  // Full variant data as JSONB
          options: optionsData,  // Product options (Color, Size, etc.)
          tags: tagsArray,  // Proper array format for PostgreSQL TEXT[]
          attributes: {
            platform: 'shopify'
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

            <div className="max-h-96 overflow-y-auto border rounded-lg">
              {products.map(product => (
                <div key={product.id} className="flex items-center gap-3 p-3 border-b last:border-b-0">
                  {product.images[0] && (
                    <img
                      src={product.images[0].src}
                      alt={product.title}
                      className="w-12 h-12 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{product.title}</p>
                    <p className="text-sm text-gray-500">
                      ${product.variants[0]?.price || '0'} • {product.status}
                    </p>
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
