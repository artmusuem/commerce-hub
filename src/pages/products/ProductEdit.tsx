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

// Shopify variant structure (from JSONB)
interface ShopifyVariant {
  id: number
  title: string
  price: string
  compare_at_price: string | null
  sku: string
  barcode: string | null
  position: number
  inventory_quantity: number
  inventory_management: string | null
  option1: string | null
  option2: string | null
  option3: string | null
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
  const [vendor, setVendor] = useState('')  // Shopify vendor field
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

  // Shopify variants (from JSONB column)
  const [shopifyVariants, setShopifyVariants] = useState<ShopifyVariant[]>([])
  const [editedShopifyVariants, setEditedShopifyVariants] = useState<Record<number, Partial<ShopifyVariant>>>({})
  const [savingShopifyVariant, setSavingShopifyVariant] = useState(false)

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
      setVendor(data.vendor || '')  // Load Shopify vendor
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
        // Shopify-style attributes object - tags now stored in tags column
        setShopifyTags(data.tags?.join(', ') || attrs.shopify_tags || '')
      }
      
      setProductType(data.product_type || 'simple')
      
      // Load Shopify variants from JSONB column
      if (data.variants && Array.isArray(data.variants)) {
        setShopifyVariants(data.variants)
      }
      
      // Load digital download fields
      setIsDigital(data.is_digital || false)
      setDigitalFileUrl(data.digital_file_url || '')
      setDigitalFileName(data.digital_file_name || '')

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
        // Auto-select the product's original store for push
        setSelectedPushStore(data.store_id)
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
          platform: 'shopify'
        }
      }
      
      const { error: updateError } = await supabase
        .from('products')
        .update({
          title,
          description: description || null,
          price: parseFloat(price) || 0,
          artist: artist || null,
          vendor: vendor || null,  // Shopify vendor field
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
        vendor,  // Include vendor for Shopify
        category,
        image_url: imageUrl,
        sku,
        status: status as 'draft' | 'active' | 'archived',
        attributes,  // Include attributes for WooCommerce sync
        variants: shopifyVariants,  // Include variants for Shopify sync
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
        const shopifyProduct = transformToShopify(product, store.store_name || 'Commerce Hub', shopifyTags)
        
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
        
        // Only save external_id if this was a create AND product is from Shopify
        // (don't overwrite Gallery Store or WooCommerce external_id)
        if (!isUpdate && productData?.id && productPlatform === 'shopify') {
          await supabase
            .from('products')
            .update({ external_id: String(productData.id) })
            .eq('id', id)
          setExternalId(String(productData.id))
        }

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

  // Update a Shopify variant field in local state
  // Update a Shopify variant field in local state
  function updateShopifyVariantField(variantId: number, field: keyof ShopifyVariant, value: string | number | null) {
    setEditedShopifyVariants(prev => ({
      ...prev,
      [variantId]: {
        ...prev[variantId],
        [field]: value
      }
    }))
  }

  // Get the current value for a Shopify variant field (edited or original)
  function getShopifyVariantValue(variant: ShopifyVariant, field: keyof ShopifyVariant) {
    const edited = editedShopifyVariants[variant.id]
    if (edited && edited[field] !== undefined) {
      return edited[field]
    }
    return variant[field]
  }

  // Check if any Shopify variant has been edited
  function hasShopifyVariantChanges(): boolean {
    return Object.keys(editedShopifyVariants).length > 0
  }

  // Save all Shopify variant changes to database
  async function handleSaveShopifyVariants() {
    if (!id || !hasShopifyVariantChanges()) return
    
    setSavingShopifyVariant(true)
    try {
      // Merge edits into variants array
      const updatedVariants = shopifyVariants.map(variant => {
        const edits = editedShopifyVariants[variant.id]
        if (edits) {
          return { ...variant, ...edits }
        }
        return variant
      })
      
      // Save to Supabase
      const { error: updateError } = await supabase
        .from('products')
        .update({ variants: updatedVariants })
        .eq('id', id)
      
      if (updateError) throw updateError
      
      // Update local state
      setShopifyVariants(updatedVariants)
      setEditedShopifyVariants({})
      
      // Show success briefly
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (err) {
      console.error('Failed to save Shopify variants:', err)
      alert('Failed to save variants: ' + (err instanceof Error ? err.message : 'Unknown error'))
    } finally {
      setSavingShopifyVariant(false)
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
          {/* Platform indicator */}
          {productPlatform && (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              productPlatform === 'shopify' 
                ? 'bg-green-100 text-green-700' 
                : productPlatform === 'woocommerce'
                ? 'bg-purple-100 text-purple-700'
                : productPlatform === 'gallery-store'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {productPlatform === 'shopify' ? '🛍️ Shopify' 
                : productPlatform === 'woocommerce' ? '🔮 WooCommerce'
                : productPlatform === 'gallery-store' ? '🖼️ Gallery Store'
                : productPlatform}
            </span>
          )}
          {productType && productType !== 'simple' && (
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
              productType === 'variable' 
                ? 'bg-orange-100 text-orange-700' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {productType.charAt(0).toUpperCase() + productType.slice(1)}
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm space-y-4">
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>}
        {saveSuccess && <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm">✓ Changes saved</div>}

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
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={e => setPrice(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
            <input
              type="text"
              value={sku}
              onChange={e => setSku(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="PROD-001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Artist</label>
          <input
            type="text"
            value={artist}
            onChange={e => setArtist(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* Vendor - Shopify products */}
        {productPlatform === 'shopify' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
            <input
              type="text"
              value={vendor}
              onChange={e => setVendor(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="e.g. Commerce Hub"
            />
            <p className="text-xs text-gray-500 mt-1">Shopify vendor/brand name</p>
          </div>
        )}

        {/* Category - Platform-aware */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {productPlatform === 'shopify' ? 'Product Type' : 'Category'}
          </label>
          {productPlatform === 'woocommerce' && availableCategories.length > 0 ? (
            <>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              >
                <option value="">Select category...</option>
                {availableCategories.map(cat => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Categories from WooCommerce ({availableCategories.length} available)
              </p>
            </>
          ) : (
            <>
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder={productPlatform === 'shopify' ? 'e.g., snowboard, t-shirt' : 'Enter category'}
              />
              {productPlatform === 'shopify' && (
                <p className="text-xs text-gray-500 mt-1">
                  Shopify product type (used for filtering)
                </p>
              )}
            </>
          )}
        </div>

        {/* Shopify Tags - show for Shopify products */}
        {(productPlatform === 'shopify' || shopifyTags || stores.some(s => s.platform === 'shopify' && s.id === selectedPushStore)) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Shopify Tags
            </label>
            <input
              type="text"
              value={shopifyTags}
              onChange={e => setShopifyTags(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="tag1, tag2, tag3"
            />
            <p className="text-xs text-gray-500 mt-1">
              Comma-separated tags for Shopify filtering
            </p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
          <input
            type="url"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="https://..."
          />
          {imageUrl && <img src={imageUrl} alt="Preview" className="mt-2 w-32 h-32 object-cover rounded-lg bg-gray-100" />}
        </div>

        {/* Digital Download Section */}
        <div className="border-t pt-4 mt-2">
          <div className="flex items-center gap-4 mb-4">
            <label className="block text-sm font-medium text-gray-700">Product Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="productDelivery"
                  checked={!isDigital}
                  onChange={() => setIsDigital(false)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">Physical Product</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="productDelivery"
                  checked={isDigital}
                  onChange={() => setIsDigital(true)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-sm text-gray-700">📥 Digital Download</span>
              </label>
            </div>
          </div>

          {isDigital && (
            <div className="bg-blue-50 p-4 rounded-lg space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Download File URL *
                </label>
                <input
                  type="url"
                  value={digitalFileUrl}
                  onChange={e => setDigitalFileUrl(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="https://your-file-host.com/bundle.zip"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Direct link to your ZIP, PDF, or other downloadable file
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  File Name (shown to customer)
                </label>
                <input
                  type="text"
                  value={digitalFileName}
                  onChange={e => setDigitalFileName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Vintage-Botanicals-Bundle.zip"
                />
              </div>
              {digitalFileUrl && (
                <div className="flex items-center gap-2 text-green-700 bg-green-100 px-3 py-2 rounded">
                  <span>✓</span>
                  <span className="text-sm">Digital file configured</span>
                  <a 
                    href={digitalFileUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm underline ml-auto"
                  >
                    Test link →
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Attributes Section - Editable */}
        {attributes.length > 0 && productPlatform !== 'shopify' && (
          <div className="border-t pt-4 mt-2">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Product Attributes
              <span className="ml-2 text-xs font-normal text-gray-500">
                (editable)
              </span>
            </label>
            <div className="space-y-3">
              {attributes.map((attr, attrIndex) => (
                <div key={attr.id || attrIndex} className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{attr.name}</span>
                    <div className="flex gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...attributes]
                          updated[attrIndex] = { ...attr, visible: !attr.visible }
                          setAttributes(updated)
                        }}
                        className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                          attr.visible 
                            ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                            : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                        }`}
                      >
                        {attr.visible ? 'Visible' : 'Hidden'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...attributes]
                          updated[attrIndex] = { ...attr, variation: !attr.variation }
                          setAttributes(updated)
                        }}
                        className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                          attr.variation 
                            ? 'bg-purple-100 text-purple-700 hover:bg-purple-200' 
                            : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                        }`}
                      >
                        {attr.variation ? 'Variations' : 'No variations'}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {attr.options.map((option, optIndex) => (
                      <span 
                        key={optIndex}
                        className="px-2 py-1 bg-white border border-gray-200 rounded text-sm text-gray-700 flex items-center gap-1 group"
                      >
                        {option}
                        <button
                          type="button"
                          onClick={() => {
                            const updated = [...attributes]
                            updated[attrIndex] = {
                              ...attr,
                              options: attr.options.filter((_, i) => i !== optIndex)
                            }
                            setAttributes(updated)
                          }}
                          className="text-gray-400 hover:text-red-500 ml-1"
                          title="Remove option"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add option..."
                      value={newOptionInputs[attrIndex] || ''}
                      onChange={(e) => {
                        setNewOptionInputs(prev => ({ ...prev, [attrIndex]: e.target.value }))
                      }}
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const value = (newOptionInputs[attrIndex] || '').trim()
                          if (value && !attr.options.includes(value)) {
                            const updated = [...attributes]
                            updated[attrIndex] = {
                              ...attr,
                              options: [...attr.options, value]
                            }
                            setAttributes(updated)
                            setNewOptionInputs(prev => ({ ...prev, [attrIndex]: '' }))
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const value = (newOptionInputs[attrIndex] || '').trim()
                        if (value && !attr.options.includes(value)) {
                          const updated = [...attributes]
                          updated[attrIndex] = {
                            ...attr,
                            options: [...attr.options, value]
                          }
                          setAttributes(updated)
                          setNewOptionInputs(prev => ({ ...prev, [attrIndex]: '' }))
                        }
                      }}
                      className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shopify Variants Section */}
        {productType === 'variable' && productPlatform === 'shopify' && shopifyVariants.length > 0 && (
          <div className="border-t pt-4 mt-2">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Product Variants
                <span className="ml-2 text-xs font-normal text-gray-500">
                  (from Shopify - {shopifyVariants.length} variants)
                </span>
              </label>
              {hasShopifyVariantChanges() && (
                <button
                  type="button"
                  onClick={handleSaveShopifyVariants}
                  disabled={savingShopifyVariant}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingShopifyVariant ? 'Saving...' : 'Save Variants'}
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Variant</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">SKU</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Price</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Compare At</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Inventory</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {shopifyVariants.map((variant) => {
                    const hasEdits = editedShopifyVariants[variant.id] !== undefined
                    return (
                    <tr key={variant.id} className={`hover:bg-gray-50 ${hasEdits ? 'bg-blue-50' : ''}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{variant.title}</div>
                        {(variant.option1 || variant.option2 || variant.option3) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {variant.option1 && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                                {variant.option1}
                              </span>
                            )}
                            {variant.option2 && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                                {variant.option2}
                              </span>
                            )}
                            {variant.option3 && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                                {variant.option3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={getShopifyVariantValue(variant, 'sku') as string}
                          onChange={(e) => updateShopifyVariantField(variant.id, 'sku', e.target.value)}
                          placeholder="Enter SKU"
                          className={`w-24 px-2 py-1 text-xs font-mono border rounded focus:ring-1 focus:ring-blue-500 outline-none ${
                            hasEdits ? 'border-blue-400' : 'border-gray-300'
                          }`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">$</span>
                          <input
                            type="text"
                            value={getShopifyVariantValue(variant, 'price') as string}
                            onChange={(e) => updateShopifyVariantField(variant.id, 'price', e.target.value)}
                            className={`w-20 px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500 outline-none ${
                              hasEdits ? 'border-blue-400' : 'border-gray-300'
                            }`}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400">$</span>
                          <input
                            type="text"
                            value={(getShopifyVariantValue(variant, 'compare_at_price') as string) || ''}
                            onChange={(e) => updateShopifyVariantField(variant.id, 'compare_at_price', e.target.value || null)}
                            placeholder="-"
                            className={`w-20 px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500 outline-none ${
                              hasEdits ? 'border-blue-400' : 'border-gray-300'
                            }`}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={getShopifyVariantValue(variant, 'inventory_quantity') as number}
                          onChange={(e) => updateShopifyVariantField(variant.id, 'inventory_quantity', parseInt(e.target.value) || 0)}
                          className={`w-16 px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500 outline-none ${
                            hasEdits ? 'border-blue-400' : 'border-gray-300'
                          }`}
                        />
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Edit variant data inline. Click "Save Variants" to update. Changes sync to Commerce Hub only (not Shopify).
            </p>
          </div>
        )}

        {/* WooCommerce Variations Section - for variable products */}
        {productType === 'variable' && productPlatform === 'woocommerce' && (
          <div className="border-t pt-4 mt-2">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Product Variations
              <span className="ml-2 text-xs font-normal text-gray-500">
                (from WooCommerce - {variations.length} variations)
              </span>
            </label>
            {loadingVariations ? (
              <div className="text-sm text-gray-500">Loading variations...</div>
            ) : variations.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Variation</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">SKU</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Price</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Stock</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {variations.map((variation) => {
                      const isEditing = editedVariationPrices[variation.id] !== undefined
                      const currentPrice = isEditing 
                        ? editedVariationPrices[variation.id] 
                        : (variation.regular_price || variation.price || '0')
                      const hasChanged = isEditing && editedVariationPrices[variation.id] !== (variation.regular_price || variation.price || '0')
                      
                      return (
                      <tr key={variation.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {variation.attributes.map((attr, i) => (
                              <span key={i} className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                                {attr.name}: {attr.option}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {variation.sku || '-'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">$</span>
                            <input
                              type="text"
                              value={currentPrice}
                              onChange={(e) => {
                                setEditedVariationPrices(prev => ({
                                  ...prev,
                                  [variation.id]: e.target.value
                                }))
                              }}
                              className={`w-20 px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500 outline-none ${
                                hasChanged ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                              }`}
                            />
                          </div>
                          {variation.sale_price && (
                            <span className="text-green-600 text-xs">
                              Sale: ${variation.sale_price}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            variation.stock_status === 'instock' 
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {variation.stock_status === 'instock' ? 'In Stock' : 'Out of Stock'}
                            {variation.stock_quantity !== null && ` (${variation.stock_quantity})`}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {hasChanged && (
                            <button
                              type="button"
                              onClick={() => handleSaveVariationPrice(variation.id)}
                              disabled={savingVariationId === variation.id}
                              className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                            >
                              {savingVariationId === variation.id ? 'Saving...' : 'Save'}
                            </button>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                No variations found. Variations are managed in WooCommerce.
              </div>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Edit prices inline and click Save to update WooCommerce.
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <Link to="/products" className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
            Cancel
          </Link>
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

          {/* Cross-platform push warning */}
          {(() => {
            if (!selectedPushStore || !productPlatform) return null
            const selectedStore = stores.find(s => s.id === selectedPushStore)
            if (selectedStore && selectedStore.platform !== productPlatform) {
              return (
                <div className="mb-4 p-3 rounded-lg text-sm bg-yellow-50 text-yellow-700 border border-yellow-200">
                  ⚠️ This product is from <strong>{productPlatform}</strong> but you're pushing to <strong>{selectedStore.platform}</strong>. 
                  This will create a new product there (not update).
                </div>
              )
            }
            return null
          })()}

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
