import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { validateOAuthState, getSavedShopDomain, clearOAuthSession } from '../../lib/shopify'

export default function ShopifyCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [message, setMessage] = useState('Processing Shopify authorization...')

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const shop = searchParams.get('shop') || getSavedShopDomain()

      // Validate state to prevent CSRF
      if (!state || !validateOAuthState(state)) {
        setStatus('error')
        setMessage('Invalid authorization state. Please try connecting again.')
        clearOAuthSession()
        return
      }

      if (!code || !shop) {
        setStatus('error')
        setMessage('Missing authorization code or shop domain.')
        clearOAuthSession()
        return
      }

      try {
        setMessage('Exchanging authorization code...')

        // For development: Store the code directly and handle token exchange server-side
        // In production, you'd call a backend endpoint to exchange the code
        
        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          throw new Error('Not authenticated')
        }

        // Clean shop domain
        const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '')

        setMessage('Saving store connection...')

        // Check if store already exists
        const { data: existingStore } = await supabase
          .from('stores')
          .select('id')
          .eq('platform', 'shopify')
          .eq('url', cleanShop)
          .eq('user_id', user.id)
          .single()

        if (existingStore) {
          // Update existing store with new auth code
          await supabase
            .from('stores')
            .update({
              api_credentials: { 
                auth_code: code,
                connected_at: new Date().toISOString(),
                status: 'pending_token_exchange'
              }
            })
            .eq('id', existingStore.id)
        } else {
          // Create new store
          const { error: insertError } = await supabase
            .from('stores')
            .insert({
              name: cleanShop.split('.')[0].replace(/-/g, ' ').replace(/\w/g, c => c.toUpperCase()),
              platform: 'shopify',
              url: cleanShop,
              user_id: user.id,
              api_credentials: {
                auth_code: code,
                connected_at: new Date().toISOString(),
                status: 'pending_token_exchange'
              }
            })

          if (insertError) throw insertError
        }

        clearOAuthSession()
        setStatus('success')
        setMessage('Shopify store connected successfully!')

        // Redirect to stores page after brief delay
        setTimeout(() => {
          navigate('/stores')
        }, 2000)

      } catch (error) {
        console.error('Shopify callback error:', error)
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'Failed to connect Shopify store')
        clearOAuthSession()
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
        {status === 'processing' && (
          <>
            <div className="w-16 h-16 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Connecting Shopify</h2>
            <p className="text-gray-600">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Connected!</h2>
            <p className="text-gray-600">{message}</p>
            <p className="text-sm text-gray-500 mt-2">Redirecting to stores...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Connection Failed</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <button
              onClick={() => navigate('/stores/shopify')}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  )
}