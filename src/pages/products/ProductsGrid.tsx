import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { transformToWooCommerce, transformToShopify } from '../../lib/transforms'

interface Product {
  id: string
  title: string
  description: string | null
  price: number
  artist: string | null
  category: string | null
  image_url: string | null
  sku: string | null
  status: string
  store_id: string | null
  external_id: string | null
  attributes: unknown
  created_at: string
}

interface Store {
  id: string
  platform: string
  store_name: string | null
  store_url: string | null
  api_credentials: Record<string, string> | null
}

type SortField = 'title' | 'price' | 'status' | 'created_at'
type SortDirection = 'asc' | 'desc'

function getThumbnail(url: string, size: number = 50): string {
  if (!url) return ''
  if (url.includes('ids.si.edu')) {
    return url + (url.includes('?') ? '&' : '?') + `max=${size}`
  }
  return url
}

export function ProductsGrid() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedStore = searchParams.get('store') || 'all'
  const searchQuery = searchParams.get('q') || ''
  
  const [products, setProducts] = useState<Product[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  
  // Sorting
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  
  // Inline editing
  const [editingCell, setEditingCell] = useState<{id: string, field: string} | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Bulk actions
  const [bulkAction, setBulkAction] = useState('')
  const [bulkPriceChange, setBulkPriceChange] = useState('')
  const [pushing, setPushing] = useState(false)
  const [pushResults, setPushResults] = useState<{store: string, success: number, failed: number}[]>([])

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCell])

  async function loadData() {
    const [storesRes, productsRes] = await Promise.all([
      supabase.from('stores').select('*').order('created_at'),
      supabase.from('products').select('*').order('created_at', { ascending: false })
    ])
    setStores(storesRes.data || [])
    setProducts(productsRes.data || [])
    setLoading(false)
  }

  // Filter products
  const filteredProducts = products.filter(p => {
    // Store filter
    if (selectedStore !== 'all') {
      const store = stores.find(s => s.id === p.store_id)
      if (selectedStore === 'shopify' && store?.platform !== 'shopify') return false
      if (selectedStore === 'woocommerce' && store?.platform !== 'woocommerce') return false
      if (selectedStore === 'gallery-store' && store?.platform !== 'gallery-store') return false
    }
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return p.title.toLowerCase().includes(q) || 
             p.sku?.toLowerCase().includes(q) ||
             p.artist?.toLowerCase().includes(q)
    }
    return true
  })

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    let aVal: string | number = ''
    let bVal: string | number = ''
    
    switch (sortField) {
      case 'title':
        aVal = a.title.toLowerCase()
        bVal = b.title.toLowerCase()
        break
      case 'price':
        aVal = a.price || 0
        bVal = b.price || 0
        break
      case 'status':
        aVal = a.status
        bVal = b.status
        break
      case 'created_at':
        aVal = a.created_at
        bVal = b.created_at
        break
    }
    
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  function setFilter(store: string) {
    setSelectedIds(new Set())
    if (store === 'all') {
      searchParams.delete('store')
    } else {
      searchParams.set('store', store)
    }
    setSearchParams(searchParams)
  }

  function setSearch(q: string) {
    if (q) {
      searchParams.set('q', q)
    } else {
      searchParams.delete('q')
    }
    setSearchParams(searchParams)
  }

  // Selection
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
    if (selectedIds.size === sortedProducts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedProducts.map(p => p.id)))
    }
  }

  // Inline editing
  function startEdit(id: string, field: string, value: string) {
    setEditingCell({ id, field })
    setEditValue(value)
  }

  async function saveEdit() {
    if (!editingCell) return
    
    const { id, field } = editingCell
    let value: string | number = editValue
    
    if (field === 'price') {
      value = parseFloat(editValue) || 0
    }
    
    setSaving(id)
    const { error } = await supabase
      .from('products')
      .update({ [field]: value })
      .eq('id', id)
    
    if (!error) {
      setProducts(products.map(p => 
        p.id === id ? { ...p, [field]: value } : p
      ))
    }
    
    setEditingCell(null)
    setSaving(null)
  }

  function cancelEdit() {
    setEditingCell(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      saveEdit()
    } else if (e.key === 'Escape') {
      cancelEdit()
    }
  }

  // Bulk actions
  async function executeBulkAction() {
    if (!bulkAction || selectedIds.size === 0) return
    
    const ids = Array.from(selectedIds)
    
    if (bulkAction === 'delete') {
      if (!confirm(`Delete ${ids.length} products? This cannot be undone.`)) return
      
      const { error } = await supabase.from('products').delete().in('id', ids)
      if (!error) {
        setProducts(products.filter(p => !selectedIds.has(p.id)))
        setSelectedIds(new Set())
      }
    } else if (bulkAction === 'set-active') {
      const { error } = await supabase.from('products').update({ status: 'active' }).in('id', ids)
      if (!error) {
        setProducts(products.map(p => selectedIds.has(p.id) ? { ...p, status: 'active' } : p))
      }
    } else if (bulkAction === 'set-draft') {
      const { error } = await supabase.from('products').update({ status: 'draft' }).in('id', ids)
      if (!error) {
        setProducts(products.map(p => selectedIds.has(p.id) ? { ...p, status: 'draft' } : p))
      }
    } else if (bulkAction === 'price-increase' && bulkPriceChange) {
      const percent = parseFloat(bulkPriceChange) / 100
      for (const id of ids) {
        const product = products.find(p => p.id === id)
        if (product) {
          const newPrice = Math.round(product.price * (1 + percent) * 100) / 100
          await supabase.from('products').update({ price: newPrice }).eq('id', id)
        }
      }
      await loadData()
    } else if (bulkAction === 'price-decrease' && bulkPriceChange) {
      const percent = parseFloat(bulkPriceChange) / 100
      for (const id of ids) {
        const product = products.find(p => p.id === id)
        if (product) {
          const newPrice = Math.round(product.price * (1 - percent) * 100) / 100
          await supabase.from('products').update({ price: newPrice }).eq('id', id)
        }
      }
      await loadData()
    }
    
    setBulkAction('')
    setBulkPriceChange('')
  }

  // Push to stores
  async function pushToStore(storeId: string) {
    if (selectedIds.size === 0) return
    
    const store = stores.find(s => s.id === storeId)
    if (!store) return
    
    setPushing(true)
    setPushResults([])
    
    let success = 0
    let failed = 0
    
    for (const productId of selectedIds) {
      const product = products.find(p => p.id === productId)
      if (!product) continue
      
      try {
        if (store.platform === 'woocommerce') {
          const credentials = store.api_credentials
          if (!credentials?.consumer_key) throw new Error('Missing credentials')
          
          const wooProduct = transformToWooCommerce({
            id: product.id,
            title: product.title,
            description: product.description,
            price: product.price,
            artist: product.artist,
            category: product.category,
            image_url: product.image_url,
            sku: product.sku,
            status: product.status as 'draft' | 'active' | 'archived',
          })
          
          const response = await fetch('/api/woocommerce/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              credentials: {
                siteUrl: store.store_url,
                consumerKey: credentials.consumer_key,
                consumerSecret: credentials.consumer_secret
              },
              product: wooProduct,
              existingProductId: product.external_id ? parseInt(product.external_id) : undefined
            })
          })
          
          if (!response.ok) throw new Error('Push failed')
          
          const result = await response.json()
          
          // Save external_id if new
          if (!product.external_id && result.id) {
            await supabase.from('products').update({ external_id: String(result.id) }).eq('id', product.id)
          }
          
          success++
        } else if (store.platform === 'shopify') {
          const credentials = store.api_credentials
          if (!credentials?.access_token) throw new Error('Missing credentials')
          
          const shopDomain = store.store_url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || ''
          
          // Get shopify tags from attributes
          const attrs = product.attributes as { shopify_tags?: string } | null
          const shopifyTags = attrs?.shopify_tags || ''
          
          const shopifyProduct = transformToShopify(
            {
              id: product.id,
              title: product.title,
              description: product.description,
              price: product.price,
              artist: product.artist,
              category: product.category,
              image_url: product.image_url,
              sku: product.sku,
              status: product.status as 'draft' | 'active' | 'archived',
            },
            store.store_name || 'Commerce Hub',
            shopifyTags
          )
          
          const isUpdate = product.external_id && !isNaN(parseInt(product.external_id))
          
          const response = await fetch('/api/shopify/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shop: shopDomain,
              accessToken: credentials.access_token,
              action: isUpdate ? 'update' : 'create',
              productId: isUpdate ? product.external_id : undefined,
              product: shopifyProduct
            })
          })
          
          if (!response.ok) throw new Error('Push failed')
          
          const result = await response.json()
          
          // Save external_id if new
          if (!product.external_id && result.product?.id) {
            await supabase.from('products').update({ external_id: String(result.product.id) }).eq('id', product.id)
          }
          
          success++
        }
      } catch (err) {
        console.error('Push error:', err)
        failed++
      }
    }
    
    setPushResults([{ store: store.platform, success, failed }])
    setPushing(false)
    await loadData() // Refresh to get updated external_ids
  }

  async function pushToAllStores() {
    if (selectedIds.size === 0) return
    
    setPushing(true)
    setPushResults([])
    const results: {store: string, success: number, failed: number}[] = []
    
    const pushableStores = stores.filter(s => 
      s.platform === 'woocommerce' || s.platform === 'shopify'
    )
    
    for (const store of pushableStores) {
      let success = 0
      let failed = 0
      
      for (const productId of selectedIds) {
        const product = products.find(p => p.id === productId)
        if (!product) continue
        
        try {
          if (store.platform === 'woocommerce') {
            const credentials = store.api_credentials
            if (!credentials?.consumer_key) throw new Error('Missing credentials')
            
            const wooProduct = transformToWooCommerce({
              id: product.id,
              title: product.title,
              description: product.description,
              price: product.price,
              artist: product.artist,
              category: product.category,
              image_url: product.image_url,
              sku: product.sku,
              status: product.status as 'draft' | 'active' | 'archived',
            })
            
            const response = await fetch('/api/woocommerce/push', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                credentials: {
                  siteUrl: store.store_url,
                  consumerKey: credentials.consumer_key,
                  consumerSecret: credentials.consumer_secret
                },
                product: wooProduct,
                existingProductId: product.external_id ? parseInt(product.external_id) : undefined
              })
            })
            
            if (!response.ok) throw new Error('Push failed')
            success++
          } else if (store.platform === 'shopify') {
            const credentials = store.api_credentials
            if (!credentials?.access_token) throw new Error('Missing credentials')
            
            const shopDomain = store.store_url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || ''
            const attrs = product.attributes as { shopify_tags?: string } | null
            const shopifyTags = attrs?.shopify_tags || ''
            
            const shopifyProduct = transformToShopify(
              {
                id: product.id,
                title: product.title,
                description: product.description,
                price: product.price,
                artist: product.artist,
                category: product.category,
                image_url: product.image_url,
                sku: product.sku,
                status: product.status as 'draft' | 'active' | 'archived',
              },
              store.store_name || 'Commerce Hub',
              shopifyTags
            )
            
            const isUpdate = product.external_id && !isNaN(parseInt(product.external_id))
            
            const response = await fetch('/api/shopify/products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                shop: shopDomain,
                accessToken: credentials.access_token,
                action: isUpdate ? 'update' : 'create',
                productId: isUpdate ? product.external_id : undefined,
                product: shopifyProduct
              })
            })
            
            if (!response.ok) throw new Error('Push failed')
            success++
          }
        } catch (err) {
          console.error('Push error:', err)
          failed++
        }
      }
      
      results.push({ store: store.platform, success, failed })
    }
    
    setPushResults(results)
    setPushing(false)
    await loadData()
  }

  function getStorePlatform(storeId: string | null): string {
    if (!storeId) return '-'
    const store = stores.find(s => s.id === storeId)
    return store?.platform || '-'
  }

  function getPlatformBadgeClass(platform: string): string {
    switch (platform) {
      case 'shopify': return 'bg-green-100 text-green-800'
      case 'woocommerce': return 'bg-purple-100 text-purple-800'
      case 'gallery-store': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return <div className="p-8 text-center">Loading products...</div>
  }

  const pushableStores = stores.filter(s => 
    s.platform === 'woocommerce' || s.platform === 'shopify'
  )

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-500">{filteredProducts.length} products</p>
        </div>
        <Link
          to="/products/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Add Product
        </Link>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-wrap gap-4 mb-4">
        {/* Platform Filter Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {['all', 'shopify', 'woocommerce', 'gallery-store'].map(filter => (
            <button
              key={filter}
              onClick={() => setFilter(filter)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                selectedStore === filter
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1).replace('-', ' ')}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <span className="font-medium text-blue-900">
            {selectedIds.size} selected
          </span>
          
          <select
            value={bulkAction}
            onChange={e => setBulkAction(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Bulk Actions...</option>
            <option value="set-active">Set Active</option>
            <option value="set-draft">Set Draft</option>
            <option value="price-increase">Increase Price %</option>
            <option value="price-decrease">Decrease Price %</option>
            <option value="delete">Delete</option>
          </select>
          
          {(bulkAction === 'price-increase' || bulkAction === 'price-decrease') && (
            <input
              type="number"
              placeholder="%"
              value={bulkPriceChange}
              onChange={e => setBulkPriceChange(e.target.value)}
              className="w-20 px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
            />
          )}
          
          {bulkAction && (
            <button
              onClick={executeBulkAction}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              Apply
            </button>
          )}
          
          <div className="border-l border-blue-300 h-6 mx-2" />
          
          {/* Push to Store Dropdown */}
          <div className="relative group">
            <button
              disabled={pushing}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {pushing ? 'Pushing...' : 'Push to Store ▼'}
            </button>
            <div className="absolute left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              {pushableStores.map(store => (
                <button
                  key={store.id}
                  onClick={() => pushToStore(store.id)}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                >
                  {store.store_name || store.platform}
                </button>
              ))}
              <div className="border-t border-gray-200" />
              <button
                onClick={pushToAllStores}
                className="block w-full text-left px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
              >
                Push to All Stores
              </button>
            </div>
          </div>
          
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-gray-600 hover:text-gray-900 text-sm"
          >
            Clear Selection
          </button>
        </div>
      )}

      {/* Push Results */}
      {pushResults.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <h4 className="font-medium mb-2">Push Results:</h4>
          {pushResults.map((r, i) => (
            <p key={i} className="text-sm">
              <span className="font-medium">{r.store}:</span>{' '}
              <span className="text-green-600">{r.success} succeeded</span>
              {r.failed > 0 && <span className="text-red-600">, {r.failed} failed</span>}
            </p>
          ))}
        </div>
      )}

      {/* Spreadsheet Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === sortedProducts.length && sortedProducts.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded"
                  />
                </th>
                <th className="w-16 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Image
                </th>
                <th 
                  className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('title')}
                >
                  Title {sortField === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="w-28 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('price')}
                >
                  Price {sortField === 'price' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th 
                  className="w-24 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:text-gray-700"
                  onClick={() => toggleSort('status')}
                >
                  Status {sortField === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="w-28 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Store
                </th>
                <th className="w-20 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Synced
                </th>
                <th className="w-24 px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map(product => {
                const platform = getStorePlatform(product.store_id)
                const isEditing = editingCell?.id === product.id
                
                return (
                  <tr 
                    key={product.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 ${
                      selectedIds.has(product.id) ? 'bg-blue-50' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(product.id)}
                        onChange={() => toggleSelect(product.id)}
                        className="rounded"
                      />
                    </td>
                    
                    {/* Image */}
                    <td className="px-3 py-2">
                      {product.image_url ? (
                        <img
                          src={getThumbnail(product.image_url)}
                          alt=""
                          className="w-10 h-10 object-cover rounded"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">
                          No img
                        </div>
                      )}
                    </td>
                    
                    {/* Title - Editable */}
                    <td className="px-3 py-2">
                      {isEditing && editingCell.field === 'title' ? (
                        <input
                          ref={inputRef}
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={handleKeyDown}
                          className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none"
                        />
                      ) : (
                        <span
                          onClick={() => startEdit(product.id, 'title', product.title)}
                          className="cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded block truncate max-w-xs"
                          title="Click to edit"
                        >
                          {product.title}
                        </span>
                      )}
                    </td>
                    
                    {/* Price - Editable */}
                    <td className="px-3 py-2">
                      {isEditing && editingCell.field === 'price' ? (
                        <input
                          ref={inputRef}
                          type="number"
                          step="0.01"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={saveEdit}
                          onKeyDown={handleKeyDown}
                          className="w-full px-2 py-1 border border-blue-500 rounded focus:outline-none"
                        />
                      ) : (
                        <span
                          onClick={() => startEdit(product.id, 'price', String(product.price || 0))}
                          className="cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded"
                          title="Click to edit"
                        >
                          ${(product.price || 0).toFixed(2)}
                        </span>
                      )}
                      {saving === product.id && (
                        <span className="ml-1 text-xs text-gray-400">saving...</span>
                      )}
                    </td>
                    
                    {/* Status - Editable */}
                    <td className="px-3 py-2">
                      {isEditing && editingCell.field === 'status' ? (
                        <select
                          value={editValue}
                          onChange={e => {
                            setEditValue(e.target.value)
                            setTimeout(saveEdit, 0)
                          }}
                          onBlur={saveEdit}
                          className="px-2 py-1 border border-blue-500 rounded focus:outline-none text-sm"
                        >
                          <option value="active">Active</option>
                          <option value="draft">Draft</option>
                          <option value="archived">Archived</option>
                        </select>
                      ) : (
                        <span
                          onClick={() => startEdit(product.id, 'status', product.status)}
                          className={`cursor-pointer px-2 py-0.5 rounded-full text-xs font-medium ${
                            product.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : product.status === 'draft'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                          title="Click to edit"
                        >
                          {product.status}
                        </span>
                      )}
                    </td>
                    
                    {/* Store */}
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPlatformBadgeClass(platform)}`}>
                        {platform}
                      </span>
                    </td>
                    
                    {/* Synced */}
                    <td className="px-3 py-2">
                      {product.external_id ? (
                        <span className="text-green-600 text-sm">✓</span>
                      ) : (
                        <span className="text-gray-400 text-sm">-</span>
                      )}
                    </td>
                    
                    {/* Actions */}
                    <td className="px-3 py-2">
                      <Link
                        to={`/products/${product.id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        
        {sortedProducts.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No products found
          </div>
        )}
      </div>

      {/* Keyboard shortcuts hint */}
      <p className="mt-4 text-xs text-gray-400">
        Tip: Click any cell to edit inline. Press Enter to save, Escape to cancel.
      </p>
    </div>
  )
}

export default ProductsGrid
