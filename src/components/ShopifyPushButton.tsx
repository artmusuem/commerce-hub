/**
 * ShopifyPushButton - A-Grade 7-Step Sync Component
 *
 * Shows step-by-step progress when pushing products to Shopify
 * Uses the GraphQL-based sync process from shopify-push.ts
 */

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { pushProductToShopify, buildSupabaseUpdate } from '../lib/shopify-push'
import type { SupabaseProduct, PushResult } from '../lib/shopify-push'

interface ShopifyStore {
  id: string
  store_url: string
  store_name: string | null
  api_credentials: {
    access_token: string
  } | null
}

interface ShopifyPushButtonProps {
  product: SupabaseProduct
  store: ShopifyStore
  onSuccess?: (result: PushResult) => void
  onError?: (error: string) => void
}

interface StepStatus {
  step: number
  name: string
  status: 'pending' | 'running' | 'success' | 'error'
  message?: string
}

const STEP_NAMES = [
  'Creating product with options',
  'Uploading images',
  'Creating variants',
  'Updating prices & images',
  'Setting inventory',
  'Updating SEO',
  'Activating product'
]

export function ShopifyPushButton({ product, store, onSuccess, onError }: ShopifyPushButtonProps) {
  const [isPushing, setIsPushing] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [steps, setSteps] = useState<StepStatus[]>([])
  const [result, setResult] = useState<PushResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Initialize step statuses
  const initializeSteps = () => {
    return STEP_NAMES.map((name, i) => ({
      step: i + 1,
      name,
      status: 'pending' as const
    }))
  }

  // Handle progress updates from the orchestrator
  const handleProgress = (step: number, message: string, detail?: string) => {
    setSteps(prev => prev.map(s => {
      if (s.step === step) {
        return { ...s, status: 'running', message: detail || message }
      }
      if (s.step < step) {
        return { ...s, status: 'success' }
      }
      return s
    }))
  }

  const handlePush = async () => {
    if (!store.api_credentials?.access_token) {
      setError('Shopify access token not found')
      onError?.('Shopify access token not found')
      return
    }

    setIsPushing(true)
    setShowProgress(true)
    setError(null)
    setResult(null)
    setSteps(initializeSteps())

    try {
      const pushResult = await pushProductToShopify(
        product,
        {
          id: store.id,
          store_url: store.store_url,
          api_credentials: store.api_credentials
        },
        {
          onProgress: handleProgress,
          defaultInventory: 10,
          activateOnComplete: true
        }
      )

      // Update step statuses based on result
      setSteps(prev => prev.map(s => {
        const stepResult = pushResult.steps.find(r => r.step === s.step)
        if (stepResult) {
          return {
            ...s,
            status: stepResult.success ? 'success' : 'error',
            message: stepResult.error || s.message
          }
        }
        return s
      }))

      setResult(pushResult)

      if (pushResult.success) {
        // Update Supabase with Shopify IDs
        const update = buildSupabaseUpdate(pushResult)
        if (update) {
          await supabase
            .from('products')
            .update({
              platform_ids: {
                ...(product as { platform_ids?: Record<string, string> }).platform_ids,
                shopify: pushResult.shopifyProductId
              },
              sync_status: update.sync_status,
              last_synced_at: update.last_synced_at
            })
            .eq('id', product.id)
        }
        onSuccess?.(pushResult)
      } else {
        const errorMsg = pushResult.errors?.join(', ') || 'Push failed'
        setError(errorMsg)
        onError?.(errorMsg)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setIsPushing(false)
    }
  }

  const handleClose = () => {
    setShowProgress(false)
    setSteps([])
    setResult(null)
    setError(null)
  }

  const getStepIcon = (status: StepStatus['status']) => {
    switch (status) {
      case 'pending':
        return <span className="text-gray-300">○</span>
      case 'running':
        return (
          <svg className="animate-spin h-4 w-4 text-blue-500" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        )
      case 'success':
        return <span className="text-green-500">✓</span>
      case 'error':
        return <span className="text-red-500">✗</span>
    }
  }

  return (
    <>
      {/* Push Button */}
      <button
        type="button"
        onClick={handlePush}
        disabled={isPushing || !store.api_credentials?.access_token}
        className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm flex items-center gap-2"
      >
        {isPushing ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Syncing...
          </>
        ) : (
          <>
            <span>🛍️</span>
            Push to Shopify (A-Grade)
          </>
        )}
      </button>

      {/* Progress Modal */}
      {showProgress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <span>🛍️</span>
                Shopify Sync
              </h3>
              <p className="text-green-100 text-sm">
                {result?.success
                  ? 'Product synced successfully!'
                  : error
                    ? 'Sync encountered an error'
                    : 'Syncing product to Shopify...'}
              </p>
            </div>

            {/* Steps */}
            <div className="px-6 py-4">
              <div className="space-y-3">
                {steps.map((step) => (
                  <div
                    key={step.step}
                    className={`flex items-start gap-3 ${
                      step.status === 'pending' ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                      {getStepIcon(step.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${
                        step.status === 'error' ? 'text-red-600' :
                        step.status === 'success' ? 'text-gray-900' :
                        step.status === 'running' ? 'text-blue-600' :
                        'text-gray-500'
                      }`}>
                        Step {step.step}: {step.name}
                      </div>
                      {step.message && step.status !== 'pending' && (
                        <div className={`text-xs mt-0.5 ${
                          step.status === 'error' ? 'text-red-500' : 'text-gray-500'
                        }`}>
                          {step.message}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Result */}
              {result?.success && (
                <div className="mt-4 p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-sm font-medium text-green-800">
                    Sync Complete!
                  </div>
                  <div className="text-xs text-green-600 mt-1">
                    Shopify ID: {result.shopifyProductId}
                  </div>
                  {result.shopifyHandle && (
                    <a
                      href={`https://${store.store_url}/products/${result.shopifyHandle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-green-700 underline hover:text-green-800 mt-1 inline-block"
                    >
                      View on Shopify →
                    </a>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
                  <div className="text-sm font-medium text-red-800">
                    Sync Failed
                  </div>
                  <div className="text-xs text-red-600 mt-1">
                    {error}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
              {!isPushing && (
                <>
                  {result?.success ? (
                    <button
                      onClick={handleClose}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                    >
                      Done
                    </button>
                  ) : error ? (
                    <>
                      <button
                        onClick={handleClose}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                      >
                        Close
                      </button>
                      <button
                        onClick={handlePush}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                      >
                        Retry
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Standalone panel version for embedding in pages
 */
export function ShopifyPushPanel({ product, store, onSuccess, onError }: ShopifyPushButtonProps) {
  const [isPushing, setIsPushing] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [stepMessage, setStepMessage] = useState('')
  const [result, setResult] = useState<PushResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleProgress = (step: number, message: string, detail?: string) => {
    setCurrentStep(step)
    setStepMessage(detail || message)
  }

  const handlePush = async () => {
    if (!store.api_credentials?.access_token) {
      setError('Shopify access token not found')
      return
    }

    setIsPushing(true)
    setError(null)
    setResult(null)
    setCurrentStep(0)

    try {
      const pushResult = await pushProductToShopify(
        product,
        {
          id: store.id,
          store_url: store.store_url,
          api_credentials: store.api_credentials
        },
        {
          onProgress: handleProgress,
          defaultInventory: 10,
          activateOnComplete: true
        }
      )

      setResult(pushResult)

      if (pushResult.success) {
        const update = buildSupabaseUpdate(pushResult)
        if (update) {
          await supabase
            .from('products')
            .update({
              platform_ids: {
                ...(product as { platform_ids?: Record<string, string> }).platform_ids,
                shopify: pushResult.shopifyProductId
              },
              sync_status: update.sync_status,
              last_synced_at: update.last_synced_at
            })
            .eq('id', product.id)
        }
        onSuccess?.(pushResult)
      } else {
        const errorMsg = pushResult.errors?.join(', ') || 'Push failed'
        setError(errorMsg)
        onError?.(errorMsg)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setIsPushing(false)
    }
  }

  return (
    <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <span className="text-xl">🛍️</span>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">A-Grade Shopify Sync</h3>
          <p className="text-xs text-gray-600">7-step GraphQL sync with full data</p>
        </div>
      </div>

      {/* Progress bar */}
      {isPushing && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>Step {currentStep}/7: {stepMessage}</span>
            <span>{Math.round((currentStep / 7) * 100)}%</span>
          </div>
          <div className="h-2 bg-green-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-300"
              style={{ width: `${(currentStep / 7) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Result */}
      {result?.success && (
        <div className="mb-3 p-2 bg-green-100 rounded-lg text-sm text-green-800">
          ✓ Synced! ID: {result.shopifyProductId?.split('/').pop()}
        </div>
      )}

      {error && (
        <div className="mb-3 p-2 bg-red-100 rounded-lg text-sm text-red-700">
          ✗ {error}
        </div>
      )}

      {/* Button */}
      <button
        onClick={handlePush}
        disabled={isPushing || !store.api_credentials?.access_token}
        className="w-full px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm flex items-center justify-center gap-2"
      >
        {isPushing ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Syncing to Shopify...
          </>
        ) : result?.success ? (
          <>
            <span>✓</span>
            Sync Again
          </>
        ) : (
          <>
            <span>🚀</span>
            Push to Shopify
          </>
        )}
      </button>

      <p className="text-xs text-gray-500 mt-2 text-center">
        Creates product with variants, images, inventory & SEO
      </p>
    </div>
  )
}

export default ShopifyPushButton
