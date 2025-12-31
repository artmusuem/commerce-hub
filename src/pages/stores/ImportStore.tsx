import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { 
  transformFromGalleryStore, 
  validateGalleryStoreData,
  type GalleryStoreArtwork 
} from '../../lib/transforms'

const GALLERY_STORE_URL = 'https://ecommerce-react-beta-woad.vercel.app'

const KNOWN_STORES = [
  {
    name: 'Gallery Store (Full)',
    description: '~110 artworks from 6 Smithsonian artists',
    url: GALLERY_STORE_URL,
    artists: [
      'winslow-homer',
      'mary-cassatt', 
      'thomas-cole',
      'frederic-remington',
      'georgia-okeeffe',
      'edward-hopper'
    ]
  },
  {
    name: 'Test Products',
    description: '10 curated artworks for sync testing',
    url: GALLERY_STORE_URL,
    dataFile: 'test-products'
  }
]

export function ImportStore() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string[]>([])
  const [error, setError] = useState('')
  const [totalImported, setTotalImported] = useState(0)
  const [done, setDone] = useState(false)

  // Get or create Gallery Store record
  async function getOrCreateStore(userId: string): Promise<string | null> {
    const { data: existingStore } = await supabase
      .from('stores')
      .select()
      .eq('user_id', userId)
      .eq('platform', 'gallery-store')
      .single()

    if (existingStore) {
      setStatus(prev => [...prev, '✅ Using existing Gallery Store'])
      return existingStore.id
    }

    const { data: storeRecord, error: storeError } = await supabase
      .from('stores')
      .insert({
        user_id: userId,
        platform: 'gallery-store',
        store_name: 'Gallery Store',
        store_url: GALLERY_STORE_URL,
        is_connected: true
      })
      .select()
      .single()

    if (storeError) {
      setStatus(prev => [...prev, '⚠️ Could not create store record'])
      return null
    }

    setStatus(prev => [...prev, '✅ Created Gallery Store record'])
    return storeRecord.id
  }

  // Import test products (10 items)
  async function importTestProducts() {
    setLoading(true)
    setStatus([])
    setError('')
    setTotalImported(0)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      setStatus(prev => [...prev, 'Fetching test products...'])

      const response = await fetch(GALLERY_STORE_URL + '/data/test-products.json')
      if (!response.ok) throw new Error('Could not fetch test products')

      const data = await response.json()
      
      if (!validateGalleryStoreData(data)) {
        throw new Error('Invalid data format')
      }

      setStatus(prev => [...prev, '✅ Found ' + data.artworks.length + ' test products'])

      const storeId = await getOrCreateStore(user.id)

      // Clear existing Gallery Store products for clean test
      setStatus(prev => [...prev, 'Clearing existing Gallery Store products...'])
      
      if (storeId) {
        await supabase
          .from('products')
          .delete()
          .eq('store_id', storeId)
      }

      setStatus(prev => [...prev, '✅ Cleared existing products'])

      // Transform using new function
      setStatus(prev => [...prev, 'Transforming artworks...'])
      
      const products = data.artworks.map((artwork: GalleryStoreArtwork, index: number) => {
        const transformed = transformFromGalleryStore(artwork, storeId || '')
        return {
          ...transformed,
          user_id: user.id,
          external_id: artwork.smithsonian_id || 'test-' + index,
        }
      })

      // Insert products
      setStatus(prev => [...prev, 'Inserting ' + products.length + ' products...'])

      const { error: insertError } = await supabase
        .from('products')
        .insert(products)

      if (insertError) {
        // Retry without store_id if column doesn't exist
        if (insertError.message.includes('store_id')) {
          const productsWithoutStore = products.map((p: Record<string, unknown>) => {
            const { store_id, ...rest } = p
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

      setStatus(prev => [...prev, '✅ Imported ' + products.length + ' products'])
      setTotalImported(products.length)
      setDone(true)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  // Import full store (all artists)
  async function importFullStore() {
    setLoading(true)
    setStatus([])
    setError('')
    setTotalImported(0)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const storeId = await getOrCreateStore(user.id)

      // Clear existing Gallery Store products
      setStatus(prev => [...prev, 'Clearing existing Gallery Store products...'])
      
      if (storeId) {
        await supabase
          .from('products')
          .delete()
          .eq('store_id', storeId)
      }

      let total = 0
      const artists = KNOWN_STORES[0].artists!

      for (const artistId of artists) {
        setStatus(prev => [...prev, 'Fetching ' + artistId + '...'])
        
        try {
          const response = await fetch(GALLERY_STORE_URL + '/data/' + artistId + '.json')
          if (!response.ok) {
            setStatus(prev => [...prev, '⚠️ Skipped ' + artistId + ' (not found)'])
            continue
          }

          const data = await response.json()
          const artworks: GalleryStoreArtwork[] = data.artworks || []
          
          if (artworks.length === 0) {
            setStatus(prev => [...prev, '⚠️ ' + artistId + ': No artworks found'])
            continue
          }

          // Transform and insert
          const products = artworks.map((artwork, index) => {
            const transformed = transformFromGalleryStore(artwork, storeId || '')
            return {
              ...transformed,
              user_id: user.id,
              external_id: artwork.smithsonian_id || artistId + '-' + index,
            }
          })

          const { error: insertError } = await supabase
            .from('products')
            .insert(products)

          if (insertError) {
            if (insertError.message.includes('store_id')) {
              const productsWithoutStore = products.map((p: Record<string, unknown>) => {
                const { store_id, ...rest } = p
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

          total += products.length
          setStatus(prev => [...prev, '✅ ' + artistId + ': ' + products.length + ' products'])
        } catch (err) {
          setStatus(prev => [...prev, '❌ ' + artistId + ': ' + (err instanceof Error ? err.message : 'Failed')])
        }
      }

      setTotalImported(total)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Complete!</h2>
        <p className="text-gray-600 mb-6">{totalImported} products added to your database</p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => navigate('/products')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            View Products
          </button>
          <button
            onClick={() => { setDone(false); setStatus([]) }}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Import More
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import Store</h1>
        <p className="text-gray-600">Import products from Gallery Store into Commerce Hub</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>
      )}

      <div className="space-y-4">
        {/* Test Products - Recommended for sync testing */}
        <div className="bg-white rounded-xl shadow-sm p-6 border-2 border-blue-200">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-900">Test Products</h2>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                  Recommended
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                10 curated artworks for sync testing
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                  6 Winslow Homer
                </span>
                <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                  4 Thomas Cole
                </span>
              </div>
            </div>
            <button
              onClick={importTestProducts}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? 'Importing...' : 'Import 10'}
            </button>
          </div>
        </div>

        {/* Full Store */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Full Collection</h2>
              <p className="text-sm text-gray-600 mt-1">
                ~110 artworks from all 6 Smithsonian artists
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                {KNOWN_STORES[0].artists!.map(a => (
                  <span key={a} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                    {a.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={importFullStore}
              disabled={loading}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? 'Importing...' : 'Import All'}
            </button>
          </div>
        </div>
      </div>

      {/* Progress */}
      {status.length > 0 && (
        <div className="mt-6 bg-gray-50 rounded-xl p-4">
          <h3 className="font-medium text-gray-700 mb-2">Progress</h3>
          <div className="bg-white rounded-lg p-3 max-h-48 overflow-y-auto text-sm font-mono border">
            {status.map((s, i) => (
              <div key={i} className="text-gray-700">{s}</div>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="mt-6 bg-blue-50 rounded-xl p-4">
        <h3 className="font-medium text-blue-900 mb-1">💡 Sync Testing</h3>
        <p className="text-sm text-blue-800">
          Use "Test Products" for quick sync validation. After import, go to Products → 
          select a product → Push to WooCommerce or Shopify to test the full sync flow.
        </p>
      </div>
    </div>
  )
}
