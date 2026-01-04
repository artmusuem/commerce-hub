/**
 * Shopify GraphQL Mutations for 7-Step Product Sync
 *
 * Based on: docs/WOOCOMMERCE-SHOPIFY-SYNC-GUIDE.md
 *
 * Usage with MCP:
 *   import { MUTATIONS, buildProductInput } from './shopify-graphql'
 *   await mcp__shopify__executeGraphQL({ query: MUTATIONS.createProduct, variables: {...} })
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ShopifyStore {
  id: string
  store_url: string
  api_credentials: {
    access_token: string
  }
}

export interface ProductOptionInput {
  name: string
  values: { name: string }[]
}

export interface CreateProductInput {
  title: string
  descriptionHtml?: string
  vendor?: string
  productType?: string
  tags?: string[]
  status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
  productOptions?: ProductOptionInput[]
  seo?: {
    title?: string
    description?: string
  }
}

export interface CreateMediaInput {
  originalSource: string
  alt?: string
  mediaContentType: 'IMAGE'
}

export interface VariantOptionValue {
  optionName: string
  name: string
}

export interface CreateVariantInput {
  optionValues: VariantOptionValue[]
  price: string
  compareAtPrice?: string
}

export interface UpdateVariantInput {
  id: string
  price?: string
  compareAtPrice?: string
  mediaId?: string
}

export interface InventoryQuantityInput {
  inventoryItemId: string
  locationId: string
  quantity: number
}

export interface SetInventoryInput {
  reason: string
  name: string
  ignoreCompareQuantity: boolean
  quantities: InventoryQuantityInput[]
}

// Response types
export interface ProductCreateResponse {
  productCreate: {
    product: {
      id: string
      title: string
      handle: string
      options: { id: string; name: string; values: string[] }[]
      variants: {
        edges: {
          node: {
            id: string
            title: string
            price: string
            selectedOptions: { name: string; value: string }[]
            inventoryItem: { id: string }
          }
        }[]
      }
    }
    userErrors: { field: string[]; message: string }[]
  }
}

export interface MediaCreateResponse {
  productCreateMedia: {
    media: {
      id: string
      status: 'UPLOADED' | 'READY' | 'FAILED'
      alt: string
      image?: { url: string }
    }[]
    mediaUserErrors: { field: string[]; message: string }[]
  }
}

export interface MediaQueryResponse {
  product: {
    media: {
      edges: {
        node: {
          id: string
          status: 'UPLOADED' | 'READY' | 'FAILED'
          alt: string
          image?: { id: string; url: string }
        }
      }[]
    }
  }
}

export interface VariantsBulkCreateResponse {
  productVariantsBulkCreate: {
    productVariants: {
      id: string
      title: string
      price: string
      selectedOptions: { name: string; value: string }[]
      inventoryItem: { id: string }
    }[]
    userErrors: { field: string[]; message: string }[]
  }
}

export interface VariantsBulkUpdateResponse {
  productVariantsBulkUpdate: {
    productVariants: {
      id: string
      title: string
      price: string
      media: {
        edges: {
          node: { id: string; alt: string }
        }[]
      }
    }[]
    userErrors: { field: string[]; message: string }[]
  }
}

export interface InventoryItemResponse {
  inventoryItem: {
    id: string
    inventoryLevels: {
      edges: {
        node: {
          id: string
          location: { id: string }
          quantities: { name: string; quantity: number }[]
        }
      }[]
    }
  }
}

export interface InventorySetResponse {
  inventorySetQuantities: {
    inventoryAdjustmentGroup: {
      createdAt: string
      reason: string
    }
    userErrors: { field: string[]; message: string }[]
  }
}

export interface ProductUpdateResponse {
  productUpdate: {
    product: {
      id: string
      title: string
      status: string
      descriptionHtml: string
      seo: { title: string; description: string }
    }
    userErrors: { field: string[]; message: string }[]
  }
}

// ============================================
// GRAPHQL MUTATIONS
// ============================================

export const MUTATIONS = {
  /**
   * Step 1: Create product with options
   * Creates the product shell with option definitions (e.g., Color: Black, Brown, Red)
   * Only the FIRST option value creates a variant automatically
   */
  createProduct: `
    mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          title
          handle
          options {
            id
            name
            values
          }
          variants(first: 10) {
            edges {
              node {
                id
                title
                price
                selectedOptions {
                  name
                  value
                }
                inventoryItem {
                  id
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `,

  /**
   * Step 2: Upload product images
   * Images upload asynchronously - must poll for READY status
   */
  createMedia: `
    mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          ... on MediaImage {
            id
            status
            alt
            image {
              url
            }
          }
        }
        mediaUserErrors {
          field
          message
        }
      }
    }
  `,

  /**
   * Step 2b: Query media status (poll until all READY)
   */
  getProductMedia: `
    query getProductMedia($id: ID!) {
      product(id: $id) {
        media(first: 20) {
          edges {
            node {
              ... on MediaImage {
                id
                status
                alt
                image {
                  id
                  url
                }
              }
            }
          }
        }
      }
    }
  `,

  /**
   * Step 3: Create additional variants
   * The first variant exists from Step 1, create the rest here
   */
  bulkCreateVariants: `
    mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) {
        productVariants {
          id
          title
          price
          selectedOptions {
            name
            value
          }
          inventoryItem {
            id
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `,

  /**
   * Step 4: Update variant prices and assign images
   * Also used to fix the first variant's price (defaults to $0)
   */
  bulkUpdateVariants: `
    mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants {
          id
          title
          price
          media(first: 1) {
            edges {
              node {
                ... on MediaImage {
                  id
                  alt
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `,

  /**
   * Step 5a: Get location ID from inventory item
   * Don't query location.name - requires extra permissions
   */
  getInventoryItem: `
    query getInventoryItem($id: ID!) {
      inventoryItem(id: $id) {
        id
        inventoryLevels(first: 5) {
          edges {
            node {
              id
              location {
                id
              }
              quantities(names: ["available"]) {
                name
                quantity
              }
            }
          }
        }
      }
    }
  `,

  /**
   * Step 5b: Set inventory quantities
   * CRITICAL: ignoreCompareQuantity: true is required
   */
  setInventoryQuantities: `
    mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup {
          createdAt
          reason
        }
        userErrors {
          field
          message
        }
      }
    }
  `,

  /**
   * Step 6 & 7: Update product (description, SEO, status)
   */
  updateProduct: `
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
          status
          descriptionHtml
          seo {
            title
            description
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `,

  /**
   * Query full product for verification
   */
  getProduct: `
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        handle
        status
        descriptionHtml
        vendor
        productType
        tags
        seo {
          title
          description
        }
        options {
          id
          name
          values
        }
        variants(first: 50) {
          edges {
            node {
              id
              title
              price
              compareAtPrice
              sku
              selectedOptions {
                name
                value
              }
              inventoryItem {
                id
              }
              media(first: 1) {
                edges {
                  node {
                    ... on MediaImage {
                      id
                      alt
                    }
                  }
                }
              }
            }
          }
        }
        media(first: 20) {
          edges {
            node {
              ... on MediaImage {
                id
                status
                alt
                image {
                  url
                }
              }
            }
          }
        }
      }
    }
  `,

  /**
   * Get store locations (for inventory)
   */
  getLocations: `
    query getLocations {
      locations(first: 10) {
        edges {
          node {
            id
            name
            isActive
          }
        }
      }
    }
  `
} as const

