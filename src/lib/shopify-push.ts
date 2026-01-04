/**
 * Shopify Push Service - 7-Step Product Sync Orchestrator
 *
 * Implements the A-grade sync process from docs/WOOCOMMERCE-SHOPIFY-SYNC-GUIDE.md
 *
 * Usage:
 *   import { pushProductToShopify } from './shopify-push'
 *   const result = await pushProductToShopify(product, store, { onProgress })
 */

import {
  MUTATIONS,
  buildCreateProductInput,
  buildMediaInput,
  buildCreateVariantsInput,
  buildUpdateVariantsInput,
  buildInventoryInput,
  buildSeoUpdateInput,
  buildActivateInput,
  extractErrors,
  areAllMediaReady,
  mapVariantsToMedia,
  getShopifyQuantity,
  type ShopifyStore,
  type ProductCreateResponse,
  type MediaCreateResponse,
  type MediaQueryResponse,
  type VariantsBulkCreateResponse,
  type VariantsBulkUpdateResponse,
  type InventoryItemResponse,
  type InventorySetResponse,
  type ProductUpdateResponse
} from './shopify-graphql'

// ============================================
// TYPES
// ============================================

export interface SupabaseProduct {
  id: string
  title: string
  description?: string | null
  vendor?: string | null
  category?: string | null
  tags?: string[] | null
  image_url?: string | null
  images?: string[] | null
  sku?: string | null
  options?: { name: string; values: string[] }[] | null
  variants?: {
    id?: number
    option1?: string | null
    option2?: string | null
    option3?: string | null
    price: string
    compare_at_price?: string | null
    sku?: string
    inventory_quantity?: number
    stock_quantity?: number | null
    stock_status?: string
    image_url?: string
    image?: { src: string } | null
  }[] | null
}

export interface PushOptions {
  onProgress?: (step: number, message: string, detail?: string) => void
  defaultInventory?: number
  activateOnComplete?: boolean
}

export interface PushResult {
  success: boolean
  shopifyProductId?: string
  shopifyHandle?: string
  variantIds?: string[]
  errors?: string[]
  steps: StepResult[]
}

interface StepResult {
  step: number
  name: string
  success: boolean
  duration: number
  error?: string
}

interface VariantInfo {
  id: string
  title: string
  inventoryItemId: string
  option1?: string
}

// ============================================
// GRAPHQL EXECUTOR
// ============================================

/**
 * Execute GraphQL via server proxy
 * In production, this calls your API route which uses the MCP tool
 */
async function executeGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
  store: ShopifyStore
): Promise<T> {
  const response = await fetch('/api/shopify/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shop: store.store_url,
      accessToken: store.api_credentials.access_token,
      query,
      variables
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`GraphQL request failed: ${error}`)
  }

  const result = await response.json()

  if (result.errors) {
    throw new Error(result.errors.map((e: { message: string }) => e.message).join(', '))
  }

  return result.data as T
}

// ============================================
// STEP IMPLEMENTATIONS
// ============================================

/**
 * Step 1: Create product with options
 */
async function step1CreateProduct(
  product: SupabaseProduct,
  store: ShopifyStore
): Promise<{ productId: string; handle: string; firstVariant: VariantInfo }> {
  const input = buildCreateProductInput({
    title: product.title,
    description: product.description || undefined,
    vendor: product.vendor || undefined,
    category: product.category || undefined,
    tags: product.tags || undefined,
    options: product.options || undefined
  })

  const response = await executeGraphQL<ProductCreateResponse>(
    MUTATIONS.createProduct,
    { input },
    store
  )

  const errors = extractErrors(response.productCreate)
  if (errors.length > 0) {
    throw new Error(`Product creation failed: ${errors.join(', ')}`)
  }

  const created = response.productCreate.product
  const firstVariantEdge = created.variants.edges[0]

  if (!firstVariantEdge) {
    throw new Error('No variant created with product')
  }

  return {
    productId: created.id,
    handle: created.handle,
    firstVariant: {
      id: firstVariantEdge.node.id,
      title: firstVariantEdge.node.title,
      inventoryItemId: firstVariantEdge.node.inventoryItem.id,
      option1: firstVariantEdge.node.selectedOptions[0]?.value
    }
  }
}

/**
 * Step 2: Upload all product images
 */
