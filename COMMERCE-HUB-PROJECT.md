# Commerce Hub - Project Handoff

## New Chat Instructions

**First Message:**
```
Continuing Commerce Hub development. Project context is in Claude Project files.
Current priority: [state what you're working on]
```

---

## Project Overview

**Commerce Hub** is a multi-channel e-commerce admin panel that manages products across WooCommerce, Shopify, Etsy, and a custom Gallery Store from a single dashboard.

| Repository | URL | Deployment |
|------------|-----|------------|
| Commerce Hub (Admin) | github.com/artmusuem/commerce-hub | commerce-hub-iota.vercel.app |
| Gallery Store (Storefront) | github.com/artmusuem/ecommerce-react | ecommerce-react-beta-woad.vercel.app |

---

## Current Status (December 21, 2024)

| Platform | Connect | Import | Edit | Push | Tags/Categories |
|----------|---------|--------|------|------|-----------------|
| WooCommerce | ✅ | ✅ | ✅ | ✅ | ✅ Categories |
| Shopify | ✅ | ✅ | ✅ | ✅ | ✅ Tags + Product Type |
| Gallery Store | ✅ | ✅ | ✅ | ✅ | N/A |
| Etsy | ⏳ Pending API | - | - | - | - |

**Product Counts:**
- Shopify: 17 products
- WooCommerce: 35 products
- Gallery Store: 110 products

**Recent Wins:**
- Shopify full sync (import, edit, push)
- Tags sync bidirectionally with Shopify
- Platform-aware UI (shows relevant fields per platform)
- Upsert logic prevents duplicates on re-import

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      COMMERCE HUB                           │
│                   (React + TypeScript + Vite)               │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Products   │  │   Stores    │  │  Sync Logs  │         │
│  │   (CRUD)    │  │ (Connections)│  │  (History)  │         │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘         │
│         │                │                                  │
│         ▼                ▼                                  │
│  ┌─────────────────────────────────────────────────┐       │
│  │           Supabase (Postgres + Auth)            │       │
│  └─────────────────────────────────────────────────┘       │
│         │                │                                  │
│         ▼                ▼                                  │
│  ┌─────────────────────────────────────────────────┐       │
│  │         Vercel Serverless API Layer             │       │
│  │    (Token exchange, CORS proxy, secrets)        │       │
│  └─────────────────────────────────────────────────┘       │
└─────────┼────────────────┼──────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL PLATFORMS                        │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │WooCommerce│  │ Shopify  │  │  Etsy    │  │ Gallery  │   │
│  │ REST API │  │  Admin   │  │  (TBD)   │  │  Store   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## How We Work Together

### Development Methodology

**Senior Developer Approach:**
- Make architectural decisions upfront
- Clean, maintainable code over quick hacks
- Respect existing patterns in the codebase
- Move efficiently - don't lose time on small fixes
- Push forward with core functionality

### Iterated Steps Pattern

For each feature or fix:

```
1. PLAN
   └─ Define what we're building
   └─ Identify which files need changes
   └─ Understand dependencies

2. GATHER
   └─ Fetch current files from GitHub repo
   └─ Review existing code patterns
   └─ Check related files for context

3. IMPLEMENT
   └─ Make changes locally in /home/claude/
   └─ One file at a time
   └─ Follow existing code style

4. PUSH
   └─ Push via GitHub API
   └─ Meaningful commit message
   └─ Wait for Vercel auto-deploy (~30 seconds)

5. VERIFY
   └─ Check Vercel dashboard for build status
   └─ Test functionality in browser
   └─ Confirm no console errors

6. ITERATE OR PROCEED
   └─ If error → diagnose, fix, repeat
   └─ If success → next file or feature
```

### Git Push Workflow

