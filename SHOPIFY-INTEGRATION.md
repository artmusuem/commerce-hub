# Commerce Hub - Shopify Integration

## Overview

Shopify integration provides full bidirectional sync between Commerce Hub and Shopify stores via OAuth and the Admin API.

| Feature | Status |
|---------|--------|
| OAuth Connect | ✅ Working |
| Import Products | ✅ Working |
| Push Products | ✅ Working (create + update) |
| Tags Sync | ✅ Working (bidirectional) |
| Product Type | ✅ Working |
| Upsert on Import | ✅ Working (no duplicates) |

---

## Connected Store

| Field | Value |
|-------|-------|
| Store Domain | dev-store-749237498237498787.myshopify.com |
| Product Count | 17 products |
| API Version | 2024-01 |

---

## Architecture

```
Commerce Hub                             Shopify Store
─────────────                            ─────────────
ShopifyConnect.tsx                       
      │                                  
      ▼                                  
Redirect to Shopify OAuth ──────────────► Shopify Authorization
      │                                        │
      │  ◄─────────────────────────────────────┘
      ▼                                  (redirect with code)
ShopifyCallback.tsx                      
      │                                  
      ▼                                  
/api/shopify/token.js ──────────────────► Exchange code for token
      │                                        │
      │  ◄─────────────────────────────────────┘
      ▼                                  (access_token)
Save token to Supabase                   

─────────────────────────────────────────────────────────────

ProductEdit.tsx                          
      │                                  
      ▼                                  
transforms.ts                            
(transformToShopify)                     
      │                                  
      ▼                                  
/api/shopify/products.js ───────────────► Shopify Admin API
      │                                        │
      │  ◄─────────────────────────────────────┘
      ▼                                  (product data)
Update external_id in Supabase           
```

---

## File Structure

```
commerce-hub/
├── api/shopify/
│   ├── token.js              # OAuth token exchange
│   └── products.js           # Products CRUD proxy
├── src/lib/
│   ├── shopify.ts            # OAuth utilities
│   └── transforms.ts         # Product format converter
└── src/pages/stores/
    ├── ShopifyConnect.tsx    # Start OAuth flow
    ├── ShopifyCallback.tsx   # Handle OAuth callback
    └── ShopifyImport.tsx     # Import products
```

---

## OAuth Flow

### Step 1: Initiate (ShopifyConnect.tsx)

```typescript
const authUrl = getShopifyAuthUrl(shopDomain)
// Redirects to:
// https://{shop}.myshopify.com/admin/oauth/authorize
//   ?client_id=xxx
//   &scope=read_products,write_products,read_inventory,write_inventory
//   &redirect_uri=https://commerce-hub-iota.vercel.app/auth/shopify/callback
//   &state={random_uuid}
```

### Step 2: Callback (ShopifyCallback.tsx)

```typescript
// User approves → Shopify redirects to callback with code
const code = searchParams.get('code')
const shop = searchParams.get('shop')

// Exchange code for token
const response = await fetch('/api/shopify/token', {
  method: 'POST',
  body: JSON.stringify({ code, shop })
})
const { access_token } = await response.json()

// Save to Supabase
await supabase.from('stores').insert({
  platform: 'shopify',
  store_url: `https://${shop}`,
  store_name: shop,
  api_credentials: { access_token },
  is_connected: true
})
```

### Step 3: Token Exchange (api/shopify/token.js)

```javascript
const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: process.env.SHOPIFY_API_KEY,
    client_secret: process.env.SHOPIFY_API_SECRET,
    code
  })
})
```

---

## API Endpoints

### Shopify Admin API (External)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/admin/api/2024-01/products.json` | GET | List products |
| `/admin/api/2024-01/products.json` | POST | Create product |
| `/admin/api/2024-01/products/{id}.json` | PUT | Update product |
| `/admin/api/2024-01/products/{id}.json` | DELETE | Delete product |

### Serverless Proxy (Internal)

```
POST /api/shopify/products
{
  shop: "store.myshopify.com",
  accessToken: "shpat_xxx",
  action: "fetch" | "create" | "update",
  productId: 123,        // for update
  product: { ... }       // for create/update
}
```

---

## Data Mapping

### Import: Shopify → Commerce Hub

| Shopify | Commerce Hub | Notes |
|---------|--------------|-------|
| `id` | `external_id` | Stored as string |
| `title` | `title` | Direct |
| `body_html` | `description` | HTML tags stripped |
| `variants[0].price` | `price` | String → Number |
| `variants[0].sku` | `sku` | First variant |
| `images[0].src` | `image_url` | First image |
| `status` | `status` | active→active, draft→draft |
| `product_type` | `category` | e.g., "snowboard" |
| `vendor` | `artist` | Store as artist field |
| `tags` | `attributes.shopify_tags` | Comma-separated string |

### Push: Commerce Hub → Shopify

| Commerce Hub | Shopify | Notes |
|--------------|---------|-------|
| `title` | `title` | Direct |
| `description` | `body_html` | Wrapped in `<p>` tags |
| `price` | `variants[0].price` | Number → String |
| `sku` | `variants[0].sku` | Direct |
| `image_url` | `images[0].src` | Direct |
| `status` | `status` | Direct |
| `category` | `product_type` | Direct |
| `artist` | `vendor` | Or store name |
| `shopifyTags` | `tags` | Comma-separated |

---

## Platform-Aware Attributes

Shopify products store attributes differently than WooCommerce:

```typescript
// Shopify: Object format
attributes: {
  shopify_tags: "Premium, Snow, Snowboard, Sport, Winter",
  platform: "shopify"
}

// WooCommerce: Array format
attributes: [
  { name: "Size", options: ["S", "M", "L"] }
]
```