async function step2UploadImages(
  productId: string,
  product: SupabaseProduct,
  store: ShopifyStore
): Promise<{ mediaIds: Map<string, string>; allMedia: { id: string; alt: string }[] }> {
  // Collect all unique images
  const images: { src: string; alt: string }[] = []
  const seenUrls = new Set<string>()

  // Main product image
  if (product.image_url && !seenUrls.has(product.image_url)) {
    images.push({ src: product.image_url, alt: product.title })
    seenUrls.add(product.image_url)
  }

  // Additional product images
  if (product.images) {
    for (const src of product.images) {
      if (src && !seenUrls.has(src)) {
        images.push({ src, alt: product.title })
        seenUrls.add(src)
      }
    }
  }

  // Variant images with option-based alt text
  if (product.variants) {
    for (const v of product.variants) {
      const imgSrc = v.image_url || v.image?.src
      if (imgSrc && !seenUrls.has(imgSrc)) {
        images.push({
          src: imgSrc,
          alt: `${product.title} - ${v.option1 || 'Variant'}`
        })
        seenUrls.add(imgSrc)
      }
    }
  }

  if (images.length === 0) {
    return { mediaIds: new Map(), allMedia: [] }
  }

  // Upload images
  const mediaInput = buildMediaInput(images)
  const response = await executeGraphQL<MediaCreateResponse>(
    MUTATIONS.createMedia,
    { productId, media: mediaInput },
    store
  )

  if (response.productCreateMedia.mediaUserErrors.length > 0) {
    console.warn('Media upload warnings:', response.productCreateMedia.mediaUserErrors)
  }

  // Poll for READY status (images upload async)
  const allMedia = await pollForMediaReady(productId, store, images.length)

  // Build alt text → mediaId mapping for variant assignment
  const mediaIds = new Map<string, string>()
  for (const m of allMedia) {
    if (m.alt) {
      mediaIds.set(m.alt.toLowerCase(), m.id)
    }
  }

  return { mediaIds, allMedia }
}

/**
 * Poll for media to reach READY status
 */
async function pollForMediaReady(
  productId: string,
  store: ShopifyStore,
  expectedCount: number,
  maxAttempts: number = 10,
  delayMs: number = 1000
): Promise<{ id: string; alt: string; status: string }[]> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await executeGraphQL<MediaQueryResponse>(
      MUTATIONS.getProductMedia,
      { id: productId },
      store
    )

    const media = response.product.media.edges.map(e => ({
      id: e.node.id,
      alt: e.node.alt || '',
      status: e.node.status
    }))

    const { ready } = areAllMediaReady(media.map(m => ({ status: m.status as 'READY' | 'UPLOADED' | 'FAILED' })))

    if (ready || media.length >= expectedCount) {
      // Filter to only READY images
      return media.filter(m => m.status === 'READY')
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  // Return whatever we have after max attempts
  const response = await executeGraphQL<MediaQueryResponse>(
    MUTATIONS.getProductMedia,
    { id: productId },
    store
  )

  return response.product.media.edges
    .filter(e => e.node.status === 'READY')
    .map(e => ({
      id: e.node.id,
      alt: e.node.alt || '',
      status: e.node.status
    }))
}

/**
 * Step 3: Create additional variants (first already exists from Step 1)
 */
async function step3CreateVariants(
  productId: string,
  product: SupabaseProduct,
  firstVariant: VariantInfo,
  store: ShopifyStore
): Promise<VariantInfo[]> {
  // All variants including first one
  const allVariants: VariantInfo[] = [firstVariant]

  if (!product.variants || product.variants.length <= 1) {
    return allVariants
  }

  const options = product.options || []

  // Build variants to create (skip first - already exists)
  const variantsToCreate = buildCreateVariantsInput(product.variants, options, true)

  if (variantsToCreate.length === 0) {
    return allVariants
  }

  const response = await executeGraphQL<VariantsBulkCreateResponse>(
    MUTATIONS.bulkCreateVariants,
    { productId, variants: variantsToCreate },
    store
  )

  const errors = extractErrors(response.productVariantsBulkCreate)
  if (errors.length > 0) {
    throw new Error(`Variant creation failed: ${errors.join(', ')}`)
  }

  // Add created variants to list
  for (const v of response.productVariantsBulkCreate.productVariants) {
    allVariants.push({
      id: v.id,
      title: v.title,
      inventoryItemId: v.inventoryItem.id,
      option1: v.selectedOptions[0]?.value
    })
  }

  return allVariants
}