// ============================================
// INPUT BUILDERS
// ============================================

/**
 * Build ProductInput for Step 1: Create product with options
 */
export function buildCreateProductInput(data: {
  title: string
  description?: string
  vendor?: string
  category?: string
  tags?: string[]
  options?: { name: string; values: string[] }[]
}): CreateProductInput {
  const input: CreateProductInput = {
    title: data.title,
    descriptionHtml: data.description ? `<p>${data.description.slice(0, 200)}...</p>` : '<p></p>',
    vendor: data.vendor || 'Commerce Hub',
    productType: data.category || 'General',
    tags: data.tags || [],
    status: 'DRAFT' // Always start as draft per guide
  }

  // Build productOptions if we have options
  if (data.options && data.options.length > 0) {
    input.productOptions = data.options.map(opt => ({
      name: opt.name,
      values: opt.values.map(v => ({ name: v }))
    }))
  }

  return input
}

/**
 * Build media input for Step 2: Upload images
 */
export function buildMediaInput(images: { src: string; alt?: string }[]): CreateMediaInput[] {
  return images.map(img => ({
    originalSource: img.src,
    alt: img.alt || '',
    mediaContentType: 'IMAGE' as const
  }))
}

/**
 * Build variant input for Step 3: Create additional variants
 * Skip the variant that Shopify auto-created (first value of each option)
 */
