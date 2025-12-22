import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Product } from '../../types/database'

interface Store {
  id: string
  platform: string
  store_name: string | null
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
  
  const [products, setProducts] = useState<(Product & { store_id?: string })[]>([])
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

    const { data: productsData } = await supabase
      .from('products')
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

  // Get status filter from URL
  const statusFilter = searchParams.get('status')

  // Filter products by store and status
  let filteredProducts = selectedStore === 'all' 
    ? products 
    : selectedStore === 'unassigned'
    ? products.filter(p => !p.store_id)
    : products.filter(p => p.store_id === selectedStore)

  // Apply status filter if set
  if (statusFilter) {
    filteredProducts = filteredProducts.filter(p => p.status === statusFilter)
  }

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
    <div className="max-w-7xl mx-auto">
      {/* Header - Shopify Style */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Products</h1>
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
            Export
          </button>
          <Link to="/products/import" className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
            Import
          </Link>
          <Link to="/products/new" className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium">
            Add product
          </Link>
        </div>
      </div>

      {/* Status Filter Tabs - Shopify Style */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
        <button
          onClick={() => setSearchParams({})}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            selectedStore === 'all' && !searchParams.get('status')
              ? 'border-gray-900 text-gray-900' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setSearchParams({ status: 'active' })}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            searchParams.get('status') === 'active'
              ? 'border-gray-900 text-gray-900' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => setSearchParams({ status: 'draft' })}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            searchParams.get('status') === 'draft'
              ? 'border-gray-900 text-gray-900' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Draft
        </button>
        <button
          onClick={() => setSearchParams({ status: 'archived' })}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            searchParams.get('status') === 'archived'
              ? 'border-gray-900 text-gray-900' 
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Archived
        </button>
        <div className="ml-auto flex items-center gap-2 pb-2">
          <span className="text-sm text-gray-500">{filteredProducts.length} products</span>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center justify-between">
          <span className="text-blue-800 font-medium text-sm">
            {selectedIds.size} product{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded text-sm"
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

      {/* Store Filter - Secondary */}
      {stores.length > 1 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs font-medium text-gray-500 uppercase">Store:</span>
          <button
            onClick={() => setSelectedStoreFilter('all')}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              selectedStore === 'all' ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            All
          </button>
          {stores.map(store => {
            const count = products.filter(p => p.store_id === store.id).length
            return (
              <button
                key={store.id}
                onClick={() => setSelectedStoreFilter(store.id)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1 ${
                  selectedStore === store.id ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {store.platform === 'shopify' && '🛍️'}
                {store.platform === 'woocommerce' && '🛒'}
                {store.platform === 'gallery-store' && '🖼️'}
                {store.store_name || store.platform}
                <span className="text-gray-400">({count})</span>
              </button>
            )
          })}
          {products.some(p => !p.store_id) && (
            <button
              onClick={() => setSelectedStoreFilter('unassigned')}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                selectedStore === 'unassigned' ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              Unassigned ({products.filter(p => !p.store_id).length})
            </button>
          )}
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
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inventory</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channels</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProducts.map(product => {
                const store = getStore(product.store_id)
                const isSelected = selectedIds.has(product.id)
                // Calculate inventory display
                const inventory = (product as any).quantity ?? (product as any).variants?.reduce(
                  (sum: number, v: any) => sum + (v.inventory_quantity || 0), 0
                ) ?? 100
                return (
                  <tr key={product.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(product.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {product.image_url ? (
                          <img src={getThumbnail(product.image_url)} alt="" className="w-10 h-10 rounded object-cover bg-gray-100" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-sm">📷</div>
                        )}
                        <div className="min-w-0">
                          <Link to={`/products/${product.id}`} className="font-medium text-gray-900 hover:text-blue-600 block truncate max-w-xs">
                            {product.title}
                          </Link>
                          {product.sku && <p className="text-xs text-gray-500">{product.sku}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                        product.status === 'active' 
                          ? 'bg-green-100 text-green-700' 
                          : product.status === 'draft'
                            ? 'bg-gray-100 text-gray-600'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {product.status === 'active' ? 'Active' : product.status === 'draft' ? 'Draft' : product.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {inventory > 0 ? `${inventory} in stock` : <span className="text-red-600">Out of stock</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {product.category || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {store ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs ${platformColors[store.platform] || 'bg-gray-100 text-gray-700'}`}>
                          {store.platform === 'shopify' && '🛍️'}
                          {store.platform === 'woocommerce' && '🛒'}
                          {store.platform === 'gallery-store' && '🖼️'}
                          {store.platform === 'etsy' && '🧶'}
                          <span className="font-medium">1</span>
                        </span>
                      ) : (
                        <span className="text-gray-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link to={`/products/${product.id}`} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </Link>
                        <button 
                          onClick={() => deleteProduct(product.id, product.title)} 
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
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
