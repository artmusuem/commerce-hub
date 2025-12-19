import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface Store {
  id: string
  platform: string
  shop_name: string | null
}

interface OrphanStats {
  total: number
  smithsonian: number
  woocommerce: number
  other: number
}

export function LinkProducts() {
  const [stores, setStores] = useState<Store[]>([])
  const [orphanStats, setOrphanStats] = useState<OrphanStats>({ total: 0, smithsonian: 0, woocommerce: 0, other: 0 })
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(false)
  const [results, setResults] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    // Load stores
    const { data: storesData } = await supabase
      .from('stores')
      .select('id, platform, shop_name')
    setStores(storesData || [])

    // Count orphan products by type
    const { data: orphans } = await supabase
      .from('products')
      .select('id, image_url, title')
      .is('store_id', null)

    if (orphans) {
      const smithsonian = orphans.filter(p => 
        p.image_url?.includes('ids.si.edu') || 
        p.title?.toLowerCase().includes('smithsonian')
      ).length
      
      const woocommerce = orphans.filter(p => 
        !p.image_url?.includes('ids.si.edu') &&
        (p.image_url?.includes('rapidwoo.com') || p.image_url?.includes('woocommerce'))
      ).length

      setOrphanStats({
        total: orphans.length,
        smithsonian,
        woocommerce,
        other: orphans.length - smithsonian - woocommerce
      })
    }

    setLoading(false)
  }

  async function linkSmithsonianProducts() {
    setLinking(true)
    setResults(null)

    // Find Gallery Store
    const galleryStore = stores.find(s => s.platform === 'gallery-store')
    if (!galleryStore) {
      setResults('Error: No Gallery Store found. Import a store first.')
      setLinking(false)
      return
    }

    // Update all Smithsonian products
    const { data: orphans } = await supabase
      .from('products')
      .select('id, image_url')
      .is('store_id', null)

    const smithsonianIds = orphans
      ?.filter(p => p.image_url?.includes('ids.si.edu'))
      .map(p => p.id) || []

    if (smithsonianIds.length === 0) {
      setResults('No Smithsonian products found to link.')
      setLinking(false)
      return
    }

    const { error } = await supabase
      .from('products')
      .update({ store_id: galleryStore.id })
      .in('id', smithsonianIds)

    if (error) {
      setResults(`Error: ${error.message}`)
    } else {
      setResults(`✅ Linked ${smithsonianIds.length} products to ${galleryStore.shop_name || 'Gallery Store'}`)
      await loadData() // Refresh stats
    }

    setLinking(false)
  }

  async function linkWooCommerceProducts() {
    setLinking(true)
    setResults(null)

    // Find WooCommerce Store
    const wooStore = stores.find(s => s.platform === 'woocommerce')
    if (!wooStore) {
      setResults('Error: No WooCommerce store found. Connect one first.')
      setLinking(false)
      return
    }

    // Update all WooCommerce products (non-Smithsonian)
    const { data: orphans } = await supabase
      .from('products')
      .select('id, image_url')
      .is('store_id', null)

    const wooIds = orphans
      ?.filter(p => !p.image_url?.includes('ids.si.edu'))
      .map(p => p.id) || []

    if (wooIds.length === 0) {
      setResults('No WooCommerce products found to link.')
      setLinking(false)
      return
    }

    const { error } = await supabase
      .from('products')
      .update({ store_id: wooStore.id })
      .in('id', wooIds)

    if (error) {
      setResults(`Error: ${error.message}`)
    } else {
      setResults(`✅ Linked ${wooIds.length} products to ${wooStore.shop_name || 'WooCommerce'}`)
      await loadData() // Refresh stats
    }

    setLinking(false)
  }

  async function linkAllToStore(storeId: string) {
    setLinking(true)
    setResults(null)

    const store = stores.find(s => s.id === storeId)
    if (!store) {
      setResults('Error: Store not found.')
      setLinking(false)
      return
    }

    const { data: orphans } = await supabase
      .from('products')
      .select('id')
      .is('store_id', null)

    const ids = orphans?.map(p => p.id) || []

    if (ids.length === 0) {
      setResults('No orphan products to link.')
      setLinking(false)
      return
    }

    const { error } = await supabase
      .from('products')
      .update({ store_id: storeId })
      .in('id', ids)

    if (error) {
      setResults(`Error: ${error.message}`)
    } else {
      setResults(`✅ Linked ${ids.length} products to ${store.shop_name || store.platform}`)
      await loadData()
    }

    setLinking(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link to="/stores" className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-flex items-center gap-1">
          ← Back to Stores
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Link Orphan Products</h1>
        <p className="text-gray-600">Assign unlinked products to their source stores</p>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Orphan Products Summary</h2>
        
        {orphanStats.total === 0 ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-2">✅</div>
            <p className="text-green-600 font-medium">All products are linked to stores!</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-gray-600">Total Unlinked</span>
              <span className="text-xl font-bold text-red-600">{orphanStats.total}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Smithsonian Images (ids.si.edu)</span>
              <span className="font-medium text-blue-600">{orphanStats.smithsonian}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">WooCommerce / Other</span>
              <span className="font-medium text-purple-600">{orphanStats.total - orphanStats.smithsonian}</span>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {results && (
        <div className={`p-4 rounded-xl mb-6 ${results.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {results}
        </div>
      )}

      {/* Actions */}
      {orphanStats.total > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Link Actions</h2>
          
          <div className="space-y-4">
            {/* Link Smithsonian */}
            {orphanStats.smithsonian > 0 && stores.some(s => s.platform === 'gallery-store') && (
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Link Smithsonian Products</p>
                  <p className="text-sm text-gray-500">
                    {orphanStats.smithsonian} products with ids.si.edu images → Gallery Store
                  </p>
                </div>
                <button
                  onClick={linkSmithsonianProducts}
                  disabled={linking}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {linking ? 'Linking...' : 'Link Now'}
                </button>
              </div>
            )}

            {/* Link WooCommerce */}
            {(orphanStats.total - orphanStats.smithsonian) > 0 && stores.some(s => s.platform === 'woocommerce') && (
              <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Link WooCommerce Products</p>
                  <p className="text-sm text-gray-500">
                    {orphanStats.total - orphanStats.smithsonian} remaining products → WooCommerce
                  </p>
                </div>
                <button
                  onClick={linkWooCommerceProducts}
                  disabled={linking}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {linking ? 'Linking...' : 'Link Now'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Assignment */}
      {orphanStats.total > 0 && stores.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Manual Assignment</h2>
          <p className="text-sm text-gray-500 mb-4">Link all {orphanStats.total} orphan products to a specific store:</p>
          
          <div className="grid grid-cols-2 gap-3">
            {stores.map(store => (
              <button
                key={store.id}
                onClick={() => linkAllToStore(store.id)}
                disabled={linking}
                className="p-4 border rounded-lg hover:bg-gray-50 text-left disabled:opacity-50"
              >
                <p className="font-medium text-gray-900">{store.shop_name || store.platform}</p>
                <p className="text-xs text-gray-500 capitalize">{store.platform}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
