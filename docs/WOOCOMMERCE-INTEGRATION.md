# WooCommerce Integration

> Commerce Hub ↔ WooCommerce REST API v3

**Version:** 1.0  
**Last Updated:** December 2024  
**Status:** Production

---

## Overview

The WooCommerce integration enables bidirectional product synchronization between Commerce Hub and WooCommerce-powered WordPress stores. It supports product import, push (create/update), variation management, and digital downloads.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      COMMERCE HUB                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  WooCommerceConnect.tsx    ProductEdit.tsx    StoresIndex   │
│  (Import products)         (Edit + Push)      (Bulk Push)   │
│         │                        │                  │       │
│         └────────────┬───────────┴──────────────────┘       │
│                      │                                      │
│                      ▼                                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    LIB LAYER                          │  │
│  │  woocommerce.ts              transforms.ts            │  │
│  │  - fetchProducts()           - transformToWooCommerce │  │
│  │  - pushProduct()             - Cloudinary proxy       │  │
│  │  - fetchVariations()         - Digital downloads      │  │
│  │  - updateVariation()                                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                      │                                      │
└──────────────────────┼──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                 VERCEL SERVERLESS API                        │
│  /api/woocommerce/                                          │
│  ├── push.js              POST/PUT to WooCommerce          │
│  ├── variations.js        GET product variations           │
│  └── variation-update.js  PUT variation prices             │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    WOOCOMMERCE                               │
│                 rapidwoo.com/commerce                        │
│                                                             │
│  REST API v3: /wp-json/wc/v3/                               │
│  ├── products           GET, POST, PUT, DELETE             │
│  ├── products/{id}      Single product operations          │
│  ├── products/{id}/variations                              │
│  └── products/categories                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/lib/woocommerce.ts` | API wrapper functions | ~190 |
| `src/lib/transforms.ts` | Format conversion | ~265 |
| `api/woocommerce/push.js` | Serverless push endpoint | ~80 |
| `api/woocommerce/variations.js` | Fetch variations | ~50 |
| `api/woocommerce/variation-update.js` | Update variation prices | ~60 |
| `src/pages/stores/WooCommerceConnect.tsx` | Import UI | ~350 |
| `src/pages/products/ProductEdit.tsx` | Edit + Push UI | ~900 |

---

## Authentication

### WooCommerce API Keys

WooCommerce uses Consumer Key/Secret authentication (Basic Auth):

```typescript
interface WooCommerceCredentials {
  siteUrl: string       // "https://rapidwoo.com/commerce"
  consumerKey: string   // "ck_e230e6dffb..."
  consumerSecret: string // "cs_4bd4aa392d..."
}
```

### Storage in Supabase

```sql
-- stores table
api_credentials: {
  "consumer_key": "ck_xxxxx",
  "consumer_secret": "cs_xxxxx"
}
```

### API Request Authentication

```javascript
// api/woocommerce/push.js
const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

