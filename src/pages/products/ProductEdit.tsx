import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { transformToWooCommerce, transformToShopify } from '../../lib/transforms'
import { pushProductToWooCommerce, fetchWooCommerceCategories } from '../../lib/woocommerce'
import { pushProductToShopify } from '../../lib/shopify'

interface Store {
  id: string
  platform: string
  store_name: string | null
  store_url: string | null
  api_credentials: Record<string, string> | null
}

export function ProductEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [artist, setArtist] = useState('')
  const [category, setCategory] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [status, setStatus] = useState('draft')
  const [sku, setSku] = useState('')
  const [_storeId, setStoreId] = useState<string | null>(null)
  const [externalId, setExternalId] = useState<string | null>(null) // WooCommerce product ID

  // Push to Store state
  const [stores, setStores] = useState<Store[]>([])
  const [selectedPushStore, setSelectedPushStore] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    async function load() {
      if (!id) return
      
      // Load product
      const { data, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError || !data) {
        setError('Product not found')
        setLoading(false)
        return
      }

      setTitle(data.title)
      setDescription(data.description || '')
      setPrice(data.price.toString())
      setArtist(data.artist || '')
      setCategory(data.category || '')
      setImageUrl(data.image_url || '')
      setStatus(data.status)
      setSku(data.sku || '')
      setStoreId(data.store_id || null)
      setExternalId(data.external_id || null) // Load WooCommerce product ID

      // Load stores for push functionality
      const { data: storesData } = await supabase
        .from('stores')
        .select('id, platform, store_name, store_url, api_credentials')
        .in('platform', ['woocommerce', 'shopify'])
      
      setStores(storesData || [])
      setLoading(false)
    }
    load()
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!id) return
    
    setError('')
    setSaving(true)

    const { error: updateError } = await supabase
      .from('products')
      .update({
        title,
        description: description || null,
        price: parseFloat(price) || 0,
        artist: artist || null,
        category: category || null,
        image_url: imageUrl || null,
        status,
        sku: sku || null,
      })
      .eq('id', id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      return
    }

    navigate('/products')
  }

  async function handlePushToStore() {
    if (!selectedPushStore || !id) return
    
    const store = stores.find(s => s.id === selectedPushStore)
    if (!store) return

    setPushing(true)
    setPushResult(null)

    try {
      const product = {
        id,
        title,
        description,
        price: parseFloat(price) || 0,
        artist,
        category,
        image_url: imageUrl,
        sku,
        status: status as 'draft' | 'active' | 'archived',
      }

      if (store.platform === 'woocommerce') {
        // WooCommerce push
        const credentials = store.api_credentials as { 
          consumer_key?: string
          consumer_secret?: string 
        } | null
        
        if (!credentials?.consumer_key || !credentials?.consumer_secret) {
          throw new Error('WooCommerce API credentials not found for this store')
        }

        // Fetch categories from WooCommerce to map name → ID
        let categoryId: number | undefined
        if (category) {
          try {
            const wooCategories = await fetchWooCommerceCategories({
              siteUrl: store.store_url || '',
              consumerKey: credentials.consumer_key,
              consumerSecret: credentials.consumer_secret
            })
            const match = wooCategories.find(c => 
              c.name.toLowerCase() === category.toLowerCase()
            )
            if (match) {
              categoryId = match.id
            }
          } catch (e) {
            console.warn('Could not fetch WooCommerce categories:', e)
          }
        }

        const wooProduct = transformToWooCommerce(product, categoryId)
        
        // If we have external_id, UPDATE. Otherwise CREATE.
        const existingProductId = externalId ? parseInt(externalId, 10) : undefined
        const isUpdate = !!existingProductId
        
        const result = await pushProductToWooCommerce(
          {
            siteUrl: store.store_url || '',
            consumerKey: credentials.consumer_key,
            consumerSecret: credentials.consumer_secret
          },
          wooProduct,
          existingProductId
        )

        // If we created a NEW product, save the WooCommerce ID back to Supabase
        if (!isUpdate && result.id) {
          const { error: updateErr } = await supabase
            .from('products')
            .update({ external_id: String(result.id) })
            .eq('id', id)
          
          if (!updateErr) {
            setExternalId(String(result.id))
          }
        }

        setPushResult({
          success: true,
          message: isUpdate 
            ? `✅ Updated in WooCommerce (ID: ${result.id})`
            : `✅ Created in WooCommerce (ID: ${result.id})`
        })
      } else if (store.platform === 'shopify') {
        // Shopify push
        const credentials = store.api_credentials as { access_token?: string } | null
        
        if (!credentials?.access_token) {
          throw new Error('Shopify access token not found for this store')
        }

        const shopDomain = store.store_url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || ''
        const shopifyProduct = transformToShopify(product, store.store_name || 'Commerce Hub')
        
        const result = await pushProductToShopify(
          shopDomain,
          credentials.access_token,
          shopifyProduct
        )

        setPushResult({
          success: true,
          message: `Product pushed to Shopify! ID: ${result.id}`
        })
      }
    } catch (err) {
      setPushResult({
        success: false,
        message: err instanceof Error ? err.message : 'Push failed'
      })
    } finally {
      setPushing(false)
    }
  }

  const pushableStores = stores.filter(s => 
    s.platform === 'woocommerce' || s.platform === 'shopify'
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <Link to="/products" className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-flex items-center gap-1">
        ← Back to Products
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Product</h1>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
            <input
              type="text"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Artist</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
          <input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {imageUrl && (
            <img src={imageUrl} alt="Preview" className="mt-2 w-24 h-24 rounded object-cover" />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <Link
            to="/products"
            className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </Link>
        </div>
      </form>

      {/* Push to External Store */}
      {pushableStores.length > 0 && (
        <div className="mt-6 bg-white p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Push to External Store</h2>
          
          {externalId && (
            <p className="text-sm text-green-600 mb-3">
              ✓ Linked to WooCommerce (ID: {externalId}) - changes will UPDATE existing product
            </p>
          )}
          {!externalId && (
            <p className="text-sm text-gray-500 mb-3">
              Not linked to WooCommerce - will CREATE new product
            </p>
          )}
          
          <div className="flex gap-3">
            <select
              value={selectedPushStore}
              onChange={(e) => setSelectedPushStore(e.target.value)}
              className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select store...</option>
              {pushableStores.map(store => (
                <option key={store.id} value={store.id}>
                  {store.store_name || store.store_url} ({store.platform})
                </option>
              ))}
            </select>
            <button
              onClick={handlePushToStore}
              disabled={!selectedPushStore || pushing}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {pushing ? 'Pushing...' : externalId ? 'Update' : 'Create'}
            </button>
          </div>

          {pushResult && (
            <div className={`mt-3 p-3 rounded-lg ${
              pushResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {pushResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
