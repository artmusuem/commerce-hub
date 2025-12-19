import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { initiateEtsyOAuth } from '../../lib/etsy'

interface Store {
  id: string
  platform: string
  shop_name: string | null
  shop_id: string | null
  is_active: boolean
  last_sync_at: string | null
}

export function StoresIndex() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    loadStores()
  }, [])

  async function loadStores() {
    const { data } = await supabase
      .from('stores')
      .select('*')
      .order('created_at', { ascending: false })
    setStores(data || [])
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

  async function disconnectStore(id: string) {
    if (!confirm('Disconnect this store?')) return
    await supabase.from('stores').delete().eq('id', id)
    setStores(stores.filter(s => s.id !== id))
  }

  const etsyConnected = stores.some(s => s.platform === 'etsy' && s.is_active)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Connected Stores</h1>
        <p className="text-gray-600">Manage your marketplace connections</p>
      </div>

      {/* Connect New Store */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Add Store Connection</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

          {/* Shopify - Coming Soon */}
          <div className="border rounded-lg p-4 opacity-50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold">S</div>
              <div>
                <p className="font-medium">Shopify</p>
                <p className="text-xs text-gray-500">E-commerce platform</p>
              </div>
            </div>
            <span className="text-sm text-gray-400">Coming Soon</span>
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
          <p className="text-gray-500">No stores connected yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Store</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Sync</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {stores.map(store => (
                <tr key={store.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded flex items-center justify-center text-white text-sm font-bold ${
                        store.platform === 'etsy' ? 'bg-orange-500' : 'bg-gray-500'
                      }`}>
                        {store.platform[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{store.shop_name || store.platform}</p>
                        <p className="text-xs text-gray-500 capitalize">{store.platform}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      store.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {store.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {store.last_sync_at ? new Date(store.last_sync_at).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => disconnectStore(store.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
