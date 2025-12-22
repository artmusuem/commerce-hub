# Gallery Store Integration

> Commerce Hub ↔ Gallery Store (Smithsonian-Powered JSON Storefront)

**Version:** 1.0  
**Last Updated:** December 2024  
**Status:** Production

---

## Overview

Gallery Store is a static JSON-powered storefront that displays artwork from the Smithsonian Open Access API. Commerce Hub serves as the content management system for Gallery Store, allowing product editing and publishing via GitHub API. Gallery Store products can also be bulk-pushed to WooCommerce and Shopify for multi-channel distribution.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SMITHSONIAN API                           │
│              api.si.edu/openaccess/api/v1.0                 │
│                                                             │
│  Provides: Artwork metadata, images, artist info            │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      COMMERCE HUB                            │
│                 commerce-hub-iota.vercel.app                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ImportStore.tsx         ProductEdit.tsx      StoresIndex   │
│  (Import from SI)        (Edit products)      (Bulk Push)   │
│         │                      │                  │         │
│         │                      │         ┌────────┴───────┐ │
│         │                      │         │                │ │
│         │                      ▼         ▼                ▼ │
│         │              ┌─────────────────────────────────┐  │
│         │              │         BULK PUSH               │  │
│         │              │  → WooCommerce (Cloudinary)     │  │
│         │              │  → Shopify (direct URLs)        │  │
│         │              └─────────────────────────────────┘  │
│         │                      │                            │
│         ▼                      ▼                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   SUPABASE                          │    │
│  │  products table (store_id = gallery-store)          │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                │
└────────────────────────────┼────────────────────────────────┘
                             │
                             │ Publish via GitHub API
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                       GITHUB                                 │
│            artmusuem/ecommerce-react repository             │
│                                                             │
│  public/data/                                               │
│  ├── products.json      (Editable - Commerce Hub writes)   │
│  └── products.backup.json (Immutable - Smithsonian source) │
└─────────────────────────────────────────────────────────────┘
                             │
                             │ Vercel auto-deploy
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    GALLERY STORE                             │
│            ecommerce-react-beta-woad.vercel.app             │
│                                                             │
│  Static React storefront                                    │
│  Reads: public/data/products.json                          │
│  Displays: Product grid, detail pages, cart                │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose | Location |
|------|---------|----------|
| `src/pages/stores/ImportStore.tsx` | Import from Smithsonian | Commerce Hub |
| `api/gallery-store/push.js` | Publish to GitHub | Commerce Hub |
| `api/gallery-store/reset.js` | Reset to backup | Commerce Hub |
| `public/data/products.json` | Live product data | Gallery Store |
| `public/data/products.backup.json` | Original Smithsonian data | Gallery Store |

---

## Data Flow: Import

### Smithsonian API Import

```
Smithsonian API → Commerce Hub → Supabase
```

The import process fetches artwork from Smithsonian Open Access API and transforms it to Commerce Hub product format.

### Import Code (ImportStore.tsx)

```typescript
// Fetch from Smithsonian API
const response = await fetch(
  `https://api.si.edu/openaccess/api/v1.0/search?q=${query}&api_key=${apiKey}`
)
const { response: { rows } } = await response.json()

// Transform each artwork to product
const products = rows.map(artwork => ({
  title: artwork.title,
  description: artwork.content?.description || '',
  artist: artwork.content?.freetext?.name?.[0]?.content || 'Unknown Artist',
  image_url: `https://ids.si.edu/ids/deliveryService?id=${artwork.content?.descriptiveNonRepeating?.online_media?.media?.[0]?.idsId}`,
  price: 45.00,  // Default price
  category: 'Art Print',
  status: 'active'
}))

