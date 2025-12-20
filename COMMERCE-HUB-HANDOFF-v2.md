# Commerce Hub - Senior Developer Handoff

**Date:** December 20, 2024  
**Status:** Phase 1 Complete - Multi-Channel Sync Validated  
**Next:** Phase 2 - Production-Grade Category Mapping & Spreadsheet UI

---

## Quick Start for New Chat

**First action in any new chat - read these files from repo:**
```
1. /mnt/project/COMMERCE-HUB-HANDOFF-v2.md (this file - upload to project)
2. src/lib/woocommerce.ts (API integration)
3. src/lib/transforms.ts (product transformation)
4. src/pages/products/ProductEdit.tsx (push flow)
5. src/pages/stores/WooCommerceConnect.tsx (import flow)
```

**Clone and run locally:**
```bash
cd C:\xampp\htdocs
git clone https://github.com/artmusuem/commerce-hub.git
cd commerce-hub
npm install
npm run dev
```

---

## What We Proved Works

| Feature | Status | Evidence |
|---------|--------|----------|
| WooCommerce Import | ✅ | Products pulled via REST API, saved to Supabase |
| WooCommerce Push (Create) | ✅ | New products created in WooCommerce |
| WooCommerce Push (Update) | ✅ | Existing products updated via `external_id` |
| Title sync | ✅ | Updates reflect in WooCommerce |
| Price sync | ✅ | Updates reflect in WooCommerce |
| Description sync | ✅ | Updates reflect in WooCommerce |
| Category sync | ❌ | Requires category ID mapping (not text) |
| Image sync | ⚠️ | Works but slow (WooCommerce downloads image) |
| Shopify OAuth | ✅ | Token exchange working |
| Shopify Push | ✅ | Products created in Shopify |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        COMMERCE HUB                              │
│                   (Central Admin Panel)                          │
│         https://commerce-hub-iota.vercel.app                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│   │  Supabase   │    │   React     │    │   Vercel    │        │
│   │  Database   │◄──►│   Frontend  │◄──►│  Serverless │        │
│   │  (Postgres) │    │  (Vite+TS)  │    │  Functions  │        │
│   └─────────────┘    └─────────────┘    └─────────────┘        │
│          │                                     │                 │
└──────────┼─────────────────────────────────────┼─────────────────┘
           │                                     │
           ▼                                     ▼
    ┌──────────────┐                    ┌──────────────┐
    │   Products   │                    │   External   │
    │    Table     │                    │    APIs      │
    │              │                    │              │
    │ - id (UUID)  │                    │ - WooCommerce│
    │ - external_id│◄───────────────────│ - Shopify    │
    │ - store_id   │                    │ - Etsy       │
    │ - title      │                    │ - Gallery    │
    │ - price      │                    │   Store JSON │
    │ - category   │                    └──────────────┘
    │ - image_url  │
    └──────────────┘
```

**Data Flow:**
1. **Import:** External Platform → API → Transform → Supabase (save `external_id`)
2. **Edit:** Supabase → Commerce Hub UI → User makes changes
3. **Push:** Commerce Hub → Transform → API → External Platform (use `external_id` for UPDATE)

---

## Repositories

| Repo | URL | Purpose |
|------|-----|---------|
| Commerce Hub | https://github.com/artmusuem/commerce-hub | Main admin panel |
| Gallery Store | https://github.com/artmusuem/ecommerce-react | Customer storefront |
| WooCommerce Fork | https://github.com/artmusuem/woocommerce | Reference for CSV format |

**Local Paths (Windows):**
```
C:\xampp\htdocs\commerce-hub
C:\xampp\htdocs\ecommerce-react
```

---

## Credentials

### GitHub
```
Account: artmusuem
Token: [GITHUB_TOKEN - see local .env]
```

### Supabase
```
Project ID: owfyxfeaialumomzsejd
URL: https://owfyxfeaialumomzsejd.supabase.co
Dashboard: https://supabase.com/dashboard/project/owfyxfeaialumomzsejd