const response = await fetch(endpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${authString}`
  },
  body: JSON.stringify(product)
})
```

---

## Data Flow: Import

### Flow Diagram

```
WooCommerce Store                Commerce Hub
      │                              │
      │  GET /products?per_page=100  │
      │◄─────────────────────────────│
      │                              │
      │  Array of WooCommerce        │
      │  products                    │
      │─────────────────────────────►│
      │                              │
      │                         Transform to
      │                         Commerce Hub
      │                         format
      │                              │
      │                         Insert into
      │                         Supabase with
      │                         external_id
      │                              │
```

### Import Code (WooCommerceConnect.tsx)

```typescript
// Fetch products from WooCommerce
const products = await fetchWooCommerceProducts(credentials)

// Transform and insert each product
for (const p of products) {
  await supabase.from('products').insert({
    title: p.name,
    description: p.description,
    price: parseFloat(p.regular_price) || 0,
    image_url: p.images?.[0]?.src || null,
    sku: p.sku,
    status: p.status === 'publish' ? 'active' : 'draft',
    external_id: String(p.id),  // CRITICAL: Save WooCommerce ID
    store_id: storeId
  })
}
```

---

## Data Flow: Push

### Flow Diagram

```
Commerce Hub                    WooCommerce Store
      │                              │
      │  Transform product to        │
      │  WooCommerce format          │
      │                              │
      │  Check external_id           │
      │  └─ If exists: PUT /products/{id}
      │  └─ If new: POST /products   │
      │─────────────────────────────►│
      │                              │
      │  Return created/updated      │
      │  product with ID             │
      │◄─────────────────────────────│
      │                              │
      │  Save external_id            │
      │  if new product              │
      │                              │
```

### Push Code (ProductEdit.tsx)

```typescript
// Transform Commerce Hub product to WooCommerce format
const wooProduct = transformToWooCommerce(product)

// Check if this product originated from WooCommerce
const wooExternalId = productPlatform === 'woocommerce' && externalId 
  ? parseInt(externalId) 
  : undefined

// Push to WooCommerce
const result = await pushProductToWooCommerce(
  credentials,
  wooProduct,
  wooExternalId  // If set, does PUT; otherwise POST
)

// Save external_id for new products
if (!wooExternalId) {
  await supabase.from('products').update({ 
    external_id: String(result.id) 
  }).eq('id', productId)
}
```

---

## Transform: Commerce Hub → WooCommerce

### Field Mapping

| Commerce Hub | WooCommerce | Notes |
|--------------|-------------|-------|
| `title` | `name` | Required |
| `description` | `description` | HTML allowed |
| `price` | `regular_price` | String format "45.00" |
| `artist` | `short_description` | "By {artist}" |
| `sku` | `sku` | Auto-generate if missing |
| `status` | `status` | active→publish, draft→draft |
| `image_url` | `images[0].src` | URL to image |
| `category` | `categories[{id}]` | Requires category mapping |

### Transform Function

```typescript
// src/lib/transforms.ts
export function transformToWooCommerce(
  product: CommerceHubProduct,
  categoryMap?: WooCategoryMap
): WooCommercePushPayload {
  
  const statusMap = {
    active: 'publish',
    draft: 'draft',
    archived: 'private'
  }

  const payload: WooCommercePushPayload = {
    name: product.title,
    status: statusMap[product.status] || 'draft',
    regular_price: product.price.toFixed(2),
    description: product.description || '',
    short_description: product.artist 
      ? `By ${product.artist}` 
      : undefined,
    sku: product.sku || `CH-${product.id.slice(0, 8)}`,
  }

  // Image handling with Cloudinary proxy
  if (product.image_url) {
    // ... image logic
  }

  // Digital download handling
  if (product.is_digital && product.digital_file_url) {
    payload.type = 'simple'
    payload.downloadable = true
    payload.virtual = true
    payload.downloads = [{
      name: product.digital_file_name || 'Download',
      file: product.digital_file_url
    }]
  }

  return payload
}
```

---

## Image URL Handling

### The Problem

WooCommerce validates image URLs strictly:
- Requires file extension (.jpg, .png, .gif, .webp)
- Checks Content-Type header
- Rejects query-string URLs without extensions

**Smithsonian URLs fail:**
```
https://ids.si.edu/ids/deliveryService?id=SAAM-2019.6.7_1
```

### The Solution: Cloudinary Fetch Proxy

```typescript
// src/lib/transforms.ts
if (!hasValidExtension && url.includes('ids.si.edu')) {
  // Cloudinary fetches the URL and serves with proper headers
  imageUrl = `https://res.cloudinary.com/dh4qwuvuo/image/fetch/${encodeURIComponent(product.image_url)}.jpg`
}
```

**Why this works:**
1. Cloudinary fetch API retrieves any URL
2. Returns proper `Content-Type: image/jpeg` header
3. Appending `.jpg` satisfies WooCommerce's extension check
4. WooCommerce downloads from Cloudinary successfully

### URL Validation Logic

```typescript
const hasValidExtension = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url) || 
                          url.includes('cdn.shopify.com') ||
                          url.includes('cloudinary.com')