// Insert into Supabase
await supabase.from('products').insert(
  products.map(p => ({
    ...p,
    store_id: galleryStoreId
  }))
)
```

---

## Data Flow: Publish

### Two-File System

Gallery Store uses a two-file architecture for safe editing:

| File | Purpose | Editable |
|------|---------|----------|
| `products.json` | Live storefront data | ✅ Yes |
| `products.backup.json` | Original Smithsonian data | ❌ No |

### Publish Flow

```
Commerce Hub                   GitHub                    Gallery Store
     │                           │                            │
     │  1. Fetch products        │                            │
     │     from Supabase         │                            │
     │                           │                            │
     │  2. Transform to          │                            │
     │     Gallery Store         │                            │
     │     JSON format           │                            │
     │                           │                            │
     │  3. PUT to GitHub API     │                            │
     │─────────────────────────▶│                            │
     │  Update products.json     │                            │
     │                           │                            │
     │                           │  4. Vercel detects         │
     │                           │     change                 │
     │                           │────────────────────────────▶
     │                           │                            │
     │                           │  5. Auto-deploy            │
     │                           │     (~30 seconds)          │
     │                           │                            │
```

### Publish Endpoint (api/gallery-store/push.js)

```javascript
export default async function handler(req, res) {
  const { products, githubToken } = req.body
  
  // Get current file SHA (required for update)
  const fileResponse = await fetch(
    'https://api.github.com/repos/artmusuem/ecommerce-react/contents/public/data/products.json',
    { headers: { 'Authorization': `Bearer ${githubToken}` } }
  )
  const { sha } = await fileResponse.json()
  
  // Update file via GitHub API
  const content = Buffer.from(JSON.stringify(products, null, 2)).toString('base64')
  
  await fetch(
    'https://api.github.com/repos/artmusuem/ecommerce-react/contents/public/data/products.json',
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Update products from Commerce Hub',
        content,
        sha
      })
    }
  )
  
  return res.json({ success: true })
}
```

---

## Data Flow: Reset

### Reset to Original Data

The reset function restores `products.json` from `products.backup.json`:

```javascript
// api/gallery-store/reset.js
export default async function handler(req, res) {
  const { githubToken } = req.body
  
  // 1. Fetch backup file
  const backupResponse = await fetch(
    'https://api.github.com/repos/artmusuem/ecommerce-react/contents/public/data/products.backup.json',
    { headers: { 'Authorization': `Bearer ${githubToken}` } }
  )
  const backupData = await backupResponse.json()
  const backupContent = Buffer.from(backupData.content, 'base64').toString()
  
  // 2. Get current products.json SHA
  const currentResponse = await fetch(
    'https://api.github.com/repos/artmusuem/ecommerce-react/contents/public/data/products.json',
    { headers: { 'Authorization': `Bearer ${githubToken}` } }
  )
  const { sha } = await currentResponse.json()
  
  // 3. Overwrite products.json with backup content
  await fetch(
    'https://api.github.com/repos/artmusuem/ecommerce-react/contents/public/data/products.json',
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Reset products to Smithsonian backup',
        content: Buffer.from(backupContent).toString('base64'),
        sha
      })
    }
  )
  
  return res.json({ success: true })
}
```

---

## Multi-Platform Distribution

### Gallery Store as Source

Gallery Store products serve as the canonical source for distributing to other platforms. The StoresIndex page provides bulk push buttons.

```
Gallery Store (110 products)
         │
         ├──────────────────▶ WooCommerce
         │                    (Cloudinary proxy for images)
         │
         └──────────────────▶ Shopify
                              (Direct Smithsonian URLs)
