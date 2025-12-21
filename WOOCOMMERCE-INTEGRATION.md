# Commerce Hub - WooCommerce Integration

## Overview

WooCommerce integration provides full bidirectional sync between Commerce Hub and WordPress/WooCommerce stores.

| Feature | Status |
|---------|--------|
| Connect Store | ✅ Working |
| Import Products | ✅ Working |
| Import Categories | ✅ Working |
| Push Products | ✅ Working (create + update) |
| Variation Support | ✅ Working (view + edit prices) |
| Category Mapping | ⚠️ Partial (see TODO) |
| Image Sync | ⚠️ Import only |

---

## Connected Store

| Field | Value |
|-------|-------|
| Store URL | https://rapidwoo.com/commerce |
| Product Count | 35 products |
| API Version | WooCommerce REST API v3 |

---

## Architecture

```
Commerce Hub                          WooCommerce Store
─────────────                         ─────────────────
ProductEdit.tsx                       /wp-json/wc/v3/products
      │                                      │
      ▼                                      │
transforms.ts                                │
(transformToWooCommerce)                     │
      │                                      │
      ▼                                      │
woocommerce.ts                               │
(pushProductToWooCommerce)                   │
      │                                      │
      ▼                                      ▼
/api/woocommerce/push.js ───────────► WooCommerce REST API
      │                                      │
      │  ◄─────────────────────────────────  │
      ▼                              (response with product ID)
Update external_id in Supabase
```

---

## File Structure

```
commerce-hub/
├── api/woocommerce/
│   ├── push.js                 # Create/Update products
│   ├── variations.js           # Get product variations
│   └── variation-update.js     # Update variation prices
├── src/lib/
│   ├── woocommerce.ts          # API wrapper functions
│   └── transforms.ts           # Product format converter
└── src/pages/stores/
    └── WooCommerceConnect.tsx  # Import flow
```

---

## API Endpoints

### WooCommerce REST API (External)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/wp-json/wc/v3/products` | GET | List products |
| `/wp-json/wc/v3/products` | POST | Create product |
| `/wp-json/wc/v3/products/{id}` | PUT | Update product |
| `/wp-json/wc/v3/products/categories` | GET | List categories |
| `/wp-json/wc/v3/products/{id}/variations` | GET | List variations |
| `/wp-json/wc/v3/products/{id}/variations/{vid}` | PUT | Update variation |

### Serverless Proxies (Internal)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/woocommerce/push` | Create or update product |
| `POST /api/woocommerce/variations` | Fetch variations for product |
| `POST /api/woocommerce/variation-update` | Update variation price |

---

## Authentication

WooCommerce uses **Basic Auth** with consumer key/secret:

```javascript
// In serverless function
const authString = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')

const response = await fetch(endpoint, {
  headers: {
    'Authorization': `Basic ${authString}`,
    'Content-Type': 'application/json'
  }
})
```

**Credentials stored in Supabase:**
```json
// stores.api_credentials (JSONB)
{
  "consumer_key": "ck_xxx",
  "consumer_secret": "cs_xxx"
}
```

---

## Data Mapping

### Import: WooCommerce → Commerce Hub

| WooCommerce | Commerce Hub | Notes |
|-------------|--------------|-------|
| `id` | `external_id` | Stored as string |
| `name` | `title` | Direct |
| `description` | `description` | Direct |
| `regular_price` | `price` | String → Number |
| `sku` | `sku` | Direct |
| `images[0].src` | `image_url` | First image only |
| `status` | `status` | publish→active, draft→draft |
| `type` | `product_type` | simple, variable, etc. |
| `categories[0].name` | `category` | First category name |
| `attributes` | `attributes` | Full array (JSONB) |

### Push: Commerce Hub → WooCommerce

| Commerce Hub | WooCommerce | Notes |
|--------------|-------------|-------|
| `title` | `name` | Direct |
| `description` | `description` | Direct |
| `price` | `regular_price` | Number → String |
| `sku` | `sku` | Direct |
| `status` | `status` | active→publish, draft→draft |
| `category` | `categories` | Needs ID mapping (TODO) |
| `attributes` | `attributes` | Pass through |

---

## Key Functions

### transforms.ts

```typescript
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
    short_description: product.artist ? `By ${product.artist}` : undefined,
    sku: product.sku || `CH-${product.id.slice(0, 8)}`,
  }

  // Category mapping (if available)
  if (product.category && categoryMap) {
    const catId = categoryMap[product.category.toLowerCase()]
    if (catId) {
      payload.categories = [{ id: catId }]
    }
  }

  // Pass through attributes
  if (product.attributes?.length > 0) {
    payload.attributes = product.attributes.map(attr => ({
      id: attr.id,
      name: attr.name,
      position: attr.position || 0,
      visible: attr.visible !== false,
      variation: attr.variation || false,
      options: attr.options
    }))
  }

  return payload
}
```

### woocommerce.ts

```typescript
export async function pushProductToWooCommerce(
  credentials: WooCommerceCredentials,
  product: WooCommercePushPayload,
  existingProductId?: number
): Promise<WooCommerceProduct> {
  const response = await fetch('/api/woocommerce/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentials,
      product,
      existingProductId  // If set, triggers PUT instead of POST
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'WooCommerce push failed')
  }

  return response.json()
}
```

---

## Variable Products & Variations

WooCommerce variable products have:
- **Attributes**: Options like Size (S, M, L), Color (Red, Blue)
- **Variations**: Specific combinations with their own price/SKU

### Loading Variations

