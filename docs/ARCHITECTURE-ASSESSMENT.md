# Commerce Hub Architecture Assessment

Analysis of current WooCommerce → Shopify sync architecture with practical refactor plan.

---

## 1. Multi-Channel Platform Data Model

### How Sellbrite/ChannelAdvisor Structure Data

Professional multi-channel platforms use a **Master Product → Channel Listing** architecture:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MASTER PRODUCT                                    │
│  (Canonical source of truth - lives in your database)                       │
│                                                                             │
│  • id: UUID                                                                 │
│  • title, description, price, variants, images                              │
│  • status: active/draft/archived                                            │
│  • source_platform: where it was first imported from                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
           ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
           │  LISTING:    │ │  LISTING:    │ │  LISTING:    │
           │  WooCommerce │ │  Shopify     │ │  Etsy        │
           │              │ │              │ │              │
           │ external_id  │ │ external_id  │ │ external_id  │
           │ sync_status  │ │ sync_status  │ │ sync_status  │
           │ platform_meta│ │ platform_meta│ │ platform_meta│
           └──────────────┘ └──────────────┘ └──────────────┘
```

**Key Insight**: The master product is platform-agnostic. Each platform gets a "listing" that tracks:
- `external_id` - The product ID on that platform
- `sync_status` - synced/pending/error
- `platform_meta` - Platform-specific data that doesn't map universally

---

## 2. Current Commerce Hub Architecture

### What We Have

**Supabase `products` table:**
```sql
-- Core fields
id, title, description, price, image_url, sku, status
-- Variation support (JSONB)
variants, options
-- Platform tracking
store_id, external_id, platform_ids (JSONB)
-- Sync tracking
sync_status, last_synced_at, remote_updated_at
-- Additional
vendor, tags, attributes, product_type
```

**Current Import Flow (WooCommerce):** `WooCommerceConnect.tsx:145-208`
```
1. Fetch WooCommerce products (paginated)
2. For variable products: fetch /products/{id}/variations
3. Transform to UnifiedVariant format (option1/2/3 mapping)
4. Store in Supabase with variants JSONB
```

**Current Import Flow (Shopify):** `ShopifyImport.tsx:86-241`
```
1. Fetch via /api/shopify/products proxy
2. Transform variants to JSONB format
3. Store in Supabase
```

**Current Push to Shopify:** `shopify.ts:100-133`
```typescript
// PROBLEM: This is REST API with minimal payload
pushProductToShopify(shopDomain, accessToken, {
  title, body_html, vendor, product_type,
  variants: [{ price, sku }],
  images: [{ src }]
})
```

---

## 3. What's Broken vs. Guide Requirements

### The Sync Guide's 7-Step Process

| Step | Guide Requirement | Current Status | Gap |
|------|-------------------|----------------|-----|
| 1 | Create product with `productOptions` | REST API creates bare product | No options on creation |
| 2 | Upload ALL images via `productCreateMedia` | REST API passes image URLs | Images may fail, no retry |
| 3 | Create variants with `productVariantsBulkCreate` | REST API variant creation | Missing proper option mapping |
| 4 | Update variants with `productVariantsBulkUpdate` | Not implemented | No price/image assignment |
| 5 | Set inventory via `inventorySetQuantities` | Not implemented | Products show "Sold out" |
| 6 | Update SEO and full description | Not implemented | SEO fields empty |
| 7 | Activate product (`status: ACTIVE`) | Not implemented | Products stay in draft |

### Specific Broken Components

**1. `transforms.ts` - `transformToShopify()` (line 134-170)**
```typescript
// PROBLEM: Returns REST API format, not GraphQL
return {
  title, body_html, vendor, product_type,
  tags,  // comma string, not array
  status,
  variants,  // Missing proper optionValues structure
  options,   // Wrong format for GraphQL
  images     // Just URLs, no alt text or position
}
```

**2. `shopify.ts` - `pushProductToShopify()` (line 100-133)**
- Uses REST API (`/admin/api/2024-10/products.json`)
- Single POST request = **NOT the 7-step process**
- No GraphQL mutations
- No image upload handling
- No inventory setup
- No SEO fields

**3. Missing Entirely:**
- `productCreateMedia` mutation for images
- `productVariantsBulkCreate/Update` for variants
- `inventorySetQuantities` for stock
- Image-to-variant mapping
- Retry logic for failed image uploads
- Progress tracking for multi-step sync

### Data That's Lost in Current Flow

| WooCommerce Data | Stored in Supabase? | Pushed to Shopify? |
|------------------|---------------------|-------------------|
| Full HTML description | Yes (description) | Partial (body_html) |
| short_description | No | Not used for SEO |
| Variant images | Yes (in variants JSONB) | No |
| Stock quantities | Yes | No (all 0 = sold out) |
| SKU per variant | Yes | Partially |
| Option names (Color, Size) | Yes (options JSONB) | No (wrong format) |
| Categories | Yes (category) | Partial (product_type only) |

---

## 4. Minimum Refactor Plan

### Philosophy: Surgical Changes, Not Rewrite

We keep the existing import flows (working) and add a proper **Shopify Push Service** that follows the 7-step guide.

### Architecture Target

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SUPABASE PRODUCTS TABLE                               │
│                      (Master Product - already works)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
    ┌───────────────────┐                      ┌───────────────────┐
    │  WooCommerce      │                      │  Shopify          │
    │  Import Service   │                      │  Push Service     │
    │  (EXISTING)       │                      │  (NEW)            │
    │                   │                      │                   │
    │  • testConnection │                      │  • pushProduct()  │
    │  • fetchVariations│                      │    - 7-step flow  │
    │  • importProducts │                      │    - GraphQL      │
    └───────────────────┘                      │    - Retry logic  │
                                               └───────────────────┘
```