Anon Key: [SUPABASE_ANON_KEY - see local .env]

Service Role: [SUPABASE_SERVICE_KEY - see local .env]
```

### WooCommerce (rapidwoo.com/commerce)
```
Site URL: https://rapidwoo.com/commerce
Consumer Key: [WOOCOMMERCE_KEY - see local .env]
Consumer Secret: [WOOCOMMERCE_SECRET - see local .env]
API Base: https://rapidwoo.com/commerce/wp-json/wc/v3/
```

### Vercel
```
Commerce Hub: https://commerce-hub-iota.vercel.app
Gallery Store: https://ecommerce-react-beta-woad.vercel.app
```

### Cloudinary
```
Cloud Name: dh4qwuvuo
```

### Etsy (Pending Approval)
```
API Key: f62jww52kg2gsi4fzd63q1pv
Shared Secret: qf4aq6xb31
```

### Test User (Commerce Hub Login)
```
Email: admin@gallerystore.com
Password: CommerceHub2024!
```

---

## Database Schema

### stores
```sql
CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  platform TEXT NOT NULL,  -- 'woocommerce', 'shopify', 'gallery-store', 'etsy'
  store_name TEXT,
  store_url TEXT,
  api_credentials JSONB,   -- {"consumer_key": "...", "consumer_secret": "..."}
  is_connected BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);
```

### products
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  store_id UUID REFERENCES stores(id),
  external_id TEXT,        -- WooCommerce/Shopify product ID for sync
  title TEXT NOT NULL,
  description TEXT,
  price DECIMAL,
  artist TEXT,
  category TEXT,
  image_url TEXT,
  sku TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

**Key insight:** `external_id` enables UPDATE vs CREATE logic:
- Has `external_id` → PUT to existing product
- No `external_id` → POST creates new product

---

## Critical Code Patterns

### 1. Push with Update Detection (woocommerce.ts)
```typescript
export async function pushProductToWooCommerce(
  credentials: WooCommerceCredentials,
  product: WooCommercePushPayload,
  existingProductId?: number  // ← This triggers UPDATE vs CREATE
): Promise<WooCommerceProduct> {
  const response = await fetch('/api/woocommerce/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentials,
      product,
      existingProductId  // ← Passed to serverless function
    })
  })
  return response.json()
}
```

### 2. Serverless Push Handler (api/woocommerce/push.js)
```javascript
const { credentials, product, existingProductId } = req.body

const isUpdate = !!existingProductId
const endpoint = isUpdate
  ? `${baseUrl}/wp-json/wc/v3/products/${existingProductId}`  // PUT
  : `${baseUrl}/wp-json/wc/v3/products`                        // POST
