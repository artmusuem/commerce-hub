import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { validateOAuthState, getSavedShopDomain, clearOAuthSession } from '../../lib/shopify'

export default function ShopifyCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [message, setMessage] = useState('Processing Shopify authorization...')
  const [debugInfo, setDebugInfo] = useState<string>('')

  useEffect(() => {
    async function handleCallback() {
      const code = searchParams.get('code')
      const state = searchParams.get('state')
      const shopParam = searchParams.get('shop')
      const savedShop = getSavedShopDomain()
      const shop = shopParam || savedShop
      const errorParam = searchParams.get('error')
      const errorDesc = searchParams.get('error_description')

      const debug: string[] = []
      debug.push(`Code present: ${!!code}`)
      debug.push(`State: ${state}`)
      debug.push(`Shop from URL: ${shopParam}`)
      debug.push(`Shop from session: ${savedShop}`)
      debug.push(`Final shop: ${shop}`)
      debug.push(`Error param: ${errorParam}`)
      debug.push(`Error desc: ${errorDesc}`)

      // Check for OAuth error from Shopify
      if (errorParam) {
        setStatus('error')
        setMessage(`Shopify error: ${errorDesc || errorParam}`)
        setDebugInfo(debug.join('
'))
        clearOAuthSession()
        return
      }

      // Validate state to prevent CSRF
      const savedState = sessionStorage.getItem('shopify_oauth_state')
      debug.push(`Saved state: ${savedState}`)
      
      if (!state || !validateOAuthState(state)) {
        setStatus('error')
        setMessage('Invalid authorization state. Please try connecting again.')
        setDebugInfo(debug.join('
'))
        clearOAuthSession()
        return
      }

      if (!code || !shop) {
        setStatus('error')
        setMessage(`Missing authorization code or shop domain. Code: ${!!code}, Shop: ${shop}`)
        setDebugInfo(debug.join('
'))
        clearOAuthSession()
        return
      }

      try {
        setMessage('Exchanging authorization code for access token...')

        // Exchange code for access token via our API
        debug.push(`Calling /api/shopify/token with shop: ${shop}`)
        const tokenResponse = await fetch('/api/shopify/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop, code })
        })

        debug.push(`Token response status: ${tokenResponse.status}`)
        const responseText = await tokenResponse.text()
        debug.push(`Token response body: ${responseText}`)

        if (!tokenResponse.ok) {
          let errorMsg = 'Failed to exchange code for token'
          try {
            const errorData = JSON.parse(responseText)
            errorMsg = errorData.error || errorData.details || errorMsg
          } catch (e) {
            errorMsg = responseText || errorMsg
          }
          throw new Error(errorMsg)
        }

        const { access_token, scope } = JSON.parse(responseText)
        debug.push(`Got access token: ${access_token ? 'yes' : 'no'}`)
        debug.push(`Scope: ${scope}`)

        setMessage('Saving store connection...')

        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          throw new Error('Not authenticated')
        }
        debug.push(`User: ${user.id}`)

        // Clean shop domain
        const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
        const storeName = cleanShop.split('.')[0].replace(/-/g, ' ').replace(/\w/g, (c: string) => c.toUpperCase())

        // Check if store already exists
        const { data: existingStore } = await supabase
          .from('stores')
          .select('id')
          .eq('platform', 'shopify')
          .eq('url', cleanShop)
          .eq('user_id', user.id)
          .single()

        if (existingStore) {
          debug.push(`Updating existing store: ${existingStore.id}`)
          await supabase
            .from('stores')
            .update({
              name: storeName,
              api_credentials: { 
                access_token,
                scope,
                connected_at: new Date().toISOString()
              }
            })
            .eq('id', existingStore.id)
        } else {
          debug.push('Creating new store')
          const { error: insertError } = await supabase
            .from('stores')
            .insert({
              name: storeName,
              platform: 'shopify',
              url: cleanShop,
              user_id: user.id,
              api_credentials: {
                access_token,
                scope,
                connected_at: new Date().toISOString()
              }
            })

          if (insertError) {
            debug.push(`Insert error: ${JSON.stringify(insertError)}`)
            throw insertError
          }
        }

        clearOAuthSession()
        setStatus('success')
        setMessage('Shopify store connected successfully!')
        setDebugInfo(debug.join('
'))

        setTimeout(() => {
          navigate('/stores')
        }, 2000)

      } catch (error) {
        console.error('Shopify callback error:', error)
        debug.push(`Error: ${error instanceof Error ? error.message : String(error)}`)
        setStatus('error')
        setMessage(error instanceof Error ? error.message : 'Failed to connect Shopify store')
        setDebugInfo(debug.join('
'))
        clearOAuthSession()
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow-md p-8 max-w-2xl w-full text-center">
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

        {/* Debug Info */}
        {debugInfo && (
          <div className="mt-6 text-left">
            <details className="bg-gray-100 rounded-lg p-4">
              <summary className="cursor-pointer text-sm font-medium text-gray-700">Debug Info</summary>
              <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap overflow-auto max-h-64">{debugInfo}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}