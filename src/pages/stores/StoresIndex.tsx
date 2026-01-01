import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { initiateEtsyOAuth } from '../../lib/etsy'
import { transformToWooCommerce, transformToShopify } from '../../lib/transforms'
import { pushProductToWooCommerce } from '../../lib/woocommerce'

interface Store {
  id: string
  platform: string
  name: string
  url: string | null
  is_active: boolean
  last_sync_at: string | null
  product_count?: number
  store_url?: string
  api_credentials?: Record<string, unknown>
}

const platformConfig: Record<string, { color: string; bgColor: string; hoverBg: string; icon: string }> = {
  'gallery-store': { color: 'bg-blue-600', bgColor: 'bg-blue-100', hoverBg: 'hover:bg-blue-50', icon: 'G' },
  'woocommerce': { color: 'bg-purple-600', bgColor: 'bg-purple-100', hoverBg: 'hover:bg-purple-50', icon: 'W' },
  'etsy': { color: 'bg-orange-500', bgColor: 'bg-orange-100', hoverBg: 'hover:bg-orange-50', icon: 'E' },
  'shopify': { color: 'bg-green-600', bgColor: 'bg-green-100', hoverBg: 'hover:bg-green-50', icon: 'S' },
  'amazon': { color: 'bg-yellow-500', bgColor: 'bg-yellow-100', hoverBg: 'hover:bg-yellow-50', icon: 'A' },
}