---

### Refactor Tasks

#### Task 1: Create `ShopifyPushService` (~300 lines)

New file: `src/lib/shopify-push.ts`

```typescript
// Core orchestrator
export async function pushToShopify(
  product: SupabaseProduct,
  store: ShopifyStore
): Promise<PushResult> {
  // Step 1: Create product with options
  const created = await createProductWithOptions(product, store)

  // Step 2: Upload images
  const mediaIds = await uploadImages(created.id, product.images, store)

  // Step 3: Create additional variants
  const variants = await createVariants(created.id, product.variants, store)

  // Step 4: Update variant prices and images
  await updateVariantsWithMedia(created.id, variants, mediaIds, store)

  // Step 5: Set inventory
  await setInventoryLevels(variants, store)

  // Step 6: Update SEO
  await updateSeoAndDescription(created.id, product, store)

  // Step 7: Activate
  await activateProduct(created.id, store)

  return { success: true, shopifyId: created.id }
}
```

#### Task 2: GraphQL Mutations Module (~150 lines)

New file: `src/lib/shopify-graphql.ts`

```typescript
// Wrapper for MCP tools or direct GraphQL calls
export function executeGraphQL(query: string, variables: object, store: ShopifyStore)

// Pre-built mutations from the guide
export const MUTATIONS = {
  createProduct: `mutation productCreate($input: ProductInput!) {...}`,
  createMedia: `mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {...}`,
  bulkCreateVariants: `mutation productVariantsBulkCreate(...) {...}`,
  bulkUpdateVariants: `mutation productVariantsBulkUpdate(...) {...}`,
  setInventory: `mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {...}`,
  updateProduct: `mutation productUpdate($input: ProductInput!) {...}`
}
```

#### Task 3: Transform Layer Update (~100 lines)

Update `src/lib/transforms.ts`:

```typescript
// NEW: Transform to GraphQL format
export function transformToShopifyGraphQL(product: SupabaseProduct): ShopifyGraphQLInput {
  return {
    title: product.title,
    descriptionHtml: product.description,  // Full HTML
    vendor: product.vendor || 'Commerce Hub',
    productType: product.category,
    tags: product.tags || [],  // Array, not comma string
    status: 'DRAFT',  // Start as draft per guide
    productOptions: buildProductOptions(product.options),
    // seo fields for step 6
    seo: {
      title: `${product.title} - ${product.vendor}`,
      description: stripHtml(product.description).slice(0, 155)
    }
  }
}

function buildProductOptions(options: SupabaseOption[]): ShopifyProductOption[] {
  return options.map(opt => ({
    name: opt.name,
    values: opt.values.map(v => ({ name: v }))
  }))
}
```

#### Task 4: UI for Sync (~50 lines)

Add "Push to Shopify" button to product detail page with:
- Progress indicator (Step 1/7...)
- Error display with retry
- Success confirmation with Shopify link

---

### File Changes Summary