if (hasValidExtension || url.includes('ids.si.edu')) {
  payload.images = [{ src: imageUrl, alt: product.title }]
}
```

---

## Digital Downloads

### WooCommerce Requirements

- Product `type` must be `simple` (not variable)
- `downloadable: true`
- `virtual: true` (no shipping)
- `downloads` array with file URL and name

### Transform Implementation

```typescript
if (product.is_digital && product.digital_file_url) {
  payload.type = 'simple'
  payload.downloadable = true
  payload.virtual = true
  payload.downloads = [{
    name: product.digital_file_name || 'Download',
    file: product.digital_file_url
  }]
  payload.download_limit = product.download_limit ?? -1   // -1 = unlimited
  payload.download_expiry = product.download_expiry ?? -1 // -1 = never
}
```

---

## Variation Products

### Fetching Variations

```typescript
// src/lib/woocommerce.ts
export async function fetchProductVariations(
  credentials: WooCommerceCredentials,
  productId: number
): Promise<WooCommerceVariation[]> {
  const response = await fetch('/api/woocommerce/variations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentials, productId })
  })
  return response.json()
}
```

### Updating Variation Prices

```typescript
// src/lib/woocommerce.ts
export async function updateProductVariation(
  credentials: WooCommerceCredentials,
  productId: number,
  variationId: number,
  data: { regular_price?: string; sale_price?: string }
): Promise<WooCommerceVariation> {
  const response = await fetch('/api/woocommerce/variation-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentials, productId, variationId, data })
  })
  return response.json()
}
```

---

## Bulk Push Implementation

### Location

`src/pages/stores/StoresIndex.tsx` - Gallery Store row shows "→ WooCommerce" button

### Flow

```typescript
async function handleBulkPush(targetPlatform: 'woocommerce') {
  // 1. Get all Gallery Store products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', galleryStoreId)

  // 2. Get WooCommerce credentials
  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('platform', 'woocommerce')
    .single()

  // 3. Loop and push each product
  for (const product of products) {
    const wooProduct = transformToWooCommerce(product)
    await pushProductToWooCommerce(
      credentials,
      wooProduct,
      undefined  // Always create new (cross-platform)
    )
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}
```

---

## API Endpoints

### POST /api/woocommerce/push

Create or update a product.

**Request:**
```json
{
  "credentials": {
    "siteUrl": "https://rapidwoo.com/commerce",
    "consumerKey": "ck_xxx",
    "consumerSecret": "cs_xxx"
  },
  "product": {
    "name": "Product Title",
    "regular_price": "45.00",
    "description": "Product description",
    "sku": "SKU-001"
  },
  "existingProductId": 12345  // Optional: if set, does PUT
}
```

**Response:**
```json
{
  "id": 12345,
  "name": "Product Title",
  "status": "publish",
  "regular_price": "45.00"
}
```

### POST /api/woocommerce/variations

Fetch variations for a variable product.

**Request:**
```json
{
  "credentials": { ... },
  "productId": 12345
}
```

**Response:**
```json
[
  {
    "id": 67890,
    "sku": "SKU-001-RED",
    "regular_price": "45.00",
    "attributes": [{ "name": "Color", "option": "Red" }]
  }
]
```

### POST /api/woocommerce/variation-update

Update a single variation's price.

**Request:**
```json
{
  "credentials": { ... },
  "productId": 12345,
  "variationId": 67890,
  "data": {
    "regular_price": "49.99"
  }
}
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid ID` | external_id from wrong platform | Only use external_id for same-platform updates |
| `Invalid image` | URL without extension | Use Cloudinary proxy |
| `401 Unauthorized` | Bad API keys | Verify consumer key/secret |
| `rest_no_route` | Wrong API path | Check site URL has /wp-json/wc/v3/ |

### Error Response Format

```json
{
  "error": "WooCommerce API error",
  "details": {
    "code": "woocommerce_rest_product_invalid_id",
    "message": "Invalid ID."
  }
}
```

---

## Testing Checklist

- [ ] Connect WooCommerce store with API keys
- [ ] Import products (verify external_id saved)
- [ ] Push single product (new)
- [ ] Push single product (update via external_id)
- [ ] Push digital download product
- [ ] Bulk push from Gallery Store
- [ ] Verify images display in WooCommerce admin
- [ ] Edit variation prices

---

## Credentials

**Test Store:** rapidwoo.com/commerce

```
Consumer Key: ck_e230e6dffb1f1a6d84b699d1b997b9666b015545
Consumer Secret: cs_4bd4aa392d6bfda27d71cf610629f582600574c3
```

---

## WooCommerce API Reference

- [Products](https://woocommerce.github.io/woocommerce-rest-api-docs/#products)
- [Product Variations](https://woocommerce.github.io/woocommerce-rest-api-docs/#product-variations)
- [Product Categories](https://woocommerce.github.io/woocommerce-rest-api-docs/#product-categories)

---

## Related Documentation

- [Commerce Hub Architecture](./COMMERCE-HUB-ARCHITECTURE.md)
- [Shopify Integration](./SHOPIFY-INTEGRATION.md)
- [Gallery Store Integration](./GALLERY-STORE-INTEGRATION.md)