/**
 * Step 4: Update variant prices and assign images
 */
async function step4UpdateVariants(
  productId: string,
  variants: VariantInfo[],
  product: SupabaseProduct,
  allMedia: { id: string; alt: string }[],
  store: ShopifyStore
): Promise<void> {
  if (variants.length === 0) return

  // Map variants to their media by matching option values
  const variantToMedia = mapVariantsToMedia(
    variants.map(v => ({ id: v.id, option1: v.option1 })),
    allMedia
  )

  // Build update input
  const updates = variants.map((v, index) => {
    const sourceVariant = product.variants?.[index]
    return {
      id: v.id,
      price: sourceVariant?.price,
      sku: sourceVariant?.sku,
      mediaId: variantToMedia.get(v.id)
    }
  })

  const variantsInput = buildUpdateVariantsInput(updates)

  const response = await executeGraphQL<VariantsBulkUpdateResponse>(
    MUTATIONS.bulkUpdateVariants,
    { productId, variants: variantsInput },
    store
  )

  const errors = extractErrors(response.productVariantsBulkUpdate)
  if (errors.length > 0) {
    console.warn('Variant update warnings:', errors)
  }
}

/**
 * Step 5: Set inventory quantities
 */
async function step5SetInventory(
  variants: VariantInfo[],
  product: SupabaseProduct,
  store: ShopifyStore,
  defaultInventory: number
): Promise<void> {
  if (variants.length === 0) return

  // Get location ID from first variant's inventory item
  const firstInventoryItemId = variants[0].inventoryItemId

  const inventoryResponse = await executeGraphQL<InventoryItemResponse>(
    MUTATIONS.getInventoryItem,
    { id: firstInventoryItemId },
    store
  )

  const locationId = inventoryResponse.inventoryItem.inventoryLevels.edges[0]?.node.location.id

  if (!locationId) {
    throw new Error('Could not determine store location for inventory')
  }

  // Build quantities for all variants
  const quantities = variants.map((v, index) => {
    const sourceVariant = product.variants?.[index]
    return {
      inventoryItemId: v.inventoryItemId,
      quantity: sourceVariant
        ? getShopifyQuantity(sourceVariant)
        : defaultInventory
    }
  })

  const inventoryInput = buildInventoryInput(quantities, locationId)

  const response = await executeGraphQL<InventorySetResponse>(
    MUTATIONS.setInventoryQuantities,
    { input: inventoryInput },
    store
  )

  const errors = extractErrors(response.inventorySetQuantities)
  if (errors.length > 0) {
    throw new Error(`Inventory update failed: ${errors.join(', ')}`)
  }
}

/**
 * Step 6: Update SEO and full description
 */
async function step6UpdateSeo(
  productId: string,
  product: SupabaseProduct,
  store: ShopifyStore
): Promise<void> {
  const input = buildSeoUpdateInput(productId, {
    description: product.description || '',
    title: product.title,
    vendor: product.vendor || undefined
  })

  const response = await executeGraphQL<ProductUpdateResponse>(
    MUTATIONS.updateProduct,
    { input },
    store
  )

  const errors = extractErrors(response.productUpdate)
  if (errors.length > 0) {
    console.warn('SEO update warnings:', errors)
  }
}

/**
 * Step 7: Activate product
 */
async function step7Activate(
  productId: string,
  store: ShopifyStore
): Promise<void> {
  const input = buildActivateInput(productId)

  const response = await executeGraphQL<ProductUpdateResponse>(
    MUTATIONS.updateProduct,
    { input },
    store
  )

  const errors = extractErrors(response.productUpdate)
  if (errors.length > 0) {
    throw new Error(`Product activation failed: ${errors.join(', ')}`)
  }
}

// ============================================
// MAIN ORCHESTRATOR
// ============================================

/**
 * Push a product to Shopify using the 7-step A-grade sync process
 */