| File | Action | Lines | Purpose |
|------|--------|-------|---------|
| `src/lib/shopify-push.ts` | CREATE | ~300 | 7-step sync orchestrator |
| `src/lib/shopify-graphql.ts` | CREATE | ~150 | GraphQL mutations |
| `src/lib/transforms.ts` | UPDATE | ~100 | Add GraphQL transform |
| `src/pages/products/ProductDetail.tsx` | UPDATE | ~50 | Add push button/UI |
| **Total** | | **~600** | |

---

### MCP Tool Usage

The Shopify MCP server provides `mcp__shopify__executeGraphQL` which can run any mutation:

```typescript
// Example: Using MCP for Step 1
const result = await mcp__shopify__executeGraphQL({
  query: MUTATIONS.createProduct,
  variables: {
    input: transformToShopifyGraphQL(product)
  }
})
```

This means we can use the existing MCP infrastructure instead of raw API calls.

---

## 5. Data Flow After Refactor

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                           WOOCOMMERCE IMPORT                                   │
│                         (Already Working)                                      │
└───────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                        SUPABASE MASTER PRODUCT                                 │
│                                                                                │
│  title: "Anchor Bracelet"                                                      │
│  description: "<h3>Full HTML...</h3>"                                          │
│  variants: [                                                                   │
│    { option1: "Black", price: "150.00", sku: "AB-BLK", image_url: "..." },     │
│    { option1: "Brown", price: "170.00", sku: "AB-BRN", image_url: "..." },     │
│    { option1: "Red",   price: "180.00", sku: "AB-RED", image_url: "..." }      │
│  ]                                                                             │
│  options: [{ name: "Color", values: ["Black", "Brown", "Red"] }]               │
│  platform_ids: { woocommerce: "123", shopify: null }                           │
│  sync_status: "pending"                                                        │
└───────────────────────────────────────────────────────────────────────────────┘
        │
        │  User clicks "Push to Shopify"
        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                        SHOPIFY PUSH SERVICE                                    │
│                                                                                │
│  Step 1: productCreate with productOptions (Color: Black, Brown, Red)          │
│       → Returns productId, first variantId                                     │
│                                                                                │
│  Step 2: productCreateMedia (3 images)                                         │
│       → Wait for READY status, get mediaIds                                    │
│                                                                                │
│  Step 3: productVariantsBulkCreate (Brown, Red variants)                       │
│       → Get all variant IDs + inventory item IDs                               │
│                                                                                │
│  Step 4: productVariantsBulkUpdate                                             │
│       → Set price on Black variant, assign mediaIds                            │
│                                                                                │
│  Step 5: inventorySetQuantities                                                │
│       → Set quantity 10 for all variants                                       │
│                                                                                │
│  Step 6: productUpdate                                                         │
│       → Full descriptionHtml, SEO title/description                            │
│                                                                                │
│  Step 7: productUpdate                                                         │
│       → status: ACTIVE                                                         │
│                                                                                │
└───────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                         SHOPIFY STORE                                          │
│                                                                                │
│  Product: Anchor Bracelet                                                      │
│  Status: Active                                                                │
│  Variants: Black ($150), Brown ($170), Red ($180) - all with images            │
│  Inventory: 10 each                                                            │
│  SEO: Complete                                                                 │
│                                                                                │
│  GRADE: A (100%)                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
        │
        │  Update Supabase
        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│  platform_ids: { woocommerce: "123", shopify: "gid://shopify/Product/456" }    │
│  sync_status: "synced"                                                         │
│  last_synced_at: "2026-01-04T..."                                              │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Future: Reverse Direction & Etsy

### Shopify → WooCommerce

Same pattern:
1. Import via `ShopifyImport.tsx` (already works)
2. Store in Supabase as master
3. Create `WooCommercePushService` following WooCommerce REST patterns:
   - POST /products (create with attributes)
   - POST /products/{id}/variations (create each variation)
   - PUT /products/{id}/variations/{vid} (update prices)

### Etsy

New connector following same pattern:
1. `EtsyConnect.tsx` - OAuth + import
2. `etsy-push.ts` - Push service
3. Add `platform_ids.etsy` tracking

---

## 7. Priority Order

1. **Create `shopify-graphql.ts`** - Mutation templates from guide
2. **Create `shopify-push.ts`** - 7-step orchestrator
3. **Update `transforms.ts`** - Add GraphQL format transformer
4. **Add UI** - Push button with progress indicator
5. **Test with real product** - Import from WooCommerce, push to Shopify, verify A-grade

Estimated effort: 1-2 days for core functionality, +1 day for error handling/retry logic.

---

*Assessment completed 2026-01-04*