```typescript
// In ProductEdit.tsx
useEffect(() => {
  async function loadVariations() {
    if (productType !== 'variable' || !externalId) return
    
    const vars = await fetchProductVariations(credentials, parseInt(externalId))
    setVariations(vars)
  }
  loadVariations()
}, [productType, externalId])
```

### Updating Variation Price

```typescript
await updateProductVariation(
  credentials,
  productId,      // Parent product ID
  variationId,    // Specific variation ID
  { regular_price: newPrice }
)
```

### UI Display

```
┌─────────────────────────────────────────────────────────────┐
│ Product Variations (from WooCommerce - 6 variations)        │
├──────────────┬──────────┬─────────┬─────────┬──────────────┤
│ Variation    │ SKU      │ Price   │ Stock   │ Action       │
├──────────────┼──────────┼─────────┼─────────┼──────────────┤
│ Red - Small  │ SHIRT-RS │ $19.99  │ 50      │ [Save]       │
│ Red - Medium │ SHIRT-RM │ $19.99  │ 45      │ [Save]       │
│ Blue - Small │ SHIRT-BS │ $19.99  │ 30      │ [Save]       │
└──────────────┴──────────┴─────────┴─────────┴──────────────┘
```

Inline price editing saves directly to WooCommerce.

---

## Import Flow

### WooCommerceConnect.tsx Steps

1. **Connect**: Enter site URL + consumer key/secret
2. **Test**: Fetch products + categories from WooCommerce
3. **Preview**: Show products with images, prices, categories
4. **Import**: Save to Supabase with external_id + attributes

### Import Logic

```typescript
// For each WooCommerce product
const { error } = await supabase
  .from('products')
  .insert({
    user_id: user.id,
    store_id: store.id,
    external_id: String(wooProduct.id),  // Critical for updates
    title: wooProduct.name,
    description: wooProduct.description,
    price: parseFloat(wooProduct.regular_price || '0'),
    sku: wooProduct.sku,
    image_url: wooProduct.images[0]?.src || '',
    status: wooProduct.status === 'publish' ? 'active' : 'draft',
    category: wooProduct.categories[0]?.name || '',
    product_type: wooProduct.type,
    attributes: wooProduct.attributes,  // Full array for variable products
  })
```

---

## Push Flow

### ProductEdit.tsx Push Logic

```typescript
if (store.platform === 'woocommerce') {
  const credentials = store.api_credentials
  
  // Fetch categories for mapping
  const response = await fetch(
    `${credentials.siteUrl}/wp-json/wc/v3/products/categories?per_page=100`,
    { headers: { Authorization: `Basic ${btoa(...)}` } }
  )
  const categories = await response.json()
  
  // Build category map: name → ID
  const categoryMap = {}
  categories.forEach(cat => {
    categoryMap[cat.name.toLowerCase()] = cat.id
  })
  
  // Transform and push
  const wooProduct = transformToWooCommerce(product, categoryMap)
  const result = await pushProductToWooCommerce(
    credentials,
    wooProduct,
    externalId ? parseInt(externalId) : undefined  // Update vs Create
  )
  
  // Save external_id if new product
  if (!externalId) {
    await supabase
      .from('products')
      .update({ external_id: String(result.id) })
      .eq('id', product.id)
  }
}
```

---

## Known Issues & Solutions

### Issue: Categories not syncing
**Problem:** WooCommerce categories require numeric IDs, not names.
**Current Solution:** Fetch categories on push, build name→ID map.
**TODO:** Cache categories in Supabase or fetch on import.

### Issue: Images don't update
**Problem:** We only send image on create, not update.
**Solution:** Add image to update payload (needs testing with WooCommerce image handling).

### Issue: Duplicate products on re-import
**Problem:** Import always creates new records.
**Solution:** Add upsert logic (check external_id + store_id first).

---

## Testing Checklist

### Import
- [ ] Connect with credentials
- [ ] Products load with images
- [ ] Categories fetched
- [ ] Import creates products with correct external_id
- [ ] Attributes saved for variable products

### Push (Update)
- [ ] Edit imported product
- [ ] Push to WooCommerce
- [ ] Changes appear in WooCommerce admin
- [ ] No duplicate created

### Push (Create)
- [ ] Create new product in Commerce Hub
- [ ] Push to WooCommerce
- [ ] Product appears in WooCommerce
- [ ] external_id saved in Supabase

### Variations
- [ ] Variable product shows variations table
- [ ] Edit variation price inline
- [ ] Save updates WooCommerce
- [ ] Price persists after refresh

---

## TODO / Roadmap

### High Priority
- [ ] **Category caching** - Store categories in Supabase on connect
- [ ] **Upsert on import** - Check external_id before insert
- [ ] **Image update** - Include images in PUT requests

### Medium Priority
- [ ] **Bulk edit variations** - Edit all prices at once
- [ ] **Stock sync** - Update inventory quantities
- [ ] **Two-way sync** - Pull changes from WooCommerce

### Low Priority
- [ ] **Attribute editing** - Add/remove attribute options
- [ ] **Create variations** - Generate variations from attributes
- [ ] **Order sync** - Import orders from WooCommerce

---

## Reference

- WooCommerce REST API Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/
- Products endpoint: https://woocommerce.github.io/woocommerce-rest-api-docs/#products
- Variations endpoint: https://woocommerce.github.io/woocommerce-rest-api-docs/#product-variations
- Categories endpoint: https://woocommerce.github.io/woocommerce-rest-api-docs/#product-categories

---

*Last Updated: December 21, 2024*
