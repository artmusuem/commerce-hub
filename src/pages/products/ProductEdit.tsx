import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { transformToWooCommerce, transformToShopify } from '../../lib/transforms'
import type { WooCategoryMap } from '../../lib/transforms'
import { pushProductToWooCommerce, fetchProductVariations, updateProductVariation } from '../../lib/woocommerce'
import type { WooCommerceVariation } from '../../lib/woocommerce'

interface WooCredentials {
  consumer_key: string
  consumer_secret: string
  categories?: { id: number; name: string }[]
}

interface ProductAttribute {
  id: number
  name: string
  slug?: string
  position: number
  visible: boolean
  variation: boolean
  options: string[]
}

// Shopify-specific types
interface ShopifyVariant {
  id: number
  title: string
  price: string
  compare_at_price?: string | null
  sku: string
  barcode?: string | null
  position: number
  inventory_quantity: number
  inventory_management?: string | null
  option1?: string | null
  option2?: string | null
  option3?: string | null
}

interface ShopifyOption {
  id: number
  name: string
  position: number
  values: string[]
}

interface ShopifyImage {
  id: number
  position: number
  src: string
  alt?: string | null
}

interface Store {
  id: string
  platform: string
  store_name: string | null
  store_url: string | null
  api_credentials: WooCredentials | { access_token?: string } | null
}

