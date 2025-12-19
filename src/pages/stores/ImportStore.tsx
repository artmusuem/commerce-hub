import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const KNOWN_STORES = [
  {
    name: 'Gallery Store',
    url: 'https://ecommerce-react-beta-woad.vercel.app',
    repo: 'artmusuem/ecommerce-react',
    artists: [
      'winslow-homer',
      'mary-cassatt', 
      'thomas-cole',
      'frederic-remington',
      'georgia-okeeffe',
      'edward-hopper'
    ]
  }
]

interface Artwork {
  title: string
  artist: string
  image: string
  year_created?: string
  medium?: string
  description?: string
  smithsonian_id?: string
  accession_number?: string
}

export function ImportStore() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string[]>([])
  const [error, setError] = useState('')
  const [totalImported, setTotalImported] = useState(0)
  const [done, setDone] = useState(false)

  async function importStore(store: typeof KNOWN_STORES[0]) {
    setLoading(true)
    setStatus([])
    setError('')
    setTotalImported(0)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      let total = 0

      for (const artistId of store.artists) {
        setStatus(prev => [...prev, `Fetching ${artistId}...`])
        
        try {
          const response = await fetch(`${store.url}/data/${artistId}.json`)
          if (!response.ok) {
            setStatus(prev => [...prev, `⚠️ Skipped ${artistId} (not found)`])
            continue
          }

          const data = await response.json()
          const artworks: Artwork[] = data.artworks || []

          if (artworks.length === 0) {
            setStatus(prev => [...prev, `⚠️ ${artistId}: No artworks`])
            continue
          }

          // Transform to products
          const products = artworks
            .filter(art => art.title && art.image)
            .map(art => ({
              user_id: user.id,
              title: art.title,
              description: art.description || `A work by ${formatArtist(art.artist)}`,
              price: 45,
              artist: formatArtist(art.artist),
              category: 'Art Print',
              image_url: art.image,
              status: 'active' as const,
              smithsonian_id: art.smithsonian_id || art.accession_number || null,
            }))

          // Batch insert
          const { error: insertError } = await supabase
            .from('products')
            .insert(products)

          if (insertError) {
            setStatus(prev => [...prev, `❌ ${artistId}: ${insertError.message}`])
          } else {
            total += products.length
            setStatus(prev => [...prev, `✅ ${artistId}: ${products.length} products`])
          }
        } catch (err) {
          setStatus(prev => [...prev, `❌ ${artistId}: Failed to fetch`])
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

  function formatArtist(name: string): string {
    if (!name) return 'Unknown Artist'
    if (name.includes(', ')) {
      const [last, first] = name.split(', ')
      return `${first} ${last}`
    }
    return name
  }

  if (done) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Store Imported!</h2>
        <p className="text-gray-600 mb-6">{totalImported} products added to your database</p>
        <button
          onClick={() => navigate('/products')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          View Products
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import Store</h1>
        <p className="text-gray-600">Connect an existing store and import all products</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>
      )}

      {/* Available Stores */}
      <div className="space-y-4">
        {KNOWN_STORES.map(store => (
          <div key={store.url} className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{store.name}</h2>
                <a 
                  href={store.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  {store.url}
                </a>
                <p className="text-sm text-gray-500 mt-2">
                  {store.artists.length} artists • Smithsonian collection
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {store.artists.map(a => (
                    <span key={a} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                      {a.replace('-', ' ')}
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => importStore(store)}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {loading ? 'Importing...' : 'Import All'}
              </button>
            </div>

            {/* Progress */}
            {status.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto text-sm font-mono">
                  {status.map((s, i) => (
                    <div key={i} className="text-gray-700">{s}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Custom Store - Future */}
      <div className="mt-6 bg-gray-50 rounded-xl p-6 opacity-50">
        <h3 className="font-semibold text-gray-700">+ Connect Custom Store</h3>
        <p className="text-sm text-gray-500">Coming soon - connect any Gallery Store instance</p>
      </div>
    </div>
  )
}
