import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Product } from '../../types/database'

interface Store {
  id: string
  platform: string
  shop_name: string | null
  shop_url: string | null
  store_url: string | null
  is_active: boolean
  last_sync_at: string | null
  sync_status: string | null
  created_at: string
}

interface ProductStats {
  total: number
  active: number
  draft: number
  archived: number
}

function getThumbnail(url: string, size: number = 100): string {
  if (!url) return ''
  if (url.includes('ids.si.edu')) {
    return url + (url.includes('?') ? '&' : '?') + `max=${size}`
  }
  return url
}

const platformConfig: Record<string, { color: string; bgColor: string; icon: string; name: string }> = {
  'gallery-store': { color: 'text-blue-700', bgColor: 'bg-blue-100', icon: 'G', name: 'Gallery Store' },
  'woocommerce': { color: 'text-purple-700', bgColor: 'bg-purple-100', icon: 'W', name: 'WooCommerce' },
  'etsy': { color: 'text-orange-700', bgColor: 'bg-orange-100', icon: 'E', name: 'Etsy' },
  'shopify': { color: 'text-green-700', bgColor: 'bg-green-100', icon: 'S', name: 'Shopify' },
}

export function StoreDetail() {
  const { storeId } = useParams<{ storeId: string }>()
  const navigate = useNavigate()
  const [store, setStore] = useState<Store | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [stats, setStats] = useState<ProductStats>({ total: 0, active: 0, draft: 0, archived: 0 })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    if (storeId) {
      loadStoreData()
    }
  }, [storeId])

  async function loadStoreData() {
    setLoading(true)
    
    // Load store details
    const { data: storeData, error: storeError } = await supabase
      .from('stores')
      .select('*')
      .eq('id', storeId)
      .single()
    
    if (storeError || !storeData) {
      console.error('Store not found:', storeError)
      setLoading(false)
      return
    }
    
    setStore(storeData)
    
    // Load products for this store
    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(10)
    
    setProducts(productsData || [])
    
    // Get product stats
    const { count: total } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
    
    const { count: active } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('status', 'active')
    
    const { count: draft } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('status', 'draft')
    
    const { count: archived } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('status', 'archived')
    
    setStats({
      total: total || 0,
      active: active || 0,
      draft: draft || 0,
      archived: archived || 0
    })
    
    setLoading(false)
  }

  async function handleSync() {
    if (!store) return
    setSyncing(true)
    
    // Update last sync timestamp
    await supabase
      .from('stores')
      .update({ 
        last_sync_at: new Date().toISOString(),
        sync_status: 'success'
      })
      .eq('id', store.id)
    
    // Reload data
    await loadStoreData()
    setSyncing(false)
  }

  async function handleDisconnect() {
    if (!store) return
    if (!confirm(`Disconnect "${store.shop_name || store.platform}"? Products will remain but be unlinked.`)) return
    
    // Unlink products
    await supabase
      .from('products')
      .update({ store_id: null })
      .eq('store_id', store.id)
    
    // Delete store
    await supabase
      .from('stores')
      .delete()
      .eq('id', store.id)
    
    navigate('/stores')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!store) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Store Not Found</h2>
        <p className="text-gray-600 mb-4">This store may have been disconnected.</p>
        <Link to="/stores" className="text-blue-600 hover:underline">← Back to Stores</Link>
      </div>
    )
  }

  const config = platformConfig[store.platform] || { color: 'text-gray-700', bgColor: 'bg-gray-100', icon: '?', name: store.platform }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/stores" className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-flex items-center gap-1">
          ← Back to Stores
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 ${config.bgColor} rounded-xl flex items-center justify-center text-2xl font-bold ${config.color}`}>
              {config.icon}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{store.shop_name || config.name}</h1>
              <p className="text-gray-500 capitalize">{config.name}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Syncing...
                </>
              ) : (
                <>🔄 Sync Now</>
              )}
            </button>
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500 mb-1">Total Products</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500 mb-1">Active</p>
          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500 mb-1">Draft</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.draft}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500 mb-1">Archived</p>
          <p className="text-2xl font-bold text-gray-400">{stats.archived}</p>
        </div>
      </div>

      {/* Store Info */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Connection Details</h2>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-gray-500">Platform</dt>
              <dd className="text-gray-900 font-medium capitalize">{config.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Status</dt>
              <dd>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  store.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {store.is_active ? 'Active' : 'Inactive'}
                </span>
              </dd>
            </div>
            {store.store_url && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Store URL</dt>
                <dd>
                  <a href={store.store_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {new URL(store.store_url).hostname}
                  </a>
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Connected</dt>
              <dd className="text-gray-900">{new Date(store.created_at).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Last Sync</dt>
              <dd className="text-gray-900">
                {store.last_sync_at ? new Date(store.last_sync_at).toLocaleString() : 'Never'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              to={`/products?store=${store.id}`}
              className="block w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-left transition-colors"
            >
              <div className="font-medium text-gray-900">📦 View All Products</div>
              <div className="text-sm text-gray-500">Manage {stats.total} products in this store</div>
            </Link>
            <Link
              to="/products/new"
              state={{ storeId: store.id }}
              className="block w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-left transition-colors"
            >
              <div className="font-medium text-gray-900">➕ Add Product</div>
              <div className="text-sm text-gray-500">Create a new product for this store</div>
            </Link>
            <Link
              to="/products/import"
              state={{ storeId: store.id }}
              className="block w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg text-left transition-colors"
            >
              <div className="font-medium text-gray-900">📥 Import Products</div>
              <div className="text-sm text-gray-500">Bulk import from JSON file</div>
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Products */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Products</h2>
          {stats.total > 0 && (
            <Link to={`/products?store=${store.id}`} className="text-sm text-blue-600 hover:underline">
              View all {stats.total} →
            </Link>
          )}
        </div>
        
        {products.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-gray-500 mb-4">No products in this store yet</p>
            <div className="flex gap-3 justify-center">
              <Link
                to="/products/new"
                state={{ storeId: store.id }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add Product
              </Link>
              <Link
                to="/products/import"
                state={{ storeId: store.id }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Import JSON
              </Link>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {products.map(product => (
                <tr key={product.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {product.image_url ? (
                        <img src={getThumbnail(product.image_url)} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-100" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">📷</div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900 line-clamp-1">{product.title}</p>
                        {product.artist && <p className="text-sm text-gray-500">{product.artist}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium">${product.price.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      product.status === 'active' ? 'bg-green-100 text-green-700' :
                      product.status === 'draft' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {product.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <Link to={`/products/${product.id}`} className="text-blue-600 hover:underline text-sm">
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