export function buildCreateVariantsInput(
  variants: {
    option1?: string | null
    option2?: string | null
    option3?: string | null
    price: string
    sku?: string
    compare_at_price?: string | null
  }[],
  options: { name: string; values: string[] }[],
  skipFirst: boolean = true
): CreateVariantInput[] {
  // Shopify auto-creates a variant with the FIRST value of each option
  // e.g., if options are Color: [Blue, Green] and Size: [M, L]
  // Shopify creates "Blue / M" automatically
  const firstOptionValues = {
    option1: options[0]?.values[0] || null,
    option2: options[1]?.values[0] || null,
    option3: options[2]?.values[0] || null
  }

  // Filter out the variant that matches what Shopify auto-created
  const toCreate = skipFirst
    ? variants.filter(v => {
        const matches1 = !firstOptionValues.option1 || v.option1 === firstOptionValues.option1
        const matches2 = !firstOptionValues.option2 || v.option2 === firstOptionValues.option2
        const matches3 = !firstOptionValues.option3 || v.option3 === firstOptionValues.option3
        // Skip if ALL options match (this is the auto-created variant)
        return !(matches1 && matches2 && matches3)
      })
    : variants

  return toCreate.map(v => {
    const optionValues: VariantOptionValue[] = []

    if (v.option1 && options[0]) {
      optionValues.push({ optionName: options[0].name, name: v.option1 })
    }
    if (v.option2 && options[1]) {
      optionValues.push({ optionName: options[1].name, name: v.option2 })
    }
    if (v.option3 && options[2]) {
      optionValues.push({ optionName: options[2].name, name: v.option3 })
    }

    return {
      optionValues,
      price: v.price,
      compareAtPrice: v.compare_at_price || undefined
    }
  })
}

/**
 * Build variant update input for Step 4: Update prices and assign images
 */
export function buildUpdateVariantsInput(
  variants: {
    id: string
    price?: string
    mediaId?: string
  }[]
): UpdateVariantInput[] {
  return variants.map(v => ({
    id: v.id,
    price: v.price,
    mediaId: v.mediaId
  }))
}

/**
 * Build inventory input for Step 5: Set quantities
 */
export function buildInventoryInput(
  quantities: { inventoryItemId: string; quantity: number }[],
  locationId: string
): SetInventoryInput {
  return {
    reason: 'correction',
    name: 'available',
    ignoreCompareQuantity: true, // CRITICAL - required by Shopify
    quantities: quantities.map(q => ({
      inventoryItemId: q.inventoryItemId,
      locationId,
      quantity: q.quantity
    }))
  }
}

/**
 * Build SEO update input for Step 6
 */
export function buildSeoUpdateInput(
  productId: string,
  data: {
    description: string
    title: string
    vendor?: string
  }
): { id: string; descriptionHtml: string; seo: { title: string; description: string } } {
  // Strip HTML for SEO description, limit to 155 chars
  const plainText = data.description.replace(/<[^>]*>/g, '').trim()
  const seoDescription = plainText.slice(0, 155)

  return {
    id: productId,
    descriptionHtml: data.description,
    seo: {
      title: data.vendor ? `${data.title} - ${data.vendor}` : data.title,
      description: seoDescription
    }
  }
}

/**
 * Build activation input for Step 7
 */
