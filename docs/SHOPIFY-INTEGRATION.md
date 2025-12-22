# Shopify Integration

> Commerce Hub ↔ Shopify Admin API (2024-01)

**Version:** 1.0  
**Last Updated:** December 2024  
**Status:** Production

---

## Overview

The Shopify integration enables full OAuth-authenticated product synchronization between Commerce Hub and Shopify stores. It supports product import, push (create/update), tags management, and digital downloads. Unlike WooCommerce, Shopify accepts most image URL formats directly without requiring proxy transformation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      COMMERCE HUB                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ShopifyConnect.tsx    ShopifyImport.tsx    ProductEdit.tsx │
│  (OAuth flow)          (Import products)    (Edit + Push)   │
│         │                     │                   │         │
│         └─────────────┬───────┴───────────────────┘         │
│                       │                                     │
│                       ▼                                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    LIB LAYER                          │  │
│  │  shopify.ts                  transforms.ts            │  │
│  │  - getShopifyAuthUrl()       - transformToShopify()   │  │
│  │  - exchangeCodeForToken()    - Tags handling          │  │
│  │  - fetchShopifyProducts()    - Digital downloads      │  │
│  │  - pushProductToShopify()                             │  │
│  └───────────────────────────────────────────────────────┘  │
│                       │                                     │
└───────────────────────┼─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                 VERCEL SERVERLESS API                        │
│  /api/shopify/                                              │
│  ├── token.js         OAuth token exchange                 │
│  └── products.js      Create/Update/Fetch products         │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                       SHOPIFY                                │
│              dev-store-749237498237498787.myshopify.com     │
│                                                             │
│  Admin API 2024-01: /admin/api/2024-01/                     │
│  ├── products.json          GET, POST                       │
│  └── products/{id}.json     GET, PUT, DELETE               │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/lib/shopify.ts` | OAuth + API wrapper functions | ~150 |
| `src/lib/transforms.ts` | Format conversion (transformToShopify) | ~265 |
| `api/shopify/token.js` | OAuth token exchange | ~60 |
| `api/shopify/products.js` | Product CRUD proxy | ~110 |
| `src/pages/stores/ShopifyConnect.tsx` | OAuth initiation | ~150 |
| `src/pages/stores/ShopifyCallback.tsx` | OAuth callback | ~100 |
| `src/pages/stores/ShopifyImport.tsx` | Import UI | ~250 |
| `src/pages/products/ProductEdit.tsx` | Edit + Push UI | ~900 |

---

## Authentication

### OAuth 2.0 Flow

Shopify requires OAuth for API access. Commerce Hub implements the full authorization code flow.

```
┌──────────────┐                              ┌──────────────┐
│   Commerce   │                              │    Shopify   │
│     Hub      │                              │              │
└──────┬───────┘                              └──────┬───────┘
       │                                             │
       │  1. User enters shop domain                 │
       │     (mystore.myshopify.com)                 │
       │                                             │
       │  2. Redirect to Shopify OAuth               │
       │─────────────────────────────────────────────►
       │  /admin/oauth/authorize?                    │
       │    client_id=xxx&                           │
       │    scope=read_products,write_products&      │
       │    redirect_uri=xxx&                        │
       │    state=xxx                                │
       │                                             │
       │  3. User approves in Shopify admin          │
       │                                             │
       │  4. Redirect back with code                 │
       │◄─────────────────────────────────────────────
       │  /auth/shopify/callback?                    │
       │    code=xxx&shop=xxx&state=xxx              │
       │                                             │
       │  5. Exchange code for access_token          │
       │─────────────────────────────────────────────►
       │  POST /admin/oauth/access_token             │
       │                                             │
       │  6. Receive access_token                    │
       │◄─────────────────────────────────────────────
       │  { access_token: "shpat_xxx" }              │
       │                                             │
       │  7. Store in Supabase                       │
       │                                             │
```

### OAuth Configuration

```typescript
// src/lib/shopify.ts
const SHOPIFY_CLIENT_ID = '4a7cdbc57f846a3e0b2e66d1037801e0'
const REDIRECT_URI = `${window.location.origin}/auth/shopify/callback`
const SCOPES = 'read_products,write_products,read_inventory,write_inventory'
```

### Credential Storage

```sql
-- stores table
api_credentials: {
  "access_token": "shpat_xxxxx",
  "scope": "read_products,write_products,read_inventory,write_inventory"
}
```

---

## OAuth Implementation

### Step 1: Initiate OAuth

```typescript
// src/lib/shopify.ts
export function getShopifyAuthUrl(shopDomain: string): string {
  const state = crypto.randomUUID()
  sessionStorage.setItem('shopify_oauth_state', state)
  sessionStorage.setItem('shopify_shop_domain', shopDomain)
  
  const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  
  const params = new URLSearchParams({
    client_id: SHOPIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: REDIRECT_URI,
    state: state,
  })
  
  return `https://${cleanDomain}/admin/oauth/authorize?${params.toString()}`
}
```

### Step 2: Handle Callback

```typescript
// src/pages/stores/ShopifyCallback.tsx
const code = searchParams.get('code')
const shop = searchParams.get('shop')
const state = searchParams.get('state')

