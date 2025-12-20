import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { transformToWooCommerce, transformToShopify } from '../../lib/transforms'
import type { WooCategoryMap } from '../../lib/transforms'
import { pushProductToWooCommerce, fetchProductVariations } from '../../lib/woocommerce'
import type { WooCommerceVariation } from '../../lib/woocommerce'
import { pushProductToShopify } from '../../lib/shopify'

interface WooCredentials {
  consumer_key: string
  consumer_secret: string
  categories?: { id: number; name: string }[]
}

interface ProductAttribute {
  id: number
  name: string
  slug?: string
  position: number
  visible: boolean
  variation: boolean
  options: string[]
}

interface Store {
  id: string
  platform: string
  store_name: string | null
  store_url: string | null
  api_credentials: WooCredentials | { access_token?: string } | null
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
  const [externalId, setExternalId] = useState<string | null>(null)
  const [attributes, setAttributes] = useState<ProductAttribute[]>([])
  const [productType, setProductType] = useState<string>('simple')
  const [newOptionInputs, setNewOptionInputs] = useState<Record<number, string>>({})  // Track new option input per attribute
  const [variations, setVariations] = useState<WooCommerceVariation[]>([])
  const [loadingVariations, setLoadingVariations] = useState(false)

  // Push to Store state
  const [stores, setStores] = useState<Store[]>([])
  const [selectedPushStore, setSelectedPushStore] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null)

  // Derive available categories from WooCommerce stores
  const availableCategories = stores
    .filter(s => s.platform === 'woocommerce')
    .flatMap(s => {
      const creds = s.api_credentials as WooCredentials | null
      return creds?.categories || []
    })
    .filter((cat, index, self) => 
      self.findIndex(c => c.id === cat.id) === index // dedupe by id
    )

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
      setExternalId(data.external_id || null)
      setAttributes(data.attributes || [])
      setProductType(data.product_type || 'simple')

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

  // Fetch variations for variable products
  useEffect(() => {
    async function loadVariations() {
      if (productType !== 'variable' || !externalId || !stores.length) return
      
      // Find the WooCommerce store
      const wooStore = stores.find(s => s.platform === 'woocommerce')
      if (!wooStore) return
      
      const credentials = wooStore.api_credentials as WooCredentials | null
      if (!credentials?.consumer_key || !credentials?.consumer_secret) return
      
      setLoadingVariations(true)
      try {
        const vars = await fetchProductVariations(
          {
            siteUrl: wooStore.store_url || '',
            consumerKey: credentials.consumer_key,
            consumerSecret: credentials.consumer_secret
          },
          parseInt(externalId)
        )
        setVariations(vars)
      } catch (err) {
        console.error('Failed to load variations:', err)
      }
      setLoadingVariations(false)
    }
    loadVariations()
  }, [productType, externalId, stores])

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
        attributes,  // Save edited attributes
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
        attributes,  // Include attributes for WooCommerce sync
      }

      if (store.platform === 'woocommerce') {
        // WooCommerce push
        const credentials = store.api_credentials as WooCredentials | null
        
        if (!credentials?.consumer_key || !credentials?.consumer_secret) {
          throw new Error('WooCommerce API credentials not found for this store')
        }

        // Build category map: lowercase name → WooCommerce ID
        const categoryMap: WooCategoryMap = {}
        if (credentials.categories) {
          for (const cat of credentials.categories) {
            categoryMap[cat.name.toLowerCase()] = cat.id
          }
        }

        const wooProduct = transformToWooCommerce(product, categoryMap)
        const result = await pushProductToWooCommerce(
          {
            siteUrl: store.store_url || '',
            consumerKey: credentials.consumer_key,
            consumerSecret: credentials.consumer_secret
          },
          wooProduct,
          externalId ? parseInt(externalId) : undefined
        )

        setPushResult({
          success: true,
          message: `Product pushed to WooCommerce! ID: ${result.id}`
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error === 'Product not found') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Product not found</p>
        <Link to="/products" className="text-blue-600 hover:underline">Back to Products</Link>
      </div>
    )
  }

  const pushableStores = stores.filter(s => 
    s.platform === 'woocommerce' || s.platform === 'shopify'
  )

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link to="/products" className="text-blue-600 hover:underline text-sm">← Back to Products</Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
          {productType && productType !== 'simple' && (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              productType === 'variable' 
                ? 'bg-purple-100 text-purple-700' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {productType.charAt(0).toUpperCase() + productType.slice(1)}
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm space-y-4">
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={e => setPrice(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
            <input
              type="text"
              value={sku}
              onChange={e => setSku(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="PROD-001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Artist</label>
          <input
            type="text"
            value={artist}
            onChange={e => setArtist(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          {availableCategories.length > 0 ? (
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select category...</option>
              {availableCategories.map(cat => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Enter category"
            />
          )}
          {availableCategories.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Categories from WooCommerce ({availableCategories.length} available)
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
          <input
            type="url"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="https://..."
          />
          {imageUrl && <img src={imageUrl} alt="Preview" className="mt-2 w-32 h-32 object-cover rounded-lg bg-gray-100" />}
        </div>

        {/* Attributes Section - Editable */}
        {attributes.length > 0 && (
          <div className="border-t pt-4 mt-2">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Product Attributes
              <span className="ml-2 text-xs font-normal text-gray-500">
                (editable)
              </span>
            </label>
            <div className="space-y-3">
              {attributes.map((attr, attrIndex) => (
                <div key={attr.id || attrIndex} className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{attr.name}</span>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...attributes]
                          updated[attrIndex] = { ...attr, visible: !attr.visible }
                          setAttributes(updated)
                        }}
                        className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                          attr.visible 
                            ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                            : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                        }`}
                      >
                        {attr.visible ? 'Visible' : 'Hidden'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...attributes]
                          updated[attrIndex] = { ...attr, variation: !attr.variation }
                          setAttributes(updated)
                        }}
                        className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                          attr.variation 
                            ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' 
                            : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                        }`}
                      >
                        {attr.variation ? 'Variations' : 'No variations'}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {attr.options.map((option, optIndex) => (
                      <span 
                        key={optIndex}
                        className="px-2 py-1 bg-white border border-gray-200 rounded text-sm text-gray-700 flex items-center gap-1 group"
                      >
                        {option}
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...attributes]
                            updated[attrIndex] = {
                              ...attr,
                              options: attr.options.filter((_, i) => i !== optIndex)
                            }
                            setAttributes(updated)
                          }}
                          className="text-gray-400 hover:text-red-500 ml-1"
                          title="Remove option"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add option..."
                      value={newOptionInputs[attrIndex] || ''}
                      onChange={(e) => {
                        setNewOptionInputs(prev => ({ ...prev, [attrIndex]: e.target.value }))
                      }}
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const value = (newOptionInputs[attrIndex] || '').trim()
                          if (value && !attr.options.includes(value)) {
                            const updated = [...attributes]
                            updated[attrIndex] = {
                              ...attr,
                              options: [...attr.options, value]
                            }
                            setAttributes(updated)
                            setNewOptionInputs(prev => ({ ...prev, [attrIndex]: '' }))
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const value = (newOptionInputs[attrIndex] || '').trim()
                        if (value && !attr.options.includes(value)) {
                          const updated = [...attributes]
                          updated[attrIndex] = {
                            ...attr,
                            options: [...attr.options, value]
                          }
                          setAttributes(updated)
                          setNewOptionInputs(prev => ({ ...prev, [attrIndex]: '' }))
                        }
                      }}
                      className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Variations Section - for variable products */}
        {productType === 'variable' && (
          <div className="border-t pt-4 mt-2">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Product Variations
              <span className="ml-2 text-xs font-normal text-gray-500">
                (from WooCommerce - {variations.length} variations)
              </span>
            </label>
            {loadingVariations ? (
              <div className="text-sm text-gray-500">Loading variations...</div>
            ) : variations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Variation</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">SKU</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Price</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {variations.map((variation) => (
                      <tr key={variation.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {variation.attributes.map((attr, i) => (
                              <span key={i} className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                                {attr.name}: {attr.option}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {variation.sku || '-'}
                        </td>
                        <td className="px-3 py-2">
                          <span className="font-medium">${variation.regular_price || variation.price || '0'}</span>
                          {variation.sale_price && (
                            <span className="ml-2 text-green-600 text-xs">
                              Sale: ${variation.sale_price}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            variation.stock_status === 'instock' 
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {variation.stock_status === 'instock' ? 'In Stock' : 'Out of Stock'}
                            {variation.stock_quantity !== null && ` (${variation.stock_quantity})`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                No variations found. Variations are managed in WooCommerce.
              </div>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Note: Variation prices are managed directly in WooCommerce. Each variation is a separate product with its own price.
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <Link to="/products" className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            Cancel
          </Link>
        </div>
      </form>

      {/* Push to Store Section */}
      {pushableStores.length > 0 && (
        <div className="mt-6 bg-white p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Push to External Store</h2>
          <p className="text-sm text-gray-600 mb-4">
            Sync this product to your connected e-commerce platforms.
          </p>

          {pushResult && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              pushResult.success 
                ? 'bg-green-50 text-green-700' 
                : 'bg-red-50 text-red-600'
            }`}>
              {pushResult.message}
            </div>
          )}

          <div className="flex gap-3">
            <select
              value={selectedPushStore}
              onChange={e => setSelectedPushStore(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select a store...</option>
              {pushableStores.map(store => (
                <option key={store.id} value={store.id}>
                  {store.store_name || store.store_url} ({store.platform})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handlePushToStore}
              disabled={!selectedPushStore || pushing}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pushing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Pushing...
                </span>
              ) : (
                '🚀 Push to Store'
              )}
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            Connected stores: {pushableStores.map(s => s.platform).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}