export function ProductEdit() {
  const { id } = useParams<{ id: string }>()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [artist, setArtist] = useState('')
  const [category, setCategory] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [status, setStatus] = useState('draft')
  const [sku, setSku] = useState('')
  const [_storeId, setStoreId] = useState<string | null>(null)
  const [productPlatform, setProductPlatform] = useState<string | null>(null)
  const [externalId, setExternalId] = useState<string | null>(null)
  const [attributes, setAttributes] = useState<ProductAttribute[]>([])
  const [shopifyTags, setShopifyTags] = useState('')
  const [productType, setProductType] = useState<string>('simple')
  const [newOptionInputs, setNewOptionInputs] = useState<Record<number, string>>({})  // Track new option input per attribute
  const [variations, setVariations] = useState<WooCommerceVariation[]>([])
  const [loadingVariations, setLoadingVariations] = useState(false)
  const [editedVariationPrices, setEditedVariationPrices] = useState<Record<number, string>>({})
  const [savingVariationId, setSavingVariationId] = useState<number | null>(null)

  // Shopify-specific state
  const [shopifyVariants, setShopifyVariants] = useState<ShopifyVariant[]>([])
  const [shopifyOptions, setShopifyOptions] = useState<ShopifyOption[]>([])
  const [shopifyImages, setShopifyImages] = useState<ShopifyImage[]>([])
  const [vendor, setVendor] = useState('')
  const [urlHandle, setUrlHandle] = useState('')
  const [syncStatus, setSyncStatus] = useState('synced')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [editedShopifyPrices, setEditedShopifyPrices] = useState<Record<number, string>>({})
  const [savingShopifyVariantId, setSavingShopifyVariantId] = useState<number | null>(null)

  // Digital download state
  const [isDigital, setIsDigital] = useState(false)
  const [digitalFileUrl, setDigitalFileUrl] = useState('')
  const [digitalFileName, setDigitalFileName] = useState('')

  // Push to Store state
  const [stores, setStores] = useState<Store[]>([])
  const [selectedPushStore, setSelectedPushStore] = useState('')
  const [pushing, setPushing] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null)

  // Derive available categories from WooCommerce stores
  const availableCategories = stores
    .filter(s => s.platform === 'woocommerce')
    .flatMap(s => {
      const creds = s.api_credentials as WooCredentials | null
      return creds?.categories || []
    })
    .filter((cat, index, self) => 
      self.findIndex(c => c.id === cat.id) === index // dedupe by id
    )

  useEffect(() => {
    async function load() {
      if (!id) return
      
      // Load product
      const { data, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError || !data) {
        setError('Product not found')
        setLoading(false)
        return
      }

      setTitle(data.title)
      setDescription(data.description || '')
      setPrice(data.price.toString())
      setArtist(data.artist || '')
      setCategory(data.category || '')
      setImageUrl(data.image_url || '')
      setStatus(data.status)
      setSku(data.sku || '')
      setStoreId(data.store_id || null)
      setExternalId(data.external_id || null)
      
      // Handle attributes - can be array (WooCommerce) or object (Shopify)
      const attrs = data.attributes || []
      if (Array.isArray(attrs)) {
        setAttributes(attrs)
      } else if (attrs && typeof attrs === 'object') {
        // Shopify-style attributes object
        setShopifyTags(attrs.shopify_tags || '')
      }
      
      setProductType(data.product_type || 'simple')
      
      // Load digital download fields
      setIsDigital(data.is_digital || false)
      setDigitalFileUrl(data.digital_file_url || '')
      setDigitalFileName(data.digital_file_name || '')

      // Load Shopify-specific fields
      setVendor(data.vendor || '')
      setUrlHandle(data.url_handle || '')
      setSyncStatus(data.sync_status || 'synced')
      setLastSyncedAt(data.last_synced_at || null)
      
      // Load Shopify variants, options, and images
      if (data.variants && Array.isArray(data.variants)) {
        setShopifyVariants(data.variants)
      }
      if (data.options && Array.isArray(data.options)) {
        setShopifyOptions(data.options)
      }
      if (data.images && Array.isArray(data.images)) {
        setShopifyImages(data.images)
      }

      // Load stores for push functionality
      const { data: storesData } = await supabase
        .from('stores')
        .select('id, platform, store_name, store_url, api_credentials')
        .in('platform', ['woocommerce', 'shopify', 'gallery-store'])
      
      setStores(storesData || [])
      
      // Determine product's platform from its store_id
      if (data.store_id && storesData) {
        const productStore = storesData.find(s => s.id === data.store_id)
        setProductPlatform(productStore?.platform || null)
      }
      
      setLoading(false)
    }
    load()
  }, [id])

  // Fetch variations for variable products
  useEffect(() => {
    async function loadVariations() {
      if (productType !== 'variable' || !externalId || !stores.length) return
      
      // Find the WooCommerce store
      const wooStore = stores.find(s => s.platform === 'woocommerce')
      if (!wooStore) return
      
      const credentials = wooStore.api_credentials as WooCredentials | null
      if (!credentials?.consumer_key || !credentials?.consumer_secret) return
      
      setLoadingVariations(true)
      try {
        const vars = await fetchProductVariations(
          {
            siteUrl: wooStore.store_url || '',
            consumerKey: credentials.consumer_key,
            consumerSecret: credentials.consumer_secret
          },
          parseInt(externalId)
        )
        setVariations(vars)
      } catch (err) {
        console.error('Failed to load variations:', err)
      }
      setLoadingVariations(false)
    }
    loadVariations()
  }, [productType, externalId, stores])

  async function handleSubmit(e: React.FormEvent) {
    console.log('handleSubmit called')
    e.preventDefault()
    e.stopPropagation()
    console.log('preventDefault called')
    
    if (!id) {
      console.log('No id, returning')
      return
    }
    
    setError('')
    setSaving(true)
    console.log('Starting save...')

    try {
      // Determine attributes format based on platform
      // Shopify: save as object with shopify_tags
      // WooCommerce: save as array of attributes
      let attributesToSave: unknown = attributes
      if (productPlatform === 'shopify') {
        attributesToSave = {
          shopify_tags: shopifyTags,
          platform: 'shopify',
          has_variants: shopifyVariants.length > 1
        }
      }

      // Build update object
      const updateData: Record<string, unknown> = {
        title,
        description: description || null,
        price: parseFloat(price) || 0,
        artist: artist || null,
        category: category || null,
        image_url: imageUrl || null,
        status,
        sku: sku || null,
        attributes: attributesToSave,
        // Digital download fields
        is_digital: isDigital,
        digital_file_url: digitalFileUrl || null,
        digital_file_name: digitalFileName || null,
      }

      // Add Shopify-specific fields
      if (productPlatform === 'shopify') {
        updateData.vendor = vendor || null
        updateData.url_handle = urlHandle || null
        updateData.tags = shopifyTags || null
        updateData.sync_status = 'modified' // Mark as modified when saving locally
        // Preserve variants/options/images (they're updated via API, not form)
        if (shopifyVariants.length > 0) {
          updateData.variants = shopifyVariants
        }
        if (shopifyOptions.length > 0) {
          updateData.options = shopifyOptions
        }
        if (shopifyImages.length > 0) {
          updateData.images = shopifyImages
        }
      }
      
      const { error: updateError } = await supabase
        .from('products')
        .update(updateData)
        .eq('id', id)

      console.log('Supabase response:', updateError ? 'ERROR' : 'SUCCESS')

      if (updateError) {
        console.log('Update error:', updateError.message)
        setError(updateError.message)
        setSaving(false)
        return
      }

      console.log('Save successful, staying on page')
      setSaving(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
      console.log('handleSubmit complete - should NOT navigate')
    } catch (err) {
      console.error('Caught error in handleSubmit:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setSaving(false)
    }
  }


  async function handlePushToStore() {
    if (!selectedPushStore || !id) return
    
    const store = stores.find(s => s.id === selectedPushStore)
    if (!store) return

    setPushing(true)
    setPushResult(null)

    try {
      // Determine attributes format based on platform
      let attributesToSave: unknown = attributes
      if (productPlatform === 'shopify' || store.platform === 'shopify') {
        attributesToSave = {
          shopify_tags: shopifyTags,
          platform: 'shopify'
        }
      }

      // Auto-save to Supabase first
      const { error: saveError } = await supabase
        .from('products')
        .update({
          title,
          description: description || null,
          price: parseFloat(price) || 0,
          artist: artist || null,
          category: category || null,
          image_url: imageUrl || null,
          status,
          sku: sku || null,
          attributes: attributesToSave,
          // Digital download fields
          is_digital: isDigital,
          digital_file_url: digitalFileUrl || null,
          digital_file_name: digitalFileName || null,
        })
        .eq('id', id)

      if (saveError) {
        throw new Error(`Failed to save: ${saveError.message}`)
      }

      const product = {
        id,
        title,
        description,
        price: parseFloat(price) || 0,
        artist,
        category,
        image_url: imageUrl,
        sku,
        status: status as 'draft' | 'active' | 'archived',
        attributes,  // Include attributes for WooCommerce sync
        // Digital download fields
        is_digital: isDigital,
        digital_file_url: digitalFileUrl,
        digital_file_name: digitalFileName,
      }

      if (store.platform === 'woocommerce') {
        // WooCommerce push
        const credentials = store.api_credentials as WooCredentials | null
        
        if (!credentials?.consumer_key || !credentials?.consumer_secret) {
          throw new Error('WooCommerce API credentials not found for this store')
        }

        // Build category map: lowercase name → WooCommerce ID
        const categoryMap: WooCategoryMap = {}
        if (credentials.categories) {
          for (const cat of credentials.categories) {
            categoryMap[cat.name.toLowerCase()] = cat.id
          }
        }

        const wooProduct = transformToWooCommerce(product, categoryMap)
        
        // Only use external_id for updates if product came from WooCommerce
        // (prevents using Shopify ID to try updating WooCommerce)
        const wooExternalId = productPlatform === 'woocommerce' && externalId 
          ? parseInt(externalId) 
          : undefined
        
        const result = await pushProductToWooCommerce(
          {
            siteUrl: store.store_url || '',
            consumerKey: credentials.consumer_key,
            consumerSecret: credentials.consumer_secret
          },
          wooProduct,
          wooExternalId
        )

        setPushResult({
          success: true,
          message: `Product pushed to WooCommerce! ID: ${result.id}`
        })
            } else if (store.platform === 'shopify') {
        // Shopify push via serverless proxy (avoids CORS)
        const credentials = store.api_credentials as { access_token?: string } | null
        
        if (!credentials?.access_token) {
          throw new Error('Shopify access token not found for this store')
        }

        const shopDomain = store.store_url?.replace(/^https?:\/\//, '').replace(/\/$/, '') || ''
        // Use vendor field if set, otherwise fall back to store name
        const vendorName = vendor || store.store_name || 'Commerce Hub'
        const shopifyProduct = transformToShopify(product, vendorName, shopifyTags)
        
        // Only use external_id for updates if product came from Shopify
        // (prevents using WooCommerce ID to try updating Shopify)
        const isUpdate = productPlatform === 'shopify' && externalId && !isNaN(parseInt(externalId))
        
        const response = await fetch('/api/shopify/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shop: shopDomain,
            accessToken: credentials.access_token,
            action: isUpdate ? 'update' : 'create',
            productId: isUpdate ? externalId : undefined,
            product: shopifyProduct
          })
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Shopify push failed')
        }

        const result = await response.json()
        const productData = result.product
        
        // Update sync status and external_id
        const syncUpdate: Record<string, unknown> = {
          sync_status: 'synced',
          last_synced_at: new Date().toISOString()
        }
        
        // Only save external_id if this was a create AND product is from Shopify
        // (don't overwrite Gallery Store or WooCommerce external_id)
        if (!isUpdate && productData?.id && productPlatform === 'shopify') {
          syncUpdate.external_id = String(productData.id)
          setExternalId(String(productData.id))
        }
        
        await supabase
          .from('products')
          .update(syncUpdate)
          .eq('id', id)
        
        setSyncStatus('synced')
        setLastSyncedAt(new Date().toISOString())

        setPushResult({
          success: true,
          message: isUpdate 
            ? `Product updated in Shopify! ID: ${productData?.id}`
            : `Product created in Shopify! ID: ${productData?.id}`
        })
      } else if (store.platform === 'gallery-store') {
        // Gallery Store push - updates JSON file in GitHub repo
        const credentials = store.api_credentials as { github_token?: string } | null
        
        if (!credentials?.github_token) {
          throw new Error('GitHub token not found for Gallery Store. Please update store credentials.')
        }

        // Valid collections
        const validCollections = [
          'winslow-homer', 'mary-cassatt', 'thomas-cole',
          'frederic-remington', 'georgia-okeeffe', 'edward-hopper'
        ]

        // Use external_id as collection slug (set during import)
        // Fall back to deriving from artist name if not available
        let collectionSlug = externalId && validCollections.includes(externalId) 
          ? externalId 
          : artist.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        
        if (!collectionSlug || !validCollections.includes(collectionSlug)) {
          throw new Error(
            `Cannot push to Gallery Store: "${artist}" is not a recognized collection.\n` +
            `Valid collections: ${validCollections.join(', ')}`
          )
        }

        // Fetch all products for this collection from Supabase to push complete JSON
        const { data: collectionProducts, error: fetchError } = await supabase
          .from('products')
          .select('*')
          .eq('store_id', store.id)
          .eq('external_id', collectionSlug)

        if (fetchError) throw fetchError

        if (!collectionProducts || collectionProducts.length === 0) {
          throw new Error(`No products found for collection: ${collectionSlug}`)
        }

        // Push to Gallery Store
        const response = await fetch('/api/gallery-store/push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artistId: collectionSlug,
            artworks: collectionProducts,
            githubToken: credentials.github_token
          })
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || error.error || 'Failed to push to Gallery Store')
        }

        const result = await response.json()
        
        setPushResult({
          success: true,
          message: `✅ Published! ${result.message} — Live in ~30 seconds (hard refresh if cached)`
        })
      }
    } catch (err) {
      setPushResult({
        success: false,
        message: err instanceof Error ? err.message : 'Push failed'
      })
    } finally {
      setPushing(false)
    }
  }

  async function handleResetToDemo() {
    if (!selectedPushStore || !id) return
    
    const store = stores.find(s => s.id === selectedPushStore)
    if (!store || store.platform !== 'gallery-store') return

    const credentials = store.api_credentials as { github_token?: string } | null
    if (!credentials?.github_token) {
      setPushResult({
        success: false,
        message: 'GitHub token not found for Gallery Store'
      })
      return
    }

    // Valid collections
    const validCollections = [
      'winslow-homer', 'mary-cassatt', 'thomas-cole',
      'frederic-remington', 'georgia-okeeffe', 'edward-hopper'
    ]

    // Use external_id as collection slug (set during import)
    // Fall back to deriving from artist name if not available
    let collectionSlug = externalId && validCollections.includes(externalId)
      ? externalId
      : artist.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

    if (!collectionSlug || !validCollections.includes(collectionSlug)) {
      setPushResult({
        success: false,
        message: `Cannot reset: "${artist}" is not a recognized collection. Valid: ${validCollections.join(', ')}`
      })
      return
    }

    setResetting(true)
    setPushResult(null)

    try {
      const response = await fetch('/api/gallery-store/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistId: collectionSlug,
          githubToken: credentials.github_token
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to reset')
      }

      const result = await response.json()
      
      setPushResult({
        success: true,
        message: `🔄 ${result.message}. Vercel will auto-deploy in ~30 seconds.`
      })
    } catch (err) {
      setPushResult({
        success: false,
        message: err instanceof Error ? err.message : 'Reset failed'
      })
    } finally {
      setResetting(false)
    }
  }

  async function handleSaveVariationPrice(variationId: number) {
    const newPrice = editedVariationPrices[variationId]
    if (!newPrice || !externalId) return
    
    const wooStore = stores.find(s => s.platform === 'woocommerce')
    if (!wooStore) return
    
    const credentials = wooStore.api_credentials as WooCredentials | null
    if (!credentials?.consumer_key || !credentials?.consumer_secret) return
    
    setSavingVariationId(variationId)
    try {
      const updated = await updateProductVariation(
        {
          siteUrl: wooStore.store_url || '',
          consumerKey: credentials.consumer_key,
          consumerSecret: credentials.consumer_secret
        },
        parseInt(externalId),
        variationId,
        { regular_price: newPrice }
      )
      
      // Update local state
      setVariations(prev => prev.map(v => 
        v.id === variationId 
          ? { ...v, regular_price: updated.regular_price, price: updated.price }
          : v
      ))
      
      // Clear edited state
      setEditedVariationPrices(prev => {
        const next = { ...prev }
        delete next[variationId]
        return next
      })
    } catch (err) {
      console.error('Failed to save variation price:', err)
      alert('Failed to save price: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSavingVariationId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error === 'Product not found') {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Product not found</p>
        <Link to="/products" className="text-blue-600 hover:underline">Back to Products</Link>
      </div>
    )
  }

  const pushableStores = stores.filter(s => 
    s.platform === 'woocommerce' || s.platform === 'shopify' || s.platform === 'gallery-store'
  )

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link to="/products" className="text-blue-600 hover:underline text-sm">← Back to Products</Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-gray-900">Edit Product</h1>
          {productType && productType !== 'simple' && (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              productType === 'variable' 
                ? 'bg-purple-100 text-purple-700' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {productType.charAt(0).toUpperCase() + productType.slice(1)}
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
        {saveSuccess && <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm">✓ Changes saved</div>}

        {/* Two-Column Layout - Shopify Style */}
        <div className="flex gap-6">
          
          {/* LEFT COLUMN - Main Content */}
          <div className="flex-1 space-y-6">
            
            {/* Title & Description Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Describe your product..."
                />
              </div>
            </div>

            {/* Media Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <label className="block text-sm font-medium text-gray-700 mb-3">Media</label>
              
              {/* Main Image */}
              <div className="mb-4">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="https://example.com/image.jpg"
                />
              </div>
              
              {/* Image Preview Gallery */}
              <div className="flex flex-wrap gap-3">
                {imageUrl && (
                  <div className="relative group">
                    <img src={imageUrl} alt="Primary" className="w-24 h-24 object-cover rounded-lg border-2 border-blue-500" />
                    <span className="absolute top-1 left-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">Primary</span>
                  </div>
                )}
                {productPlatform === 'shopify' && shopifyImages.length > 1 && shopifyImages.slice(1).map((img, idx) => (
                  <div key={img.id} className="relative group">
                    <img src={img.src} alt={img.alt || `Image ${idx + 2}`} className="w-24 h-24 object-cover rounded-lg border" />
                  </div>
                ))}
                {/* Add image placeholder */}
                <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 hover:border-gray-400 cursor-pointer">
                  <span className="text-2xl">+</span>
                </div>
              </div>
            </div>

            {/* Pricing Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <label className="block text-sm font-medium text-gray-700 mb-3">Pricing</label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Price *</label>
                  <div className="flex items-center">
                    <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={price}
                      onChange={e => setPrice(e.target.value)}
                      required
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Compare at price</label>
                  <div className="flex items-center">
                    <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Inventory Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <label className="block text-sm font-medium text-gray-700">Inventory</label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Track quantity</span>
                  <div className="relative">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 transition-colors"></div>
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
                  </div>
                </label>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">SKU (Stock Keeping Unit)</label>
                  <input
                    type="text"
                    value={sku}
                    onChange={e => setSku(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="PROD-001"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Barcode (ISBN, UPC, etc.)</label>
                  <input
                    type="text"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder=""
                  />
                </div>
              </div>

              {/* Shopify variants with inventory */}
              {productPlatform === 'shopify' && shopifyVariants.length > 1 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-xs font-medium text-gray-500 uppercase mb-2">Variant Inventory</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b">
                          <th className="pb-2">Variant</th>
                          <th className="pb-2">SKU</th>
                          <th className="pb-2 text-right">Available</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shopifyVariants.map(variant => (
                          <tr key={variant.id} className="border-b last:border-0">
                            <td className="py-2 font-medium">{variant.title}</td>
                            <td className="py-2 text-gray-500">{variant.sku || '—'}</td>
                            <td className="py-2 text-right">
                              <span className={`px-2 py-0.5 rounded text-xs ${
                                variant.inventory_quantity > 10 ? 'bg-green-100 text-green-700' :
                                variant.inventory_quantity > 0 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {variant.inventory_quantity ?? 0}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Digital Download Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-medium text-gray-700">Shipping</label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <span className="text-gray-500">Physical product</span>
                  <div className="relative">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={!isDigital}
                      onChange={() => setIsDigital(!isDigital)}
                    />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:bg-blue-600 transition-colors"></div>
                    <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5"></div>
                  </div>
                </label>
              </div>
              
              {isDigital && (
                <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                  <div className="flex items-center gap-2 text-blue-700 text-sm font-medium">
                    <span>📥</span> Digital Download Product
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Download URL</label>
                    <input
                      type="url"
                      value={digitalFileUrl}
                      onChange={e => setDigitalFileUrl(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">File Name</label>
                    <input
                      type="text"
                      value={digitalFileName}
                      onChange={e => setDigitalFileName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="product-file.zip"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Variants Card - Shopify Options */}
            {productPlatform === 'shopify' && shopifyOptions.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-3">Variants</label>
                <div className="space-y-4">
                  {shopifyOptions.map(option => (
                    <div key={option.id}>
                      <div className="text-xs font-medium text-gray-500 uppercase mb-2">{option.name}</div>
                      <div className="flex flex-wrap gap-2">
                        {option.values.map((value, idx) => (
                          <span key={idx} className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm">
                            {value}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Variant Pricing Table */}
                {shopifyVariants.length > 1 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="text-xs font-medium text-gray-500 uppercase mb-2">Variant Pricing</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 border-b">
                            <th className="pb-2">Variant</th>
                            <th className="pb-2">Price</th>
                            <th className="pb-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {shopifyVariants.map(variant => (
                            <tr key={variant.id} className="border-b last:border-0">
                              <td className="py-2 font-medium">{variant.title}</td>
                              <td className="py-2">
                                <div className="flex items-center gap-1">
                                  <span className="text-gray-400">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editedShopifyPrices[variant.id] ?? variant.price}
                                    onChange={e => setEditedShopifyPrices(prev => ({
                                      ...prev,
                                      [variant.id]: e.target.value
                                    }))}
                                    className="w-20 px-2 py-1 border rounded text-sm"
                                  />
                                </div>
                              </td>
                              <td className="py-2">
                                {editedShopifyPrices[variant.id] !== undefined && 
                                 editedShopifyPrices[variant.id] !== variant.price && (
                                  <button
                                    type="button"
                                    onClick={() => console.log('Save variant', variant.id)}
                                    className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                                  >
                                    Save
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* WooCommerce Attributes Card */}
            {productPlatform === 'woocommerce' && attributes.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Attributes
                  {productType === 'variable' && (
                    <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">Variable</span>
                  )}
                </label>
                <div className="space-y-3">
                  {attributes.map((attr, attrIndex) => (
                    <div key={attr.id || attrIndex} className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">{attr.name}</span>
                        <div className="flex gap-2 text-xs">
                          <span className={`px-2 py-0.5 rounded ${attr.visible ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                            {attr.visible ? 'Visible' : 'Hidden'}
                          </span>
                          {attr.variation && (
                            <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                              For variations
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {attr.options.map((option, optIndex) => (
                          <span key={optIndex} className="px-2 py-1 bg-white border rounded text-sm">
                            {option}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* WooCommerce Variations */}
            {productPlatform === 'woocommerce' && productType === 'variable' && variations.length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Variation Prices
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    ({variations.length} variations)
                  </span>
                </label>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b">
                        <th className="pb-2">Variation</th>
                        <th className="pb-2">SKU</th>
                        <th className="pb-2">Price</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {variations.map(variation => (
                        <tr key={variation.id} className="border-b last:border-0">
                          <td className="py-2">
                            {variation.attributes.map(a => a.option).join(' / ') || `#${variation.id}`}
                          </td>
                          <td className="py-2 text-gray-500">{variation.sku || '—'}</td>
                          <td className="py-2">
                            <div className="flex items-center gap-1">
                              <span className="text-gray-400">$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={editedVariationPrices[variation.id] ?? variation.regular_price}
                                onChange={e => setEditedVariationPrices(prev => ({
                                  ...prev,
                                  [variation.id]: e.target.value
                                }))}
                                className="w-20 px-2 py-1 border rounded text-sm"
                              />
                            </div>
                          </td>
                          <td className="py-2">
                            {editedVariationPrices[variation.id] !== undefined && (
                              <button
                                type="button"
                                onClick={() => handleSaveVariationPrice(variation.id)}
                                disabled={savingVariationId === variation.id}
                                className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                {savingVariationId === variation.id ? '...' : 'Save'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SEO Preview Card */}
            {productPlatform === 'shopify' && urlHandle && (
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-3">Search engine listing</label>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-500 mb-1">
                    dev-store.myshopify.com › products › {urlHandle}
                  </div>
                  <div className="text-blue-600 text-lg font-medium hover:underline cursor-pointer">
                    {title}
                  </div>
                  <div className="text-sm text-gray-600 line-clamp-2 mt-1">
                    {description?.slice(0, 160) || 'No description...'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN - Sidebar */}
          <div className="w-80 space-y-6">
            
            {/* Status Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {/* Publishing Card */}
            {productPlatform === 'shopify' && (
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-3">Publishing</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                    <input type="checkbox" defaultChecked className="w-4 h-4 text-blue-600 rounded" />
                    <span className="text-sm">Online Store</span>
                  </label>
                  <label className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" />
                    <span className="text-sm">Point of Sale</span>
                  </label>
                </div>
              </div>
            )}

            {/* Product Organization Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm space-y-4">
              <label className="block text-sm font-medium text-gray-700">Product organization</label>
              
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {productPlatform === 'shopify' ? 'Product type' : 'Category'}
                </label>
                {productPlatform === 'woocommerce' && availableCategories.length > 0 ? (
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Select category...</option>
                    {availableCategories.map(cat => (
                      <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="e.g., Art Print"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Vendor</label>
                <input
                  type="text"
                  value={productPlatform === 'shopify' ? vendor : artist}
                  onChange={e => productPlatform === 'shopify' ? setVendor(e.target.value) : setArtist(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  placeholder={productPlatform === 'shopify' ? 'Vendor name' : 'Artist name'}
                />
              </div>

              {productPlatform === 'shopify' && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Collections</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="Search collections..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tags</label>
                    <input
                      type="text"
                      value={shopifyTags}
                      onChange={e => setShopifyTags(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="tag1, tag2, tag3"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Sync Status Card */}
            {productPlatform === 'shopify' && (
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-3">Sync Status</label>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${
                    syncStatus === 'synced' ? 'bg-green-500' :
                    syncStatus === 'modified' ? 'bg-yellow-500' :
                    'bg-gray-400'
                  }`}></span>
                  <span className="text-sm font-medium">
                    {syncStatus === 'synced' ? 'Synced with Shopify' :
                     syncStatus === 'modified' ? 'Modified locally' :
                     syncStatus}
                  </span>
                </div>
                {lastSyncedAt && (
                  <div className="text-xs text-gray-500">
                    Last synced: {new Date(lastSyncedAt).toLocaleString()}
                  </div>
                )}
              </div>
            )}

            {/* Push to Store Card */}
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <label className="block text-sm font-medium text-gray-700 mb-3">Push to Store</label>
              <select
                value={selectedPushStore}
                onChange={e => setSelectedPushStore(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3"
              >
                <option value="">Select store...</option>
                {stores.filter(s => 
                  s.platform === 'woocommerce' || s.platform === 'shopify' || s.platform === 'gallery-store'
                ).map(store => (
                  <option key={store.id} value={store.id}>
                    {store.store_name || store.store_url} ({store.platform})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handlePushToStore}
                disabled={!selectedPushStore || pushing}
                className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pushing ? 'Pushing...' : 'Push to Store'}
              </button>
              
              {pushResult && (
                <div className={`mt-3 p-3 rounded-lg text-sm ${
                  pushResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>
                  {pushResult.message}
                </div>
              )}
            </div>

            {/* Save Button - Sticky */}
            <div className="sticky bottom-6">
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Push to Store Section */}
      {pushableStores.length > 0 && (
        <div className="mt-6 bg-white p-6 rounded-xl shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Push to External Store</h2>
          <p className="text-sm text-gray-600 mb-4">
            Sync this product to your connected e-commerce platforms.
          </p>

          {pushResult && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              pushResult.success 
                ? 'bg-green-50 text-green-700' 
                : 'bg-red-50 text-red-600'
            }`}>
              {pushResult.message}
            </div>
          )}

          <div className="flex gap-3">
            <select
              value={selectedPushStore}
              onChange={e => setSelectedPushStore(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Select a store...</option>
              {pushableStores.map(store => (
                <option key={store.id} value={store.id}>
                  {store.store_name || store.store_url} ({store.platform})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handlePushToStore}
              disabled={!selectedPushStore || pushing || resetting}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pushing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Pushing...
                </span>
              ) : (
                '🚀 Save & Publish'
              )}
            </button>
            {/* Reset to Demo button - only for Gallery Store */}
            {selectedPushStore && stores.find(s => s.id === selectedPushStore)?.platform === 'gallery-store' && (
              <button
                type="button"
                onClick={handleResetToDemo}
                disabled={resetting || pushing}
                className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resetting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Resetting...
                  </span>
                ) : (
                  '🔄 Reset to Demo'
                )}
              </button>
            )}
          </div>

          <p className="text-xs text-gray-400 mt-3">
            Connected stores: {pushableStores.map(s => s.platform).join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}
