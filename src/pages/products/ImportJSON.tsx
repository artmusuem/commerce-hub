import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface SmithsonianArtwork {
  title: string
  artist: string
  image: string
  year_created?: string
  medium?: string
  description?: string
  object_type?: string
  smithsonian_id?: string
  accession_number?: string
  museum?: string
}

interface ImportFile {
  collection_info?: {
    source: string
    artist: string
  }
  artworks: SmithsonianArtwork[]
}

export function ImportJSON() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<SmithsonianArtwork[]>([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [imported, setImported] = useState(0)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    setError('')
    setPreview([])

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json: ImportFile = JSON.parse(event.target?.result as string)
        if (!json.artworks || !Array.isArray(json.artworks)) {
          setError('Invalid JSON format. Expected { artworks: [...] }')
          return
        }
        setPreview(json.artworks)
      } catch {
        setError('Failed to parse JSON file')
      }
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (preview.length === 0) return

    setLoading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Transform to Supabase format
      const products = preview
        .filter(art => art.title && art.image)
        .map(art => ({
          user_id: user.id,
          title: art.title,
          description: art.description || `A work by ${art.artist}`,
          price: 45, // Default base price
          artist: formatArtistName(art.artist),
          category: art.object_type || 'Art Print',
          image_url: art.image,
          status: 'draft' as const,
          smithsonian_id: art.smithsonian_id || art.accession_number || null,
        }))

      // Batch insert
      const { error: insertError, data } = await supabase
        .from('products')
        .insert(products)
        .select()

      if (insertError) throw insertError

      setImported(data?.length || 0)
      setTimeout(() => navigate('/products'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  function formatArtistName(name: string): string {
    if (!name) return 'Unknown Artist'
    if (name.includes(', ')) {
      const [last, first] = name.split(', ')
      return `${first} ${last}`
    }
    return name
  }

  if (imported > 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Complete!</h2>
        <p className="text-gray-600">{imported} products imported successfully</p>
        <p className="text-sm text-gray-400 mt-2">Redirecting to products...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import Products</h1>
        <p className="text-gray-600">Bulk import from Smithsonian JSON files</p>
      </div>

      {/* Upload Area */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <label className="block">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 cursor-pointer transition-colors">
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="text-4xl mb-2">📁</div>
            <p className="font-medium text-gray-700">
              {fileName || 'Click to select JSON file'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Supports Gallery Store artist JSON format
            </p>
          </div>
        </label>

        {error && (
          <div className="mt-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Preview ({preview.length} items)
            </h2>
            <button
              onClick={handleImport}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Importing...' : `Import ${preview.length} Products`}
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Image</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Title</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Artist</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Year</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {preview.slice(0, 50).map((art, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <img
                        src={art.image + '?max=60'}
                        alt=""
                        className="w-10 h-10 rounded object-cover bg-gray-100"
                      />
                    </td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900 max-w-xs truncate">
                      {art.title}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {formatArtistName(art.artist)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {art.year_created || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 50 && (
              <p className="text-center text-sm text-gray-500 py-2">
                ...and {preview.length - 50} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-6 bg-gray-50 rounded-xl p-6">
        <h3 className="font-semibold text-gray-900 mb-2">JSON Format</h3>
        <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto">
{`{
  "artworks": [
    {
      "title": "Artwork Title",
      "artist": "Last, First",
      "image": "https://ids.si.edu/...",
      "year_created": "1890",
      "medium": "Oil on canvas"
    }
  ]
}`}
        </pre>
      </div>
    </div>
  )
}