const method = isUpdate ? 'PUT' : 'POST'
```

### 3. Import with external_id (WooCommerceConnect.tsx)
```typescript
const base = {
  user_id: user.id,
  title: p.name,
  price: parseFloat(p.price),
  external_id: String(p.id),  // ← Store WooCommerce ID for sync
  // ...
}
```

---

## WooCommerce CSV Format Reference

From `sample_products.csv`:
```csv
ID,Type,SKU,Name,Published,Regular price,Sale price,Categories,Images,...
44,variable,woo-vneck-tee,"V-Neck T-Shirt",1,20,15,"Clothing > Tshirts",https://...
```

**Key fields:**
- `ID` - For updates (matches WooCommerce product ID)
- `Categories` - Text format with `>` for hierarchy: `"Parent > Child"`
- `Images` - Comma-separated URLs

**Category handling:**
- CSV Import: WooCommerce auto-creates categories from text
- API Push: Requires category ID (must fetch/map first)

---

## What Needs to Be Built

### Phase 2: Category Mapping
```
1. Fetch WooCommerce categories: GET /wp-json/wc/v3/products/categories
2. Cache in Supabase or local state
3. UI: Dropdown showing real WooCommerce categories
4. Transform: Map category name → category ID before push
```

### Phase 3: Spreadsheet UI (like WP Sheet Editor)
```
1. Replace individual edit page with data grid
2. Libraries: react-data-grid, ag-grid, or handsontable
3. Inline cell editing → auto-save to Supabase
4. Bulk actions: select rows → push to store
```

### Phase 4: Additional Platforms
```
- Etsy: Waiting on API approval
- Amazon SP-API: Complex auth, high value
- Printful: Fulfillment integration
```

---

## Best Practices Learned

### DO:
1. **Store external_id on import** - enables update sync
2. **Store api_credentials in stores table** - don't hardcode
3. **Use serverless for API calls** - keeps secrets server-side
4. **One change at a time** - validate each deployment
5. **Check database state first** - many bugs are missing columns/data

### DON'T:
1. **Rapid-fire fixes** - causes rollback hell
2. **Assume columns exist** - always check Supabase schema
3. **Skip the fallback handling** - optional columns may not exist
4. **Hardcode credentials** - use environment variables or database

---

## Deployment Process

```bash
# 1. Make changes locally
npm run dev  # Test at localhost:5173

# 2. Push to GitHub (auto-deploys to Vercel)
git add .
git commit -m "feat: description of change"
git push origin main

# 3. Verify deployment
# Wait 30-60 seconds, check https://commerce-hub-iota.vercel.app

# 4. If broken, rollback
git revert HEAD
git push origin main
```

---

## File Reference

| File | Purpose |
|------|---------|
| `src/lib/supabase.ts` | Supabase client config |
| `src/lib/woocommerce.ts` | WooCommerce API functions |
| `src/lib/shopify.ts` | Shopify API functions |
| `src/lib/transforms.ts` | Product format transformations |
| `src/pages/products/ProductEdit.tsx` | Edit + Push UI |
| `src/pages/stores/WooCommerceConnect.tsx` | WooCommerce import |
| `src/pages/stores/ShopifyConnect.tsx` | Shopify OAuth |
| `api/woocommerce/push.js` | Serverless push handler |
| `api/shopify/token.js` | Shopify OAuth token exchange |

---

## Testing Checklist

### WooCommerce Sync
- [ ] Import products from WooCommerce
- [ ] Verify `external_id` saved in Supabase
- [ ] Edit product title in Commerce Hub
- [ ] Push to WooCommerce
- [ ] Verify UPDATE (not duplicate) in WooCommerce admin

### Database
- [ ] `products` table has `external_id` column
- [ ] `stores` table has `api_credentials` with WooCommerce keys
- [ ] Store-product relationship via `store_id`

---

## Links

- **Commerce Hub Live:** https://commerce-hub-iota.vercel.app
- **Gallery Store Live:** https://ecommerce-react-beta-woad.vercel.app
- **Supabase Dashboard:** https://supabase.com/dashboard/project/owfyxfeaialumomzsejd
- **GitHub Repo:** https://github.com/artmusuem/commerce-hub
- **WooCommerce API Docs:** https://woocommerce.github.io/woocommerce-rest-api-docs/
- **WooCommerce CSV Sample:** https://github.com/artmusuem/woocommerce/tree/trunk/plugins/woocommerce/sample-data

---

## Session Summary (December 20, 2024)

**Problem:** Push to WooCommerce created duplicates instead of updating.

**Root Cause:** 
1. `external_id` not saved during import
2. `external_id` not passed to push function
3. `api_credentials` not stored in database

**Solution:**
1. Added `external_id` column to products table
2. Modified import to save WooCommerce product ID as `external_id`
3. Modified push to load and pass `external_id`
4. Stored API credentials in stores table

**Result:** Updates now work correctly. Title, price, description sync. Category requires additional work (ID mapping).

---

*Last Updated: December 20, 2024*
*Author: Claude + Charles*
