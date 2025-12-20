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
        setDebugInfo(debug.join('\n'))
        clearOAuthSession()
        return
      }

      // Validate state to prevent CSRF
      const savedState = sessionStorage.getItem('shopify_oauth_state')
      debug.push(`Saved state: ${savedState}`)
      
      if (!state || !validateOAuthState(state)) {
        setStatus('error')
        setMessage('Invalid authorization state. Please try connecting again.')
        setDebugInfo(debug.join('\n'))
        clearOAuthSession()
        return
      }

      if (!code || !shop) {
        setStatus('error')
        setMessage(`Missing authorization code or shop domain. Code: ${!!code}, Shop: ${shop}`)
        setDebugInfo(debug.join('\n'))
        clearOAuthSession()
        return
      }

      try {
        debug.push('Exchanging code for token...')
        setDebugInfo(debug.join('\n'))

        // Exchange code for access token via our API
        const tokenResponse = await fetch('/api/shopify/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, shop })
        })

        debug.push(`Token response status: ${tokenResponse.status}`)
        
        const tokenData = await tokenResponse.json()
        debug.push(`Token response: ${JSON.stringify(tokenData)}`)
        setDebugInfo(debug.join('\n'))

        if (!tokenResponse.ok || tokenData.error) {
          throw new Error(tokenData.error || tokenData.details || 'Failed to get access token')
        }

        const accessToken = tokenData.access_token

        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          throw new Error('Not authenticated')
        }

        debug.push(`User: ${user.id}`)
        debug.push('Saving store to database...')
        setDebugInfo(debug.join('\n'))

        // Check if store already exists
        const { data: existingStore } = await supabase
          .from('stores')
          .select('id')
          .eq('platform', 'shopify')
          .eq('store_url', shop)
          .eq('user_id', user.id)
          .single()

        if (existingStore) {
          // Update existing store
          const { error: updateError } = await supabase
            .from('stores')
            .update({
              api_credentials: { access_token: accessToken },
              name: shop.replace('.myshopify.com', '')
            })
            .eq('id', existingStore.id)

          if (updateError) {
            debug.push(`Update error: ${JSON.stringify(updateError)}`)
            throw updateError
          }
        } else {
          // Create new store
          const { error: insertError } = await supabase
            .from('stores')
            .insert({
              name: shop.replace('.myshopify.com', ''),
              platform: 'shopify',
              store_url: shop,
              api_credentials: { access_token: accessToken },
              user_id: user.id
            })

          if (insertError) {
            debug.push(`Insert error: ${JSON.stringify(insertError)}`)
            throw insertError
          }
        }

        clearOAuthSession()
        setStatus('success')
        setMessage('Shopify store connected successfully!')
        setDebugInfo(debug.join('\n'))
        
        // Redirect after short delay
        setTimeout(() => navigate('/stores'), 2000)

      } catch (err) {
        console.error('Shopify callback error:', err)
        debug.push(`Error: ${err instanceof Error ? err.message : String(err)}`)
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'Failed to connect Shopify store')
        setDebugInfo(debug.join('\n'))
        clearOAuthSession()
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center">
          {status === 'processing' && (
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          )}
          {status === 'success' && (
            <div className="text-green-600 text-5xl mb-4">✓</div>
          )}
          {status === 'error' && (
            <div className="text-red-600 text-5xl mb-4">✗</div>
          )}
          
          <h2 className={`text-xl font-semibold mb-2 ${
            status === 'error' ? 'text-red-600' : 
            status === 'success' ? 'text-green-600' : 
            'text-gray-800'
          }`}>
            {status === 'processing' ? 'Connecting to Shopify...' :
             status === 'success' ? 'Connected!' :
             'Connection Failed'}
          </h2>
          
          <p className="text-gray-600 mb-4">{message}</p>
          
          {debugInfo && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm text-gray-500">Debug Info</summary>
              <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-auto max-h-60">
                {debugInfo}
              </pre>
            </details>
          )}
          
          {status === 'error' && (
            <button
              onClick={() => navigate('/stores')}
              className="mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Back to Stores
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