export function StoresIndex() {
  const navigate = useNavigate()
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  
  // Bulk push state
  const [bulkPushing, setBulkPushing] = useState<string | null>(null) // 'woocommerce' | 'shopify' | null
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 })
  const [bulkResult, setBulkResult] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    loadStores()
  }, [])

  async function loadStores() {
    const { data: storesData } = await supabase
      .from('stores')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (!storesData) {
      setStores([])
      setLoading(false)
      return
    }

    const storesWithCounts = await Promise.all(
      storesData.map(async (store) => {
        const { count } = await supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('store_id', store.id)
        
        return { ...store, product_count: count || 0 }
      })
    )
    
    setStores(storesWithCounts)
    setLoading(false)
  }

  async function connectEtsy() {
    setConnecting(true)
    try {
      await initiateEtsyOAuth()
    } catch (err) {
      console.error('Failed to initiate OAuth:', err)
      setConnecting(false)
    }
  }

  async function disconnectStore(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!confirm('Disconnect this store? Products will remain but be unlinked.')) return
    
    await supabase
      .from('products')
      .update({ store_id: null })
      .eq('store_id', id)
    
    await supabase.from('stores').delete().eq('id', id)
    setStores(stores.filter(s => s.id !== id))
  }

  async function handleBulkPush(targetPlatform: 'woocommerce' | 'shopify') {
    // Find Gallery Store
    const galleryStore = stores.find(s => s.platform === 'gallery-store')
    if (!galleryStore) {
      setBulkResult({ message: 'Gallery Store not found', type: 'error' })
      return
    }

    // Find target store
    const targetStore = stores.find(s => s.platform === targetPlatform)
    if (!targetStore) {
      setBulkResult({ message: `${targetPlatform} store not connected`, type: 'error' })
      return
    }

    // Fetch full store data with credentials
    const { data: targetStoreData } = await supabase
      .from('stores')
      .select('*')
      .eq('id', targetStore.id)
      .single()

    if (!targetStoreData?.api_credentials) {
      setBulkResult({ message: `${targetPlatform} API credentials not found`, type: 'error' })
      return
    }

    // Fetch all Gallery Store products
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', galleryStore.id)

    if (error || !products) {
      setBulkResult({ message: 'Failed to fetch Gallery Store products', type: 'error' })
      return
    }

    setBulkPushing(targetPlatform)
    setBulkProgress({ current: 0, total: products.length, success: 0, failed: 0 })
    setBulkResult(null)

    let success = 0
    let failed = 0

    for (let i = 0; i < products.length; i++) {
      const product = products[i]
      setBulkProgress(prev => ({ ...prev, current: i + 1 }))

      try {
        if (targetPlatform === 'woocommerce') {
          const credentials = targetStoreData.api_credentials as { consumer_key: string; consumer_secret: string }
          const wooProduct = transformToWooCommerce(product)
          await pushProductToWooCommerce(
            {
              siteUrl: targetStoreData.store_url || '',
              consumerKey: credentials.consumer_key,
              consumerSecret: credentials.consumer_secret
            },
            wooProduct,
            undefined // Always create new (don't update)
          )
          success++
        } else if (targetPlatform === 'shopify') {
          const credentials = targetStoreData.api_credentials as { access_token: string }
          const shopDomain = targetStoreData.store_url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || ''
          
          // Check if product already exists on Shopify
          const existingShopifyId = product.platform_ids?.shopify
          const isUpdate = !!existingShopifyId
          
          const shopifyProduct = transformToShopify(product, targetStoreData.store_name || 'Commerce Hub')
          
          const response = await fetch('/api/shopify/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shop: shopDomain,
              accessToken: credentials.access_token,
              action: isUpdate ? 'update' : 'create',
              productId: isUpdate ? existingShopifyId : undefined,
              product: shopifyProduct
            })
          })

          if (!response.ok) {
            throw new Error('Shopify push failed')
          }
          
          const result = await response.json()
          const productId = result.product?.id
          
          // Save Shopify ID to platform_ids after create
          if (productId && !isUpdate) {
            await supabase
              .from('products')
              .update({ platform_ids: { ...product.platform_ids, shopify: String(productId) } })
              .eq('id', product.id)
          }
          
          // Set taxonomy category (same as single product push)
          if (productId && product.category) {
            await fetch('/api/shopify/taxonomy', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                shop: shopDomain,
                accessToken: credentials.access_token,
                productId: productId,
                categoryName: product.category
              })
            })
          }
          
          // Ensure Smart Collection exists
          if (product.category) {
            await fetch('/api/shopify/collection', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                shop: shopDomain,
                accessToken: credentials.access_token,
                productType: product.category
              })
            })
          }
          
          success++
        }
      } catch (err) {
        console.error(`Failed to push product ${product.title}:`, err)
        failed++
      }

      setBulkProgress(prev => ({ ...prev, success, failed }))
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    setBulkPushing(null)
    setBulkResult({
      message: `Completed: ${success} succeeded, ${failed} failed`,
      type: failed === 0 ? 'success' : 'error'
    })
  }

  const etsyConnected = stores.some(s => s.platform === 'etsy')
  const wooConnected = stores.some(s => s.platform === 'woocommerce')
  const shopifyConnected = stores.some(s => s.platform === 'shopify')

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Connected Stores</h1>
          <p className="text-gray-600">Manage your marketplace connections</p>
        </div>
      </div>

      {/* Import Existing Store */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-sm p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Import Existing Store</h2>
            <p className="text-blue-100 text-sm mt-1">Connect Gallery Store and import all products to your database</p>
          </div>
          <Link
            to="/stores/import"
            className="px-4 py-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50 font-medium"
          >
            Import Store →
          </Link>
        </div>
      </div>

      {/* Connect New Store */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Store Connection</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Etsy */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold">E</div>
              <div>
                <p className="font-medium">Etsy</p>
                <p className="text-xs text-gray-500">Handmade marketplace</p>
              </div>
            </div>
            {etsyConnected ? (
              <span className="text-sm text-green-600">✓ Connected</span>
            ) : (
              <button
                onClick={connectEtsy}
                disabled={connecting}
                className="w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 text-sm"
              >
                {connecting ? 'Connecting...' : 'Connect Etsy'}
              </button>
            )}
          </div>

          {/* WooCommerce */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold">W</div>
              <div>
                <p className="font-medium">WooCommerce</p>
                <p className="text-xs text-gray-500">WordPress stores</p>
              </div>
            </div>
            {wooConnected ? (
              <div className="space-y-2">
                <span className="text-sm text-green-600 block">✓ Connected</span>
                <Link
                  to="/stores/woocommerce"
                  className="block w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm text-center"
                >
                  Import Products
                </Link>
              </div>
            ) : (
              <Link
                to="/stores/woocommerce"
                className="block w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm text-center"
              >
                Connect WooCommerce
              </Link>
            )}
          </div>

          {/* Shopify - NOW ACTIVE */}
          <div className="border rounded-lg p-4 border-green-200 bg-green-50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold">S</div>
              <div>
                <p className="font-medium">Shopify</p>
                <p className="text-xs text-gray-500">E-commerce platform</p>
              </div>
            </div>
            {shopifyConnected ? (
              <div className="space-y-2">
                <span className="text-sm text-green-600 block">✓ Connected</span>
                <Link
                  to="/stores/shopify/import"
                  className="block w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm text-center"
                >
                  Import Products
                </Link>
              </div>
            ) : (
              <Link
                to="/stores/shopify"
                className="block w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm text-center"
              >
                Connect Shopify
              </Link>
            )}
          </div>

          {/* Amazon - Coming Soon */}
          <div className="border rounded-lg p-4 opacity-50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-yellow-500 rounded-lg flex items-center justify-center text-white font-bold">A</div>
              <div>
                <p className="font-medium">Amazon</p>
                <p className="text-xs text-gray-500">Global marketplace</p>
              </div>
            </div>
            <span className="text-sm text-gray-400">Coming Soon</span>
          </div>
        </div>
      </div>

      {/* Connected Stores List */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : stores.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <div className="text-4xl mb-3">🏪</div>
          <p className="text-gray-500 mb-2">No stores connected yet</p>
          <p className="text-sm text-gray-400">Connect a store above to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Your Stores</h2>
            <p className="text-sm text-gray-500">Click a store to view and manage its products</p>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Store</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Products</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Sync</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stores.map(store => {
                const config = platformConfig[store.platform] || { color: 'bg-gray-500', bgColor: 'bg-gray-100', hoverBg: 'hover:bg-gray-50', icon: '?' }
                return (
                  <tr 
                    key={store.id} 
                    onClick={() => navigate(`/products?store=${store.id}`)}
                    className={`${config.hoverBg} cursor-pointer transition-colors`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${config.color}`}>
                          {config.icon}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{store.name || store.platform}</p>
                          <p className="text-xs text-gray-500 capitalize">{store.platform}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-gray-900">{store.product_count || 0}</span>
                      <span className="text-gray-500 text-sm ml-1">products</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        Active
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {store.last_sync_at ? new Date(store.last_sync_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/products?store=${store.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          View Products
                        </Link>
                        {/* Bulk push buttons for Gallery Store */}
                        {store.platform === 'gallery-store' && wooConnected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleBulkPush('woocommerce')
                            }}
                            disabled={bulkPushing !== null}
                            className="px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {bulkPushing === 'woocommerce' ? `Pushing ${bulkProgress.current}/${bulkProgress.total}...` : '→ WooCommerce'}
                          </button>
                        )}
                        {store.platform === 'gallery-store' && shopifyConnected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleBulkPush('shopify')
                            }}
                            disabled={bulkPushing !== null}
                            className="px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {bulkPushing === 'shopify' ? `Pushing ${bulkProgress.current}/${bulkProgress.total}...` : '→ Shopify'}
                          </button>
                        )}
                        <button
                          onClick={(e) => disconnectStore(e, store.id)}
                          className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          Disconnect
                        </button>
                      </div>
                      {/* Show bulk push result */}
                      {store.platform === 'gallery-store' && bulkResult && (
                        <div className={`mt-2 text-xs ${bulkResult.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                          {bulkResult.message}
                        </div>
                      )}
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