// Validate state to prevent CSRF
if (!validateOAuthState(state)) {
  throw new Error('Invalid OAuth state')
}

// Exchange code for token
const tokenData = await exchangeCodeForToken(shop, code)
```

### Step 3: Exchange Code for Token

```typescript
// src/lib/shopify.ts
export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<{ access_token: string; scope: string }> {
  const response = await fetch('/api/shopify/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shop, code })
  })
  return response.json()
}
```

### Token Exchange Endpoint

```javascript
// api/shopify/token.js
export default async function handler(req, res) {
  const { shop, code } = req.body
  
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
    })
  })
  
  const data = await response.json()
  return res.json(data)
}
```

---

## Data Flow: Import

### Import Code (ShopifyImport.tsx)

```typescript
// Fetch products via serverless proxy
const response = await fetch('/api/shopify/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    shop: shopDomain,
    accessToken: credentials.access_token,
    action: 'fetch'
  })
})

const { products } = await response.json()

// Transform and upsert
for (const p of products) {
  // Check for existing by external_id to prevent duplicates
  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('external_id', String(p.id))
    .single()

  if (existing) {
    // Update existing
    await supabase.from('products')
      .update({ title: p.title, ... })
      .eq('id', existing.id)
  } else {
    // Insert new
    await supabase.from('products').insert({
      title: p.title,
      description: p.body_html,
      price: parseFloat(p.variants[0]?.price) || 0,
      image_url: p.images[0]?.src || null,
      sku: p.variants[0]?.sku,
      external_id: String(p.id),  // CRITICAL
      store_id: storeId,
      shopify_tags: p.tags || ''
    })
  }
}
```

---

## Data Flow: Push

### Push Code (ProductEdit.tsx)

```typescript
// Transform to Shopify format
const shopifyProduct = transformToShopify(
  product,
  storeName,
  shopifyTags  // Preserve existing tags
)

// Determine create vs update
const isUpdate = productPlatform === 'shopify' && externalId && !isNaN(parseInt(externalId))

const response = await fetch('/api/shopify/products', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    shop: shopDomain,
    accessToken: accessToken,
    action: isUpdate ? 'update' : 'create',
    productId: isUpdate ? externalId : undefined,
    product: shopifyProduct
  })
})

// Save external_id for new products (only if from Shopify)
if (!isUpdate && productData?.id && productPlatform === 'shopify') {
  await supabase.from('products')
    .update({ external_id: String(productData.id) })
    .eq('id', productId)
}
```

---

## Transform: Commerce Hub → Shopify

### Field Mapping

| Commerce Hub | Shopify | Notes |
|--------------|---------|-------|
| `title` | `title` | Required |
| `description` | `body_html` | HTML format |
| `price` | `variants[0].price` | String format |
| `artist` | Appended to `body_html` | "Artist: {name}" |
| `sku` | `variants[0].sku` | Auto-generate if missing |
| `status` | `status` | active/draft/archived |
| `image_url` | `images[0].src` | Direct URL (no proxy needed) |
| `category` | `product_type` | Text value |
| `shopify_tags` | `tags` | Comma-separated string |

### Transform Function

```typescript
// src/lib/transforms.ts
export function transformToShopify(
  product: CommerceHubProduct,
  vendorName: string = 'Commerce Hub',
  shopifyTags?: string
): ShopifyPushPayload {
  
  const statusMap = {
    active: 'active',
    draft: 'draft',
    archived: 'archived'
  }

  // Build HTML body
  let bodyHtml = ''
  if (product.description) {
    bodyHtml += `<p>${escapeHtml(product.description)}</p>`
  }
  if (product.artist) {
    bodyHtml += `<p><strong>Artist:</strong> ${escapeHtml(product.artist)}</p>`
  }
  if (product.is_digital) {
    bodyHtml += `<p><strong>📥 Digital Download:</strong> You will receive a download link after purchase.</p>`
  }

  // Build tags - include 'digital-download' for digital products
  let tags = shopifyTags || ''
  if (product.is_digital && !tags.toLowerCase().includes('digital')) {
    tags = tags ? `${tags}, digital-download` : 'digital-download'
  }

  return {
    title: product.title,
    body_html: bodyHtml,
    vendor: vendorName,
    product_type: product.category || 'Art Print',
    tags,
    status: statusMap[product.status] || 'draft',
    variants: [{
      price: product.price.toFixed(2),
      sku: product.sku || `CH-${product.id.slice(0, 8)}`,
      inventory_quantity: product.is_digital ? 999 : 100,
      inventory_management: product.is_digital ? null : 'shopify'
    }],
    images: product.image_url ? [{
      src: product.image_url,
      alt: product.title
    }] : undefined
  }
}
```

---

## Image URL Handling

### Shopify Advantage

Unlike WooCommerce, **Shopify accepts most URL formats directly**, including:
- Smithsonian API URLs (`ids.si.edu/ids/deliveryService?id=...`)
- URLs without file extensions
- Query string parameters

Shopify downloads the image, uploads to its CDN, and serves from `cdn.shopify.com`.

### No Proxy Needed

```typescript
// Shopify transform (simple)
if (product.image_url) {
  payload.images = [{
    src: product.image_url,  // Direct URL - Shopify handles it
    alt: product.title
  }]
}
```

---

## Tags Management

### Shopify Tags Field

Shopify uses a comma-separated string for tags. Commerce Hub stores this in `shopify_tags` column.

```typescript
// ProductEdit.tsx - Tags input
<input
  type="text"
  value={shopifyTags}
  onChange={(e) => setShopifyTags(e.target.value)}
  placeholder="art, prints, gallery"