### Loading (ProductEdit.tsx)

```typescript
const attrs = data.attributes || []
if (Array.isArray(attrs)) {
  setAttributes(attrs)  // WooCommerce
} else if (attrs?.platform === 'shopify') {
  setShopifyTags(attrs.shopify_tags || '')
}
```

### Saving

```typescript
let attributesToSave = attributes
if (productPlatform === 'shopify') {
  attributesToSave = {
    shopify_tags: shopifyTags,
    platform: 'shopify'
  }
}
```

---

## Key Functions

### transforms.ts

```typescript
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

  let bodyHtml = ''
  if (product.description) {
    bodyHtml += `<p>${escapeHtml(product.description)}</p>`
  }
  if (product.artist) {
    bodyHtml += `<p><strong>Artist:</strong> ${escapeHtml(product.artist)}</p>`
  }

  return {
    title: product.title,
    body_html: bodyHtml,
    vendor: vendorName,
    product_type: product.category || 'Art Print',
    tags: shopifyTags || '',
    status: statusMap[product.status] || 'draft',
    variants: [{
      price: product.price.toFixed(2),
      sku: product.sku || `CH-${product.id.slice(0, 8)}`,
      inventory_quantity: 100,
      inventory_management: 'shopify'
    }],
    images: product.image_url ? [{ src: product.image_url, alt: product.title }] : undefined
  }
}
```

### api/shopify/products.js

```javascript
export default async function handler(req, res) {
  const { shop, accessToken, action, productId, product } = req.body
  
  const baseUrl = `https://${shop}/admin/api/2024-01`
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json'
  }

  if (action === 'fetch') {
    const response = await fetch(`${baseUrl}/products.json?limit=250`, { headers })
    return res.json(await response.json())
  }

  if (action === 'create') {
    const response = await fetch(`${baseUrl}/products.json`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ product })
    })
    return res.json(await response.json())
  }

  if (action === 'update') {
    const response = await fetch(`${baseUrl}/products/${productId}.json`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ product })
    })
    return res.json(await response.json())
  }
}
```

---

## Import Flow (ShopifyImport.tsx)

### Upsert Logic (Prevents Duplicates)

```typescript
for (const product of products) {
  const externalId = String(product.id)

  // Check if exists
  const { data: existing } = await supabase
    .from('products')
    .select('id')
    .eq('store_id', selectedStore.id)
    .eq('external_id', externalId)
    .single()

  const productData = {
    user_id: user.id,
    store_id: selectedStore.id,
    external_id: externalId,
    title: product.title,
    description: product.body_html?.replace(/<[^>]*>/g, '') || '',
    price: parseFloat(product.variants[0]?.price || '0'),
    sku: product.variants[0]?.sku || '',
    image_url: product.images[0]?.src || '',
    status: product.status === 'active' ? 'active' : 'draft',
    category: product.product_type || '',
    artist: product.vendor || '',
    attributes: {
      shopify_tags: product.tags || '',
      platform: 'shopify'
    }
  }

  if (existing) {
    await supabase.from('products').update(productData).eq('id', existing.id)
  } else {
    await supabase.from('products').insert(productData)
  }
}
```

---

## Push Flow (ProductEdit.tsx)

```typescript
if (store.platform === 'shopify') {
  const credentials = store.api_credentials
  const shopDomain = store.store_url.replace(/^https?:\/\//, '')
  
  // Transform with tags
  const shopifyProduct = transformToShopify(
    product,
    store.store_name || 'Commerce Hub',
    shopifyTags  // Include current tags
  )
  
  // Determine update vs create
  const isUpdate = externalId && !isNaN(parseInt(externalId))
  
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
  
  const result = await response.json()
  
  // Save external_id for new products
  if (!isUpdate && result.product?.id) {
    await supabase
      .from('products')
      .update({ external_id: String(result.product.id) })
      .eq('id', id)
  }
}
```

---

## UI Components

### Product Edit - Shopify Fields

```
┌─────────────────────────────────────────┐
│ Product Type: [snowboard          ]     │  ← Instead of "Category"
│ (Shopify product type for filtering)    │
├─────────────────────────────────────────┤
│ Shopify Tags: [Premium, Snow, Sport]    │  ← Comma-separated
│ (Comma-separated tags for Shopify)      │
└─────────────────────────────────────────┘
```

WooCommerce attributes section is hidden for Shopify products.

---

## Testing Checklist

### OAuth
- [ ] Enter store domain
- [ ] Redirect to Shopify authorization
- [ ] Approve app installation
- [ ] Callback saves token
- [ ] Store appears as connected

### Import
- [ ] Fetch products from Shopify
- [ ] Preview shows images, prices, tags
- [ ] Import creates products with external_id
- [ ] Re-import updates existing (no duplicates)
- [ ] Tags saved in attributes.shopify_tags

### Push (Update)
- [ ] Edit imported product
- [ ] Change tags
- [ ] Push to Shopify
- [ ] Changes appear in Shopify admin
- [ ] Tags persist in Commerce Hub

### Push (Create)
- [ ] Create new product
- [ ] Set tags
- [ ] Push to Shopify
- [ ] Product appears in Shopify
- [ ] external_id saved

---

## Environment Variables

Required in Vercel:

```
SHOPIFY_API_KEY=4a7cdbc57f846a3e0b2e66d1037801e0
SHOPIFY_API_SECRET=xxx
```

---

## Reference

- Shopify Admin API: https://shopify.dev/docs/api/admin-rest
- Products endpoint: https://shopify.dev/docs/api/admin-rest/2024-01/resources/product
- OAuth guide: https://shopify.dev/docs/apps/auth/oauth

---

*Last Updated: December 21, 2024*
