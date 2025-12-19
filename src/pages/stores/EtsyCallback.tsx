import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { exchangeCodeForToken, getEtsyShop } from '../../lib/etsy'

export function EtsyCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    handleCallback()
  }, [])

  async function handleCallback() {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const errorParam = searchParams.get('error')

    if (errorParam) {
      setStatus('error')
      setError(searchParams.get('error_description') || 'Authorization denied')
      return
    }

    if (!code) {
      setStatus('error')
      setError('No authorization code received')
      return
    }

    // Verify state
    const savedState = sessionStorage.getItem('etsy_oauth_state')
    if (state !== savedState) {
      setStatus('error')
      setError('Invalid state parameter')
      return
    }

    try {
      // Exchange code for token
      const tokens = await exchangeCodeForToken(code)

      // Get shop info
      const shop = await getEtsyShop(tokens.access_token)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Save store connection to Supabase
      const { error: dbError } = await supabase.from('stores').upsert({
        user_id: user.id,
        platform: 'etsy',
        shop_id: shop.shop_id.toString(),
        shop_name: shop.shop_name,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        is_active: true,
        external_user_id: shop.user_id.toString()
      }, {
        onConflict: 'user_id,platform'
      })

      if (dbError) throw dbError

      setStatus('success')
      setTimeout(() => navigate('/stores'), 2000)
    } catch (err) {
      console.error('OAuth callback error:', err)
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to connect Etsy')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm text-center">
        {status === 'loading' && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Connecting to Etsy</h2>
            <p className="text-gray-600">Please wait...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Etsy Connected!</h2>
            <p className="text-gray-600">Redirecting to stores...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="text-5xl mb-4">❌</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Connection Failed</h2>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => navigate('/stores')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Back to Stores
            </button>
          </>
        )}
      </div>
    </div>
  )
}