/>
```

### Preserving Tags on Push

```typescript
// Only load tags for Shopify products
if (productPlatform === 'shopify') {
  setShopifyTags(product.shopify_tags || '')
}

// Include in transform
const shopifyProduct = transformToShopify(product, storeName, shopifyTags)
```

### Digital Download Tag

Automatically adds `digital-download` tag for digital products:

```typescript
if (product.is_digital && !tags.toLowerCase().includes('digital')) {
  tags = tags ? `${tags}, digital-download` : 'digital-download'
}
```

---

## Digital Downloads

### Shopify Digital Products

Shopify handles digital downloads differently than WooCommerce. The transform:
- Disables inventory management (`inventory_management: null`)
- Sets high inventory quantity (999)
- Adds `digital-download` tag
- Adds notice in body HTML

```typescript
if (product.is_digital) {
  payload.variants[0].inventory_quantity = 999
  payload.variants[0].inventory_management = null
  bodyHtml += `<p><strong>📥 Digital Download:</strong> You will receive a download link after purchase.</p>`
}
```

**Note:** For actual file delivery, use Shopify apps like "Digital Downloads" or "Sky Pilot".

---

## Bulk Push Implementation

### Location

`src/pages/stores/StoresIndex.tsx` - Gallery Store row shows "→ Shopify" button

### Flow

```typescript
async function handleBulkPush(targetPlatform: 'shopify') {
  // 1. Get all Gallery Store products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', galleryStoreId)

  // 2. Get Shopify credentials
  const { data: store } = await supabase
    .from('stores')
    .select('*')
    .eq('platform', 'shopify')
    .single()

  const credentials = store.api_credentials
  const shopDomain = store.store_url.replace(/^https?:\/\//, '').replace(/\/$/, '')

  // 3. Loop and push each product
  for (const product of products) {
    const shopifyProduct = transformToShopify(product, store.name)
    
    await fetch('/api/shopify/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: shopDomain,
        accessToken: credentials.access_token,
        action: 'create',
        product: shopifyProduct
      })
    })
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}
```

---

## API Endpoints

### POST /api/shopify/products

Fetch, create, or update products.

**Fetch Products:**
```json
{
  "shop": "mystore.myshopify.com",
  "accessToken": "shpat_xxx",
  "action": "fetch"
}
```

**Create Product:**
```json
{
  "shop": "mystore.myshopify.com",
  "accessToken": "shpat_xxx",
  "action": "create",
  "product": {
    "title": "Product Title",
    "body_html": "<p>Description</p>",
    "variants": [{ "price": "45.00" }]
  }
}
```

**Update Product:**
```json
{
  "shop": "mystore.myshopify.com",
  "accessToken": "shpat_xxx",
  "action": "update",
  "productId": "7558835110001",
  "product": { "title": "Updated Title" }
}
```

### POST /api/shopify/token

Exchange OAuth code for access token.

```json
{
  "shop": "mystore.myshopify.com",
  "code": "oauth_authorization_code"
}
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid access token` | Expired or revoked token | Re-authenticate via OAuth |
| `Rate limited` | Too many API calls | Add delays between requests |
| `Not Found` | Invalid product ID | Check external_id is from Shopify |
| `Forbidden` | Missing scopes | Re-authenticate with correct scopes |

### Error Response Format

```json
{
  "error": "Shopify API error: 401",
  "details": "Invalid access token"
}
```

---

## Testing Checklist

- [ ] Complete OAuth flow (connect store)
- [ ] Import products (verify external_id saved)
- [ ] Push single product (new)
- [ ] Push single product (update via external_id)
- [ ] Verify tags preserved on round-trip
- [ ] Push digital download product
- [ ] Bulk push from Gallery Store
- [ ] Verify images display in Shopify admin (CDN URLs)

---

## Environment Variables

```env
# Vercel Environment Variables
SHOPIFY_API_KEY=4a7cdbc57f846a3e0b2e66d1037801e0
SHOPIFY_API_SECRET=your_secret_here
```

---

## Shopify API Reference

- [Products](https://shopify.dev/docs/api/admin-rest/2024-01/resources/product)
- [OAuth](https://shopify.dev/docs/apps/auth/oauth)
- [Rate Limits](https://shopify.dev/docs/api/usage/rate-limits)

---

## Related Documentation

- [Commerce Hub Architecture](./COMMERCE-HUB-ARCHITECTURE.md)
- [WooCommerce Integration](./WOOCOMMERCE-INTEGRATION.md)
- [Gallery Store Integration](./GALLERY-STORE-INTEGRATION.md)
