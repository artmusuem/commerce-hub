import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchWooCommerceProducts } from '../../lib/woocommerce'

interface WooProduct {
  id: number
  name: string
  slug: string
  description: string
  short_description: string
  price: string
  regular_price: string
  images: { src: string }[]
  categories: { name: string }[]
  status: string
}

export function WooCommerceConnect() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'connect' | 'preview' | 'importing' | 'done'>('connect')
  const [siteUrl, setSiteUrl] = useState('https://rapidwoo.developer2.us')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [products, setProducts] = useState<WooProduct[]>([])
  const [imported, setImported] = useState(0)

  async function testConnection() {
    setLoading(true)
    setError('')

    try {
      // Use proxy to avoid CORS
      const data = await fetchWooCommerceProducts({
        siteUrl,
        consumerKey,
        consumerSecret
      })
      
      setProducts(data as WooProduct[])
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  async function importProducts() {
    setStep('importing')
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Create store record first
      const storeName = new URL(siteUrl).hostname
      let storeId: string | null = null

      // Check if store already exists
      const { data: existingStore } = await supabase
        .from('stores')
        .select()
        .eq('user_id', user.id)
        .eq('platform', 'woocommerce')
        .eq('store_url', siteUrl)
        .single()

      if (existingStore) {
        storeId = existingStore.id
        // Update credentials if store exists
        await supabase
          .from('stores')
          .update({
            api_credentials: {
              consumer_key: consumerKey,
              consumer_secret: consumerSecret
            }
          })
          .eq('id', storeId)
      } else {
        const { data: storeRecord, error: storeError } = await supabase
          .from('stores')
          .insert({
            user_id: user.id,
            platform: 'woocommerce',
            shop_name: storeName,
            store_url: siteUrl,
            is_connected: true,
            api_credentials: {
              consumer_key: consumerKey,
              consumer_secret: consumerSecret
            }
          })
          .select()
          .single()

        if (storeError) {
          console.error('Store creation error:', storeError)
          // Continue without store link
        } else {
          storeId = storeRecord.id
        }
      }

      // Transform WooCommerce products to our format
      const transformedProducts = products
        .filter(p => p.name && p.status === 'publish')
        .map(p => {
          const base: Record<string, unknown> = {
            user_id: user.id,
            title: p.name,
            description: stripHtml(p.description || p.short_description || ''),
            price: parseFloat(p.price) || parseFloat(p.regular_price) || 0,
            category: p.categories?.[0]?.name || 'Uncategorized',
            image_url: p.images?.[0]?.src || null,
            status: 'active' as const,
          }
          // Only add store_id if we have one
          if (storeId) {
            base.store_id = storeId
          }
          return base
        })

      // Batch insert
      const { error: insertError } = await supabase
        .from('products')
        .insert(transformedProducts)

      if (insertError) {
        // If store_id column doesn't exist, retry without it
        if (insertError.message.includes('store_id')) {
          const productsWithoutStore = transformedProducts.map(p => {
            const { store_id: _store_id, ...rest } = p
            return rest
          })
          const { error: retryError } = await supabase
            .from('products')
            .insert(productsWithoutStore)
          
          if (retryError) throw retryError
        } else {
          throw insertError
        }
      }

      setImported(transformedProducts.length)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setStep('preview')
    }
  }

  function stripHtml(html: string): string {
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    return tmp.textContent || tmp.innerText || ''
  }

  if (step === 'done') {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">WooCommerce Connected!</h2>
        <p className="text-gray-600 mb-6">{imported} products imported from your store</p>
        <p className="text-sm text-gray-500 mb-6">
          API credentials saved. You can now push products to this store.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate('/products')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            View Products
          </button>
          <Link
            to="/stores"
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Back to Stores
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <Link to="/stores" className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-flex items-center gap-1">
        ← Back to Stores
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Connect WooCommerce</h1>
        <p className="text-gray-600">Import products from your WordPress store</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>
      )}

      {step === 'connect' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                WordPress Site URL
              </label>
              <input
                type="url"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://yourstore.com"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Your WordPress site root (not /shop)</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Consumer Key
              </label>
              <input
                type="text"
                value={consumerKey}
                onChange={(e) => setConsumerKey(e.target.value)}
                placeholder="ck_xxxxxxxxxxxxxxxx"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Consumer Secret
              </label>
              <input
                type="password"
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                placeholder="cs_xxxxxxxxxxxxxxxx"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
              />
            </div>

            <button
              onClick={testConnection}
              disabled={loading || !siteUrl || !consumerKey || !consumerSecret}
              className="w-full py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Connecting...' : 'Connect & Fetch Products'}
            </button>
          </div>

          {/* Instructions */}
          <div className="mt-6 pt-6 border-t">
            <h3 className="font-medium text-gray-900 mb-2">How to get API keys:</h3>
            <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
              <li>Go to WP Admin → WooCommerce → Settings → Advanced</li>
              <li>Click "REST API" tab → "Add key"</li>
              <li>Set Description: "Commerce Hub"</li>
              <li>Set Permissions: "Read/Write"</li>
              <li>Click "Generate API key"</li>
              <li>Copy Consumer Key and Secret here</li>
            </ol>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Found {products.length} Products
            </h2>
            <button
              onClick={importProducts}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Import All
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Image</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Price</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      {p.images?.[0]?.src ? (
                        <img src={p.images[0].src} alt="" className="w-10 h-10 rounded object-cover bg-gray-100" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400">📷</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900 max-w-xs truncate">
                      {p.name}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      ${p.price || p.regular_price || '0'}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        p.status === 'publish' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Importing products...</p>
        </div>
      )}
    </div>
  )
}
