import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { transformToWooCommerce, transformToShopify } from '../../lib/transforms'
import { pushProductToWooCommerce } from '../../lib/woocommerce'

interface Store {
  id: string
  platform: string
  name: string
  store_url: string | null
  is_active: boolean
  last_sync_at: string | null
  product_count?: number
  api_credentials?: Record<string, unknown>
}

interface ProductCount {
  total: number
  active: number
  draft: number
}

const platformConfig: Record<string, { color: string; icon: string; name: string }> = {
  'gallery-store': { color: 'bg-blue-600', icon: '🎨', name: 'Gallery Store' },
  'shopify': { color: 'bg-green-600', icon: '🛍️', name: 'Shopify' },
  'woocommerce': { color: 'bg-purple-600', icon: '🛒', name: 'WooCommerce' },
  'etsy': { color: 'bg-orange-500', icon: '✋', name: 'Etsy' },
}

export function Dashboard() {
  const navigate = useNavigate()
  const [stores, setStores] = useState<Store[]>([])
  const [productCounts, setProductCounts] = useState<ProductCount>({ total: 0, active: 0, draft: 0 })
  const [loading, setLoading] = useState(true)
  
  // Bulk sync state
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 })
  const [syncResult, setSyncResult] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    // Load stores with product counts
    const { data: storesData } = await supabase
      .from('stores')
      .select('*')
      .order('created_at', { ascending: true })

    if (storesData) {
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
    }

    // Load total product counts
    const { data: products } = await supabase.from('products').select('status')
    if (products) {
      setProductCounts({
        total: products.length,
        active: products.filter(p => p.status === 'active').length,
        draft: products.filter(p => p.status === 'draft').length
      })
    }

    setLoading(false)
  }

  async function handlePushToStore(sourceStoreId: string, targetPlatform: 'shopify' | 'woocommerce') {
    const targetStore = stores.find(s => s.platform === targetPlatform)
    if (!targetStore) {
      setSyncResult({ message: `${targetPlatform} not connected`, type: 'error' })
      return
    }

    // Get target store credentials
    const { data: targetStoreData } = await supabase
      .from('stores')
      .select('*')
      .eq('id', targetStore.id)
      .single()

    if (!targetStoreData?.api_credentials) {
      setSyncResult({ message: 'API credentials not found', type: 'error' })
      return
    }

    // Get source products
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('store_id', sourceStoreId)

    if (!products || products.length === 0) {
      setSyncResult({ message: 'No products to push', type: 'error' })
      return
    }

    setSyncing(`${sourceStoreId}-${targetPlatform}`)
    setSyncProgress({ current: 0, total: products.length })
    setSyncResult(null)

    let success = 0
    let failed = 0

    for (let i = 0; i < products.length; i++) {
      const product = products[i]
      setSyncProgress({ current: i + 1, total: products.length })

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
            undefined
          )
          success++
        } else if (targetPlatform === 'shopify') {
          const credentials = targetStoreData.api_credentials as { access_token: string }
          const shopDomain = targetStoreData.store_url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || ''
          
          // Extract tags from product (array or generate from artist/category)
          let shopifyTags = ''
          if (product.tags && Array.isArray(product.tags)) {
            shopifyTags = product.tags.join(', ')
          } else if (product.artist || product.category) {
            const tagParts = []
            if (product.artist) tagParts.push(product.artist.toLowerCase().replace(/\s+/g, '-'))
            if (product.category) tagParts.push(product.category.toLowerCase())
            tagParts.push('art', 'print')
            shopifyTags = tagParts.join(', ')
          }
          
          const shopifyProduct = transformToShopify(product, targetStoreData.store_name || 'Commerce Hub', shopifyTags)
          
          // Check if product already exists on Shopify (via platform_ids)
          const existingShopifyId = product.platform_ids?.shopify
          const isUpdate = !!existingShopifyId
          
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

          if (!response.ok) throw new Error('Push failed')
          
          const result = await response.json()
          const productData = result.product
          
          // Save Shopify ID to platform_ids
          if (productData?.id && (!isUpdate || result.recreated)) {
            const newPlatformIds = { ...(product.platform_ids || {}), shopify: String(productData.id) }
            await supabase
              .from('products')
              .update({ platform_ids: newPlatformIds })
              .eq('id', product.id)
          }
          
          // Set taxonomy category via GraphQL API
          if (product.category && productData?.id) {
            try {
              await fetch('/api/shopify/taxonomy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  shop: shopDomain,
                  accessToken: credentials.access_token,
                  productId: productData.id,
                  categoryName: product.category
                })
              })
            } catch (err) {
              console.warn('Taxonomy failed for', product.title, err)
            }
          }
          
          // Ensure Smart Collection exists for product type
          if (product.category) {
            try {
              await fetch('/api/shopify/collection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  shop: shopDomain,
                  accessToken: credentials.access_token,
                  productType: product.category
                })
              })
            } catch (err) {
              console.warn('Collection failed for', product.title, err)
            }
          }
          
          success++
        }
      } catch (err) {
        console.error(`Failed: ${product.title}`, err)
        failed++
      }

      await new Promise(resolve => setTimeout(resolve, 200))
    }

    setSyncing(null)
    setSyncResult({
      message: `✓ ${success} pushed${failed > 0 ? `, ${failed} failed` : ''}`,
      type: failed === 0 ? 'success' : 'error'
    })
    
    // Update last_sync_at
    await supabase
      .from('stores')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', sourceStoreId)
    
    loadData()
  }

  // Sync taxonomy for all Shopify products
  async function syncShopifyTaxonomy() {
    const shopifyStore = stores.find(s => s.platform === 'shopify')
    if (!shopifyStore) {
      setSyncResult({ message: 'Shopify not connected', type: 'error' })
      return
    }

    // Get Shopify store credentials
    const { data: storeData } = await supabase
      .from('stores')
      .select('*')
      .eq('id', shopifyStore.id)
      .single()

    if (!storeData?.api_credentials) {
      setSyncResult({ message: 'Shopify credentials not found', type: 'error' })
      return
    }

    const credentials = storeData.api_credentials as { access_token: string }
    const shopDomain = storeData.store_url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || ''

    // Get all products with Shopify IDs
    const { data: products } = await supabase
      .from('products')
      .select('id, title, category, platform_ids')
      .not('platform_ids->shopify', 'is', null)

    if (!products || products.length === 0) {
      setSyncResult({ message: 'No Shopify products to sync', type: 'error' })
      return
    }

    setSyncing('taxonomy')
    setSyncProgress({ current: 0, total: products.length })
    setSyncResult(null)

    let success = 0
    let failed = 0

    for (let i = 0; i < products.length; i++) {
      const product = products[i]
      const shopifyId = product.platform_ids?.shopify
      
      setSyncProgress({ current: i + 1, total: products.length })

      if (!shopifyId || !product.category) {
        failed++
        continue
      }

      try {
        // Set taxonomy
        const taxonomyResponse = await fetch('/api/shopify/taxonomy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop: shopDomain,
            accessToken: credentials.access_token,
            productId: shopifyId,
            categoryName: product.category
          })
        })

        if (taxonomyResponse.ok) {
          success++
        } else {
          console.warn('Taxonomy failed for', product.title)
          failed++
        }

        // Ensure collection exists
        await fetch('/api/shopify/collection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop: shopDomain,
            accessToken: credentials.access_token,
            productType: product.category
          })
        })
      } catch (err) {
        console.error('Sync failed for', product.title, err)
        failed++
      }

      await new Promise(resolve => setTimeout(resolve, 100))
    }

    setSyncing(null)
    setSyncResult({
      message: `Taxonomy synced: ${success} updated${failed > 0 ? `, ${failed} failed` : ''}`,
      type: failed === 0 ? 'success' : 'error'
    })
  }

  const shopifyConnected = stores.some(s => s.platform === 'shopify')
  const wooConnected = stores.some(s => s.platform === 'woocommerce')

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Commerce Hub</h1>
        <p className="text-gray-600">Manage products across all your stores</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-3xl font-bold text-gray-900">{loading ? '...' : productCounts.total}</p>
          <p className="text-sm text-gray-500">Total Products</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-3xl font-bold text-green-600">{loading ? '...' : productCounts.active}</p>
          <p className="text-sm text-gray-500">Active</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-3xl font-bold text-yellow-600">{loading ? '...' : productCounts.draft}</p>
          <p className="text-sm text-gray-500">Draft</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <p className="text-3xl font-bold text-blue-600">{loading ? '...' : stores.length}</p>
          <p className="text-sm text-gray-500">Stores Connected</p>
        </div>
      </div>

      {/* Connected Stores */}
      <div className="bg-white rounded-lg shadow-sm mb-6">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Connected Stores</h2>
            <p className="text-sm text-gray-500">Import, push, and sync products</p>
          </div>
          <Link
            to="/stores"
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Manage Connections →
          </Link>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : stores.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 mb-4">No stores connected yet</p>
            <Link
              to="/stores"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Connect Your First Store
            </Link>
          </div>
        ) : (
          <div className="divide-y">
            {stores.map(store => {
              const config = platformConfig[store.platform] || { color: 'bg-gray-500', icon: '📦', name: store.platform }
              const isSyncing = syncing?.startsWith(store.id)
              
              return (
                <div key={store.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    {/* Store Info */}
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 ${config.color} rounded-lg flex items-center justify-center text-white text-lg`}>
                        {config.icon}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{store.name || config.name}</p>
                        <p className="text-sm text-gray-500">
                          {store.product_count} products
                          {store.last_sync_at && (
                            <span className="ml-2">• Last sync: {new Date(store.last_sync_at).toLocaleDateString()}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {/* View Products */}
                      <button
                        onClick={() => navigate(`/products?store=${store.id}`)}
                        className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
                      >
                        View
                      </button>

                      {/* Import Button */}
                      {store.platform === 'gallery-store' && (
                        <Link
                          to="/stores/import"
                          className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded"
                        >
                          Import
                        </Link>
                      )}
                      {store.platform === 'shopify' && (
                        <Link
                          to="/stores/shopify/import"
                          className="px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded"
                        >
                          ← Pull
                        </Link>
                      )}
                      {store.platform === 'shopify' && (
                        <button
                          onClick={syncShopifyTaxonomy}
                          disabled={syncing !== null}
                          className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                        >
                          {syncing === 'taxonomy' 
                            ? `${syncProgress.current}/${syncProgress.total}` 
                            : '⚡ Fix Categories'}
                        </button>
                      )}
                      {store.platform === 'woocommerce' && (
                        <Link
                          to="/stores/woocommerce"
                          className="px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded"
                        >
                          ← Pull
                        </Link>
                      )}

                      {/* Push Buttons (for source stores like Gallery Store) */}
                      {store.platform === 'gallery-store' && shopifyConnected && (
                        <button
                          onClick={() => handlePushToStore(store.id, 'shopify')}
                          disabled={isSyncing}
                          className="px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                        >
                          {syncing === `${store.id}-shopify` 
                            ? `${syncProgress.current}/${syncProgress.total}` 
                            : '→ Shopify'}
                        </button>
                      )}
                      {store.platform === 'gallery-store' && wooConnected && (
                        <button
                          onClick={() => handlePushToStore(store.id, 'woocommerce')}
                          disabled={isSyncing}
                          className="px-3 py-1.5 text-sm text-purple-600 hover:bg-purple-50 rounded disabled:opacity-50"
                        >
                          {syncing === `${store.id}-woocommerce` 
                            ? `${syncProgress.current}/${syncProgress.total}` 
                            : '→ WooCommerce'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sync Result */}
                  {syncResult && syncing === null && (
                    <div className={`mt-2 text-sm ${syncResult.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                      {syncResult.message}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow-sm p-5">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/products/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            + Add Product
          </Link>
          <Link
            to="/products"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
          >
            View All Products
          </Link>
          <Link
            to="/stores"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
          >
            Manage Stores
          </Link>
        </div>
      </div>
    </div>
  )
}
