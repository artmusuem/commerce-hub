import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Product } from '../../types/database'

interface Store {
  id: string
  platform: string
  store_name: string | null
}

interface ChannelInfo {
  listing_id: string
  sync_status: string
  last_synced_at: string | null
  channel_product_id: string
}

interface ProductWithChannels extends Product {
  store_id?: string
  channels?: Record<string, ChannelInfo>
}

function getThumbnail(url: string, size: number = 100): string {
  if (!url) return ''
  if (url.includes('ids.si.edu')) {
    return url + (url.includes('?') ? '&' : '?') + `max=${size}`
  }
  return url
}

export function ProductsIndex() {
  const [searchParams, setSearchParams] = useSearchParams()
  
  // Derive selectedStore directly from URL - single source of truth
  const selectedStore = searchParams.get('store') || 'all'
  
  const [products, setProducts] = useState<ProductWithChannels[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  // Update URL when filter changes (for filter buttons)
  function setSelectedStoreFilter(storeId: string) {
    setSelectedIds(new Set())
    if (storeId === 'all') {
      setSearchParams({})
    } else {
      setSearchParams({ store: storeId })
    }
  }

  async function loadData() {
    const { data: storesData } = await supabase
      .from('stores')
      .select('id, platform, store_name')
      .order('created_at', { ascending: false })
    setStores(storesData || [])

    // Use products_with_channels view for channel badges
    const { data: productsData } = await supabase
      .from('products_with_channels')
      .select('*')
      .order('created_at', { ascending: false })
    setProducts(productsData || [])
    setLoading(false)
  }

  async function deleteProduct(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return
    await supabase.from('products').delete().eq('id', id)
    setProducts(products.filter(p => p.id !== id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function bulkDelete() {
    const count = selectedIds.size
    if (!confirm(`Delete ${count} selected product${count > 1 ? 's' : ''}? This cannot be undone.`)) return
    
    setDeleting(true)
    const ids = Array.from(selectedIds)
    
    const { error } = await supabase
      .from('products')
      .delete()
      .in('id', ids)
    
    if (!error) {
      setProducts(products.filter(p => !selectedIds.has(p.id)))
      setSelectedIds(new Set())
    } else {
      alert('Failed to delete some products')
    }
    setDeleting(false)
  }

  async function bulkDeleteAll() {
    const count = filteredProducts.length
    if (!confirm(`Delete ALL ${count} products in this view? This cannot be undone.`)) return
    
    setDeleting(true)
    const ids = filteredProducts.map(p => p.id)
    
    const { error } = await supabase
      .from('products')
      .delete()
      .in('id', ids)
    
    if (!error) {
      setProducts(products.filter(p => !ids.includes(p.id)))
      setSelectedIds(new Set())
    } else {
      alert('Failed to delete products')
    }
    setDeleting(false)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)))
    }
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    draft: 'bg-yellow-100 text-yellow-700',
    archived: 'bg-gray-100 text-gray-700',
  }

  const platformColors: Record<string, string> = {
    'gallery-store': 'bg-blue-100 text-blue-700',
    'woocommerce': 'bg-purple-100 text-purple-700',
    'etsy': 'bg-orange-100 text-orange-700',
  }

  const channelColors: Record<string, string> = {
    'woocommerce': 'bg-purple-100 text-purple-700 border-purple-200',
    'shopify': 'bg-green-100 text-green-700 border-green-200',
    'etsy': 'bg-orange-100 text-orange-700 border-orange-200',
    'gallery-store': 'bg-blue-100 text-blue-700 border-blue-200',
  }

  const channelLabels: Record<string, string> = {
    'woocommerce': 'WC',
    'shopify': 'Shopify',
    'etsy': 'Etsy',
    'gallery-store': 'Gallery',
  }

  const filteredProducts = selectedStore === 'all' 
    ? products 
    : selectedStore === 'unassigned'
    ? products.filter(p => !p.store_id)
    : products.filter(p => p.store_id === selectedStore)

  const getStore = (storeId: string | undefined) => {
    if (!storeId) return null
    return stores.find(s => s.id === storeId)
  }

  // Get current store name for header
  const currentStoreName = selectedStore === 'all' 
    ? null 
    : selectedStore === 'unassigned'
    ? 'Unassigned'
    : stores.find(s => s.id === selectedStore)?.store_name || stores.find(s => s.id === selectedStore)?.platform

  const allSelected = filteredProducts.length > 0 && selectedIds.size === filteredProducts.length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {currentStoreName ? `${currentStoreName} Products` : 'Products'}
          </h1>
          <p className="text-gray-600">{filteredProducts.length} of {products.length} products</p>
        </div>
        <div className="flex gap-2">
          <Link to="/products/import" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            📥 Import JSON
          </Link>
          <Link to="/products/new" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            + Add Product
          </Link>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between">
          <span className="text-blue-800 font-medium">
            {selectedIds.size} product{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Clear Selection
            </button>
            <button
              onClick={bulkDelete}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : `Delete Selected (${selectedIds.size})`}
            </button>
          </div>
        </div>
      )}

      {/* Store Filter */}
      {stores.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-sm font-medium text-gray-700">Filter by store:</span>
              <button
                onClick={() => setSelectedStoreFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedStore === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All ({products.length})
              </button>
              {stores.map(store => {
                const count = products.filter(p => p.store_id === store.id).length
                return (
                  <button
                    key={store.id}
                    onClick={() => setSelectedStoreFilter(store.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      selectedStore === store.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {store.store_name || store.platform} ({count})
                  </button>
                )
              })}
              {products.some(p => !p.store_id) && (
                <button
                  onClick={() => setSelectedStoreFilter('unassigned')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    selectedStore === 'unassigned' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Unassigned ({products.filter(p => !p.store_id).length})
                </button>
              )}
            </div>
            {filteredProducts.length > 0 && (
              <button
                onClick={bulkDeleteAll}
                disabled={deleting}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
              >
                Delete All ({filteredProducts.length})
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <p className="text-gray-500 mb-4">
            {selectedStore === 'all' ? 'No products yet' : 'No products in this store'}
          </p>
          <Link to="/products/new" className="text-blue-600 hover:underline">Create your first product</Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channels</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProducts.map(product => {
                const isSelected = selectedIds.has(product.id)
                return (
                  <tr key={product.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(product.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        {product.image_url ? (
                          <img src={getThumbnail(product.image_url)} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">📷</div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{product.title}</p>
                          {product.artist && <p className="text-sm text-gray-500">{product.artist}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-1">
                        {product.channels && Object.keys(product.channels).length > 0 ? (
                          Object.entries(product.channels).map(([channel, info]) => (
                            <span 
                              key={channel}
                              className={`px-2 py-0.5 rounded text-xs font-medium border ${channelColors[channel] || 'bg-gray-100 text-gray-700 border-gray-200'}`}
                              title={`ID: ${info.channel_product_id} • ${info.sync_status}`}
                            >
                              {channelLabels[channel] || channel}
                              {info.sync_status === 'error' && ' ⚠️'}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium">${product.price.toFixed(2)}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[product.status]}`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Link to={`/products/${product.id}`} className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded">Edit</Link>
                      <button onClick={() => deleteProduct(product.id, product.title)} className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded ml-2">Delete</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