export function buildActivateInput(productId: string): { id: string; status: 'ACTIVE' } {
  return {
    id: productId,
    status: 'ACTIVE'
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if all media items are ready
 */
export function areAllMediaReady(
  media: { status: 'UPLOADED' | 'READY' | 'FAILED' }[]
): { ready: boolean; failed: string[] } {
  const failed = media.filter(m => m.status === 'FAILED')
  const pending = media.filter(m => m.status === 'UPLOADED')

  return {
    ready: pending.length === 0 && failed.length === 0,
    failed: failed.map((_, i) => `Image ${i + 1}`)
  }
}

/**
 * Extract user errors from any Shopify response
 */
export function extractErrors(
  response: { userErrors?: { field: string[]; message: string }[] }
): string[] {
  if (!response.userErrors || response.userErrors.length === 0) {
    return []
  }
  return response.userErrors.map(e => `${e.field.join('.')}: ${e.message}`)
}

/**
 * Map variant option values to uploaded media
 * Uses alt text matching (e.g., "Product - Black" matches option1: "Black")
 */
export function mapVariantsToMedia(
  variants: { id: string; option1?: string | null }[],
  media: { id: string; alt: string }[]
): Map<string, string> {
  const mapping = new Map<string, string>()

  for (const variant of variants) {
    if (!variant.option1) continue

    // Find media where alt contains the option value
    const match = media.find(m =>
      m.alt.toLowerCase().includes(variant.option1!.toLowerCase())
    )

    if (match) {
      mapping.set(variant.id, match.id)
    }
  }

  return mapping
}

/**
 * Calculate inventory quantity from WooCommerce stock data
 */
export function getShopifyQuantity(wcVariant: {
  stock_status?: string
  stock_quantity?: number | null
  inventory_quantity?: number
}): number {
  // If explicitly out of stock
  if (wcVariant.stock_status === 'outofstock') {
    return 0
  }

  // Use actual quantity if available
  if (wcVariant.stock_quantity !== null && wcVariant.stock_quantity !== undefined) {
    return wcVariant.stock_quantity
  }
  if (wcVariant.inventory_quantity !== undefined) {
    return wcVariant.inventory_quantity
  }

  // Default for "instock" without managed quantity
  return 10
}

/**
 * Convert Supabase product format to Shopify GraphQL format
 */
export function transformSupabaseToShopify(product: {
  title: string
  description?: string | null
  vendor?: string | null
  category?: string | null
  tags?: string[] | null
  options?: { name: string; values: string[] }[] | null
  variants?: {
    option1?: string | null
    option2?: string | null
    option3?: string | null
    price: string
    sku?: string
    compare_at_price?: string | null
    inventory_quantity?: number
    image_url?: string
  }[] | null
  image_url?: string | null
  images?: string[] | null
}): {
  productInput: CreateProductInput
  variantsToCreate: CreateVariantInput[]
  mediaToUpload: CreateMediaInput[]
} {
  // Build product options from variant data if not explicit
  let options = product.options || []
  if (options.length === 0 && product.variants && product.variants.length > 1) {
    // Infer options from variants
    const option1Values = [...new Set(product.variants.map(v => v.option1).filter(Boolean))]
    if (option1Values.length > 0) {
      options = [{ name: 'Option', values: option1Values as string[] }]
    }
  }

  // Build product input
  const productInput = buildCreateProductInput({
    title: product.title,
    description: product.description || undefined,
    vendor: product.vendor || undefined,
    category: product.category || undefined,
    tags: product.tags || undefined,
    options
  })

  // Build variants to create (skip first - created with product)
  const variantsToCreate = product.variants && product.variants.length > 1
    ? buildCreateVariantsInput(product.variants, options, true)
    : []

  // Collect all images
  const allImages: { src: string; alt?: string }[] = []

  // Main product image
  if (product.image_url) {
    allImages.push({ src: product.image_url, alt: product.title })
  }

  // Additional product images
  if (product.images) {
    product.images.forEach((src, i) => {
      if (src !== product.image_url) {
        allImages.push({ src, alt: `${product.title} - ${i + 1}` })
      }
    })
  }

  // Variant-specific images
  if (product.variants) {
    product.variants.forEach(v => {
      if (v.image_url && !allImages.some(img => img.src === v.image_url)) {
        allImages.push({
          src: v.image_url,
          alt: `${product.title} - ${v.option1 || 'Variant'}`
        })
      }
    })
  }

  const mediaToUpload = buildMediaInput(allImages)

  return { productInput, variantsToCreate, mediaToUpload }
}