export async function pushProductToShopify(
  product: SupabaseProduct,
  store: ShopifyStore,
  options: PushOptions = {}
): Promise<PushResult> {
  const {
    onProgress = () => {},
    defaultInventory = 10,
    activateOnComplete = true
  } = options

  const steps: StepResult[] = []
  let productId: string | undefined
  let handle: string | undefined
  let variantIds: string[] = []

  const runStep = async <T>(
    stepNum: number,
    name: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    const start = Date.now()
    onProgress(stepNum, name)

    try {
      const result = await fn()
      steps.push({
        step: stepNum,
        name,
        success: true,
        duration: Date.now() - start
      })
      return result
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      steps.push({
        step: stepNum,
        name,
        success: false,
        duration: Date.now() - start,
        error: errorMsg
      })
      throw error
    }
  }

  try {
    // Step 1: Create product with options
    const step1Result = await runStep(1, 'Creating product with options', () =>
      step1CreateProduct(product, store)
    )
    productId = step1Result.productId
    handle = step1Result.handle
    onProgress(1, 'Product created', `ID: ${productId}`)

    // Step 2: Upload images
    const step2Result = await runStep(2, 'Uploading images', () =>
      step2UploadImages(productId!, product, store)
    )
    onProgress(2, 'Images uploaded', `${step2Result.allMedia.length} images`)

    // Step 3: Create additional variants
    const allVariants = await runStep(3, 'Creating variants', () =>
      step3CreateVariants(productId!, product, step1Result.firstVariant, store)
    )
    variantIds = allVariants.map(v => v.id)
    onProgress(3, 'Variants created', `${allVariants.length} variants`)

    // Step 4: Update variant prices and assign images
    await runStep(4, 'Updating variant prices and images', () =>
      step4UpdateVariants(productId!, allVariants, product, step2Result.allMedia, store)
    )
    onProgress(4, 'Variants updated')

    // Step 5: Set inventory
    await runStep(5, 'Setting inventory quantities', () =>
      step5SetInventory(allVariants, product, store, defaultInventory)
    )
    onProgress(5, 'Inventory set')

    // Step 6: Update SEO and description
    await runStep(6, 'Updating SEO and description', () =>
      step6UpdateSeo(productId!, product, store)
    )
    onProgress(6, 'SEO updated')

    // Step 7: Activate product (optional)
    if (activateOnComplete) {
      await runStep(7, 'Activating product', () =>
        step7Activate(productId!, store)
      )
      onProgress(7, 'Product activated')
    } else {
      steps.push({
        step: 7,
        name: 'Activation skipped',
        success: true,
        duration: 0
      })
    }

    return {
      success: true,
      shopifyProductId: productId,
      shopifyHandle: handle,
      variantIds,
      steps
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      shopifyProductId: productId,
      shopifyHandle: handle,
      variantIds,
      errors: [errorMsg],
      steps
    }
  }
}

/**
 * Push multiple products to Shopify with progress tracking
 */
export async function pushBatchToShopify(
  products: SupabaseProduct[],
  store: ShopifyStore,
  options: {
    onProductProgress?: (index: number, total: number, product: SupabaseProduct, result: PushResult) => void
    continueOnError?: boolean
  } & PushOptions = {}
): Promise<{
  total: number
  succeeded: number
  failed: number
  results: { product: SupabaseProduct; result: PushResult }[]
}> {
  const { onProductProgress, continueOnError = true, ...pushOptions } = options
  const results: { product: SupabaseProduct; result: PushResult }[] = []

  for (let i = 0; i < products.length; i++) {
    const product = products[i]

    try {
      const result = await pushProductToShopify(product, store, pushOptions)
      results.push({ product, result })

      onProductProgress?.(i + 1, products.length, product, result)

      if (!result.success && !continueOnError) {
        break
      }
    } catch (error) {
      const errorResult: PushResult = {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
        steps: []
      }
      results.push({ product, result: errorResult })

      onProductProgress?.(i + 1, products.length, product, errorResult)

      if (!continueOnError) {
        break
      }
    }
  }

  return {
    total: products.length,
    succeeded: results.filter(r => r.result.success).length,
    failed: results.filter(r => !r.result.success).length,
    results
  }
}

/**
 * Update Supabase product with Shopify IDs after successful push
 */
export function buildSupabaseUpdate(result: PushResult): {
  platform_ids: Record<string, string>
  sync_status: string
  last_synced_at: string
} | null {
  if (!result.success || !result.shopifyProductId) {
    return null
  }

  return {
    platform_ids: { shopify: result.shopifyProductId },
    sync_status: 'synced',
    last_synced_at: new Date().toISOString()
  }
}