```

### Bulk Push Flow

```typescript
// src/pages/stores/StoresIndex.tsx
async function handleBulkPush(targetPlatform: 'woocommerce' | 'shopify') {
  // 1. Find Gallery Store
  const galleryStore = stores.find(s => s.platform === 'gallery-store')
  
  // 2. Fetch all Gallery Store products
  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('store_id', galleryStore.id)
  
  // 3. Push each product
  for (const product of products) {
    if (targetPlatform === 'woocommerce') {
      const wooProduct = transformToWooCommerce(product)
      await pushProductToWooCommerce(credentials, wooProduct)
    } else {
      const shopifyProduct = transformToShopify(product)
      await pushToShopify(credentials, shopifyProduct)
    }
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}
```

### Image URL Handling by Platform

| Platform | Smithsonian URL Handling |
|----------|-------------------------|
| Gallery Store | ✅ Direct use (same-origin) |
| Shopify | ✅ Direct use (Shopify fetches & uploads to CDN) |
| WooCommerce | ⚠️ Requires Cloudinary proxy (no extension) |

---

## Smithsonian Image URLs

### URL Format

```
https://ids.si.edu/ids/deliveryService?id=SAAM-2019.6.7_1
```

### Characteristics
- No file extension
- Query string parameter for ID
- Returns JPEG with proper Content-Type header
- High-resolution images available

### Platform Compatibility

**Gallery Store:**
- Uses URLs directly
- Browser fetches from Smithsonian

**Shopify:**
- Accepts URL directly
- Downloads and uploads to `cdn.shopify.com`
- Converts to Shopify CDN URL

**WooCommerce:**
- Rejects URLs without extension
- Solution: Cloudinary fetch proxy

```typescript
// transforms.ts
if (url.includes('ids.si.edu')) {
  imageUrl = `https://res.cloudinary.com/dh4qwuvuo/image/fetch/${encodeURIComponent(url)}.jpg`
}
```

---

## Gallery Store JSON Format

### Product Schema

```json
{
  "id": "uuid-string",
  "title": "Portrait of Edward Musser",
  "description": "American artwork by...",
  "artist": "Thomas Eakins",
  "price": 45.00,
  "image_url": "https://ids.si.edu/ids/deliveryService?id=SAAM-2019.6.7_1",
  "category": "Art Print",
  "status": "active",
  "sku": "GS-ARTWORK-001"
}
```

### Full products.json Structure

```json
[
  {
    "id": "...",
    "title": "...",
    ...
  },
  {
    "id": "...",
    "title": "...",
    ...
  }
]
```

---

## Browser Caching Considerations

### The Problem

After publishing to Gallery Store, users may see stale data due to browser caching.

### Solutions Implemented

1. **Vercel Cache Headers:**
   - Short cache TTL for `products.json`
   - `Cache-Control: public, max-age=60, stale-while-revalidate=30`

2. **User Messaging:**
   - UI shows "Changes published! May take 30-60 seconds to appear."
   - Suggests hard refresh (Ctrl+Shift+R)

3. **Auto-Save Before Publish:**
   - Always save to Supabase before publishing
   - Prevents data loss if publish fails

---

## Authentication

### GitHub API Token

Gallery Store publishing uses a GitHub Personal Access Token with repo access.

```sql
-- stores table (gallery-store)
api_credentials: {
  "github_token": "github_pat_xxxxx",
  "repo": "artmusuem/ecommerce-react"
}
```

### Token Permissions Required

- `repo` - Full control of private repositories
- Or `public_repo` if repository is public

---

## Testing Checklist

- [ ] Import products from Smithsonian API
- [ ] Edit product in Commerce Hub
- [ ] Publish to Gallery Store
- [ ] Verify changes on live storefront (after cache clear)
- [ ] Reset to backup
- [ ] Bulk push to WooCommerce
- [ ] Bulk push to Shopify
- [ ] Verify images display on all platforms

---

## Repositories

| Project | URL | Purpose |
|---------|-----|---------|
| Commerce Hub | github.com/artmusuem/commerce-hub | Admin panel |
| Gallery Store | github.com/artmusuem/ecommerce-react | Storefront |

---

## Deployments

| Environment | URL |
|-------------|-----|
| Commerce Hub | commerce-hub-iota.vercel.app |
| Gallery Store | ecommerce-react-beta-woad.vercel.app |

---

## Smithsonian API Reference

- [Open Access API](https://api.si.edu/openaccess/api/v1.0)
- [Search Endpoint](https://api.si.edu/openaccess/api/v1.0/search)
- [Terms of Use](https://www.si.edu/openaccess)

---

## Related Documentation

- [Commerce Hub Architecture](./COMMERCE-HUB-ARCHITECTURE.md)
- [WooCommerce Integration](./WOOCOMMERCE-INTEGRATION.md)
- [Shopify Integration](./SHOPIFY-INTEGRATION.md)
