import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getShopifyAuthUrl } from '../../lib/shopify'

export default function ShopifyConnect() {
  const [shopDomain, setShopDomain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  const handleConnect = () => {
    if (!shopDomain.trim()) {
      setError('Please enter your Shopify store domain')
      return
    }

    // Validate domain format
    let domain = shopDomain.trim().toLowerCase()
    
    // Add .myshopify.com if not present
    if (!domain.includes('.myshopify.com') && !domain.includes('.')) {
      domain = `${domain}.myshopify.com`
    }

    setConnecting(true)
    setError(null)

    try {
      const authUrl = getShopifyAuthUrl(domain)
      window.location.href = authUrl
    } catch (err) {
      setError('Failed to generate authorization URL')
      setConnecting(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link to="/stores" className="text-blue-600 hover:underline mb-4 inline-block">
        ← Back to Stores
      </Link>

      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.34 3.27c-.12-.05-.24-.05-.36 0-.12.05-.22.14-.28.26l-1.16 2.52-2.78.4c-.13.02-.24.08-.33.18-.08.1-.13.22-.13.35 0 .13.05.25.14.35l2.01 1.96-.47 2.76c-.02.13 0 .26.07.37.07.11.18.2.3.24.12.04.25.04.37 0l2.49-1.31 2.49 1.31c.12.04.25.04.37 0 .12-.04.23-.13.3-.24.07-.11.09-.24.07-.37l-.47-2.76 2.01-1.96c.09-.1.14-.22.14-.35 0-.13-.05-.25-.13-.35-.09-.1-.2-.16-.33-.18l-2.78-.4-1.16-2.52c-.06-.12-.16-.21-.28-.26z"/>
              <path d="M19.5 12c0 4.14-3.36 7.5-7.5 7.5S4.5 16.14 4.5 12 7.86 4.5 12 4.5c.83 0 1.63.13 2.38.38"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Connect Shopify Store</h1>
            <p className="text-gray-500">Import products from your Shopify store</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Shopify Store Domain
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shopDomain}
                onChange={(e) => setShopDomain(e.target.value)}
                placeholder="your-store or your-store.myshopify.com"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enter your store name (e.g., "my-store") or full domain (e.g., "my-store.myshopify.com")
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {connecting ? 'Connecting...' : 'Connect to Shopify'}
          </button>

          <div className="bg-gray-50 rounded-lg p-4 mt-6">
            <h3 className="font-medium text-gray-900 mb-2">What happens next?</h3>
            <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
              <li>You'll be redirected to Shopify to authorize Commerce Hub</li>
              <li>Grant permission to read and write products</li>
              <li>You'll be redirected back here with your store connected</li>
              <li>Import products from Shopify into Commerce Hub</li>
            </ol>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <h3 className="font-medium text-blue-900 mb-1">Using a Development Store?</h3>
            <p className="text-sm text-blue-700">
              Dev stores work the same way. Just enter your dev store domain 
              (e.g., "dev-store-123.myshopify.com")
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}