```bash
# 1. Set token
export GH_TOKEN="github_pat_xxx"

# 2. Fetch current file
curl -s -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx" > /home/claude/file.tsx

# 3. Make edits to /home/claude/file.tsx

# 4. Get current SHA
SHA=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx" \
  | grep '"sha"' | head -1 | cut -d'"' -f4)

# 5. Push update
CONTENT=$(base64 -w 0 /home/claude/file.tsx)
curl -s -X PUT -H "Authorization: Bearer $GH_TOKEN" -H "Content-Type: application/json" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx" \
  -d "{\"message\": \"feat: description of change\", \"content\": \"$CONTENT\", \"sha\": \"$SHA\"}"
```

### Vercel Deploy Behavior

| Trigger | Result | Time |
|---------|--------|------|
| GitHub push | Auto-deploy | ~30 seconds |
| Build error | Deploy fails, serves OLD code | Immediate |
| TypeScript error | Build fails silently | Check dashboard |

**Critical:** Unused imports cause TypeScript build failures. Vercel serves cached old code when builds fail - always verify deployment succeeded.

### Error Recovery Pattern

```
Error detected
    ↓
STOP - don't rapid-fire fixes
    ↓
Check Vercel dashboard for build status
    ↓
Read error message carefully
    ↓
Fetch fresh copy of file from repo
    ↓
Make targeted fix
    ↓
Push and verify
```

---

## Key Patterns

### 1. The `external_id` Pattern (Critical)

Prevents duplicate products when syncing:

```typescript
// On IMPORT: Check if exists first
const { data: existing } = await supabase
  .from('products')
  .select('id')
  .eq('store_id', storeId)
  .eq('external_id', String(platformProduct.id))
  .single()

if (existing) {
  // UPDATE existing
  await supabase.from('products').update(productData).eq('id', existing.id)
} else {
  // INSERT new
  await supabase.from('products').insert({
    ...productData,
    external_id: String(platformProduct.id)
  })
}

// On PUSH: Use external_id to determine PUT vs POST
if (product.external_id) {
  await api.put(`/products/${product.external_id}`, payload)
} else {
  const response = await api.post('/products', payload)
  await supabase.from('products').update({ 
    external_id: String(response.id) 
  }).eq('id', product.id)
}
```

### 2. Platform-Aware Attributes

```typescript
// Shopify: attributes stored as object
attributes: {
  shopify_tags: "tag1, tag2, tag3",
  platform: "shopify"
}

// WooCommerce: attributes stored as array
attributes: [
  { name: "Size", options: ["S", "M", "L"] },
  { name: "Color", options: ["Red", "Blue"] }
]

// On load, detect format:
if (Array.isArray(attrs)) {
  setAttributes(attrs)  // WooCommerce
} else if (attrs?.platform === 'shopify') {
  setShopifyTags(attrs.shopify_tags)  // Shopify
}

// On save, use platform check:
if (productPlatform === 'shopify') {
  attributesToSave = { shopify_tags, platform: 'shopify' }
} else {
  attributesToSave = attributes  // array
}
```

### 3. Serverless API Proxy

All platform API calls route through `/api/{platform}/` to:
- Hide API secrets from browser
- Handle CORS
- Transform requests/responses

```
Browser → /api/shopify/products.js → Shopify Admin API
                    ↓
         (adds access token, handles errors)
```

---

## File Structure

```
commerce-hub/
├── api/                              # Vercel serverless functions
│   ├── gallery-store/
│   │   ├── push.js                   # Push JSON to GitHub
│   │   └── reset.js                  # Reset to default data
│   ├── shopify/
│   │   ├── token.js                  # OAuth token exchange
│   │   └── products.js               # Products CRUD proxy
│   └── woocommerce/
│       ├── push.js                   # Product sync
│       ├── variations.js             # Get variations
│       └── variation-update.js       # Update variation price
├── src/
│   ├── lib/
│   │   ├── supabase.ts               # Supabase client
│   │   ├── woocommerce.ts            # WooCommerce API wrapper
│   │   ├── shopify.ts                # Shopify API wrapper
│   │   └── transforms.ts             # Product format converters
│   ├── pages/
│   │   ├── products/
│   │   │   ├── ProductsIndex.tsx     # Product grid with platform tabs
│   │   │   ├── ProductEdit.tsx       # Edit + Push (platform-aware)
│   │   │   └── ProductNew.tsx        # Create new product
│   │   └── stores/
│   │       ├── StoresIndex.tsx       # Connected stores + Import buttons
│   │       ├── WooCommerceConnect.tsx    # WooCommerce import
│   │       ├── ShopifyConnect.tsx        # Shopify OAuth start
│   │       ├── ShopifyCallback.tsx       # Shopify OAuth callback
│   │       ├── ShopifyImport.tsx         # Import from Shopify
│   │       └── ImportStore.tsx           # Gallery Store import
│   └── App.tsx                       # Routes
└── public/
```

---

## Database Schema

```sql
-- products: Central product catalog
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users,
  store_id        UUID REFERENCES stores(id),
  external_id     TEXT,              -- Platform's product ID
  title           TEXT NOT NULL,
  description     TEXT,
  price           DECIMAL(10,2),
  artist          TEXT,
  category        TEXT,
  image_url       TEXT,
  sku             TEXT,
  status          TEXT DEFAULT 'draft',
  attributes      JSONB,             -- Platform-specific (array or object)
  product_type    TEXT,              -- simple, variable, etc.
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- stores: Connected platform credentials
CREATE TABLE stores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users,
  platform        TEXT NOT NULL,     -- 'woocommerce', 'shopify', 'gallery-store', 'etsy'
  store_name      TEXT,
  store_url       TEXT,
  api_credentials JSONB,             -- Platform-specific auth
  is_connected    BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

---

## Credentials Reference

**Credentials are in Claude Project files:** `CREDENTIALS-PRIVATE.md`

Contains:
- GitHub token (for pushing code)
- Supabase keys (anon + service role)
- WooCommerce consumer key/secret
- Shopify app credentials
- Etsy API key (pending)

---

## Roadmap

### ✅ COMPLETE
- [x] Supabase + Auth
- [x] Products CRUD
- [x] WooCommerce full sync (import, edit, push, variations)
- [x] Shopify full sync (OAuth, import, edit, push, tags)
- [x] Gallery Store full sync (publish to GitHub, reset)
- [x] Platform-aware UI

### ⏳ BLOCKED
- [ ] Etsy integration - waiting on API approval

### 📋 TODO
- [ ] WooCommerce category mapping (name → ID)
- [ ] Bulk operations (edit multiple products)
- [ ] Inventory sync
- [ ] Order management
- [ ] Image upload (currently URL-only)

---

## Quick Reference

### Test Login
```
URL: https://commerce-hub-iota.vercel.app
Email: admin@gallerystore.com
Password: CommerceHub2024!
```

### Key URLs
- Commerce Hub: https://commerce-hub-iota.vercel.app
- Gallery Store: https://ecommerce-react-beta-woad.vercel.app
- Supabase Dashboard: https://supabase.com/dashboard/project/owfyxfeaialumomzsejd
- Supabase SQL Editor: https://supabase.com/dashboard/project/owfyxfeaialumomzsejd/sql/new

### Connected Stores
- Shopify: dev-store-749237498237498787.myshopify.com
- WooCommerce: rapidwoo.com/commerce
- Gallery Store: ecommerce-react-beta-woad.vercel.app

### Documentation
- WooCommerce REST API: https://woocommerce.github.io/woocommerce-rest-api-docs/
- Shopify Admin API: https://shopify.dev/docs/api/admin-rest
- Supabase Docs: https://supabase.com/docs

---

## Your Pull Command

After each session:
```cmd
cd C:\xampp\htdocs\commerce-hub
git pull origin main
```

---

*Last Updated: December 21, 2024*
*Status: WooCommerce + Shopify + Gallery Store fully working*
