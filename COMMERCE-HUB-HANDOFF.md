# Commerce Hub - Multi-Channel E-Commerce Management

## Quick Start for New Chat Sessions

**First message to Claude:**
```
I'm continuing work on Commerce Hub. Please read the handoff doc:
/mnt/project/COMMERCE-HUB-HANDOFF.md
```

**Credentials are in:** `/mnt/project/CREDENTIALS-PRIVATE.md`

---

## Project Overview

**What Commerce Hub Does:**
Central admin panel to manage products across multiple e-commerce platforms from one dashboard.

**Architecture:**
```
┌─────────────────────────────────────────────────────────────┐
│                      COMMERCE HUB                           │
│                   (React + Supabase)                        │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Products   │  │   Stores    │  │  Sync Logs  │         │
│  │   Table     │  │   Table     │  │   Table     │         │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘         │
│         │                │                                  │
└─────────┼────────────────┼──────────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL PLATFORMS                        │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │WooCommerce│  │ Shopify  │  │  Etsy    │  │ Gallery  │   │
│  │ REST API │  │   OAuth  │  │  OAuth   │  │  Store   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Current Status (December 20, 2024)

| Platform | Connect | Import | Edit | Push Back |
|----------|---------|--------|------|-----------|
| WooCommerce | ✅ | ✅ | ✅ | ✅ |
| Shopify | ✅ | ✅ | ✅ | ❌ TODO |
| Gallery Store | ✅ | ✅ | ✅ | ✅ |
| Etsy | ⏳ Pending API | - | - | - |

**Product Counts:**
- Shopify: 17 products
- WooCommerce: 35 products  
- Gallery Store: 110 products

---

## Repositories

| Project | GitHub URL | Purpose |
|---------|------------|---------|
| Commerce Hub | https://github.com/artmusuem/commerce-hub | Admin panel (this project) |
| Gallery Store | https://github.com/artmusuem/ecommerce-react | Customer storefront |
| WooCommerce Fork | https://github.com/artmusuem/woocommerce | Reference for CSV formats |

---

## Deployments

| Environment | URL | Auto-Deploy |
|-------------|-----|-------------|
| Commerce Hub | https://commerce-hub-iota.vercel.app | Yes (GitHub push) |
| Gallery Store | https://ecommerce-react-beta-woad.vercel.app | Yes (GitHub push) |

---

## Database (Supabase)

**Project:** https://supabase.com/dashboard/project/owfyxfeaialumomzsejd

**Schema:**
```sql
-- products table
id              UUID PRIMARY KEY
user_id         UUID REFERENCES auth.users
store_id        UUID REFERENCES stores(id)
external_id     TEXT              -- Platform's product ID (for updates)
title           TEXT NOT NULL
description     TEXT
price           DECIMAL
artist          TEXT
category        TEXT
image_url       TEXT
sku             TEXT
status          TEXT DEFAULT 'draft'
attributes      JSONB             -- WooCommerce attributes/variations
created_at      TIMESTAMP
updated_at      TIMESTAMP

-- stores table
id              UUID PRIMARY KEY
user_id         UUID REFERENCES auth.users
platform        TEXT              -- 'woocommerce', 'shopify', 'gallery-store', 'etsy'
store_name      TEXT
store_url       TEXT
api_credentials JSONB             -- Platform-specific auth
is_connected    BOOLEAN
created_at      TIMESTAMP
```

---

## Code Architecture

### Key Files

```
commerce-hub/
├── api/
│   ├── gallery-store/
│   │   ├── push.js              # Push JSON to GitHub
│   │   └── reset.js             # Reset to default JSON
│   ├── shopify/
│   │   ├── token.js             # OAuth token exchange
│   │   └── products.js          # Products API proxy (CORS)
│   └── woocommerce/
│       └── push.js              # Push products to WooCommerce
├── src/
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client
│   │   ├── woocommerce.ts       # WooCommerce API wrapper
│   │   ├── shopify.ts           # Shopify API wrapper
│   │   └── transforms.ts        # Product format converters
│   └── pages/
│       ├── products/
│       │   ├── ProductsIndex.tsx    # Product list with filters
│       │   ├── ProductEdit.tsx      # Edit + Save & Publish
│       │   └── ProductNew.tsx       # Create new product
│       └── stores/
│           ├── StoresIndex.tsx      # Store list + Import buttons
│           ├── WooCommerceConnect.tsx   # WooCommerce import
│           ├── ShopifyConnect.tsx       # Shopify OAuth start
│           ├── ShopifyCallback.tsx      # Shopify OAuth callback
│           ├── ShopifyImport.tsx        # Import from Shopify
│           └── ImportStore.tsx          # Gallery Store import
```

---

## Platform Integrations

### WooCommerce (✅ Full Sync)

**Test Store:** https://rapidwoo.com/commerce

**Flow:**
```
Import: WooCommerceConnect.tsx → Supabase
Push:   ProductEdit.tsx → api/woocommerce/push.js → WooCommerce API
```

**What Works:**
- ✅ Import products with external_id
- ✅ Push updates (title, price, description, attributes)
- ✅ Update vs Create logic via external_id
- ✅ Variation price editing

**TODO:**
- ❌ Category sync (WooCommerce uses IDs)
- ❌ Image updates

### Shopify (✅ Import Working)

**Connected Store:** dev-store-749237498237498787.myshopify.com

**Flow:**
```
OAuth:  ShopifyConnect.tsx → Shopify → ShopifyCallback.tsx → Save token
Import: ShopifyImport.tsx → api/shopify/products.js → Supabase
Push:   TODO
```

**What Works:**
- ✅ OAuth flow (app installed in Shopify admin)
- ✅ Token storage in Supabase
- ✅ Product import via serverless proxy

**TODO:**
- ❌ Push products back to Shopify

### Gallery Store (✅ Full Sync)

**Storefront:** https://ecommerce-react-beta-woad.vercel.app

**Flow:**
```
Edit in Commerce Hub → Click "Save & Publish" → 
Push JSON to GitHub → Vercel auto-deploys → Live in ~30 seconds
```

**Collections:**
| Artist | external_id | JSON File |
|--------|-------------|-----------|
| Winslow Homer | `winslow-homer` | winslow-homer.json |
| Mary Cassatt | `mary-cassatt` | mary-cassatt.json |
| Thomas Cole | `thomas-cole` | thomas-cole.json |
| Frederic Remington | `frederic-remington` | frederic-remington.json |
| Georgia O'Keeffe | `georgia-okeeffe` | georgia-okeeffe.json |
| Edward Hopper | `edward-hopper` | edward-hopper.json |

**Backup System:**
- `winslow-homer.json` ← Editable, published
- `winslow-homer.default.json` ← Original Smithsonian data
- "Reset to Demo" restores from .default.json

### Etsy (⏳ Pending)

Awaiting API approval from Etsy.

---

## The external_id Pattern (Critical)

This is how we avoid creating duplicates when syncing:

```typescript
// On IMPORT: Save the platform's product ID
external_id: String(shopifyProduct.id)  // "12345"

// On PUSH: Check external_id to determine PUT vs POST
if (external_id) {
  // UPDATE existing product
  PUT /products/{external_id}
} else {
  // CREATE new product
  POST /products
}
```

---

## UX Patterns

### Save vs Publish
- **Save Changes** (blue button): Saves to Supabase only, stays on page
- **Save & Publish** (green button): Auto-saves to Supabase, then pushes to external store

### Product Filtering
Products page has tabs: All | Shopify | WooCommerce | Gallery Store

---

## Known Issues & Solutions

### Issue: Vercel build fails silently
**Cause:** Unused imports cause TypeScript errors (e.g., `useNavigate` imported but not used)
**Fix:** Always remove unused imports. Check Vercel dashboard for build status.

### Issue: Import doesn't save products
**Cause:** Using `upsert` with `onConflict` on columns without unique constraint
**Fix:** Use `insert` instead of `upsert` for imports

### Issue: Browser shows stale data
**Cause:** Browser caching fetch requests
**Fix:** Gallery Store has `Cache-Control: max-age=0, must-revalidate` headers. For Commerce Hub, hard refresh: `Ctrl+Shift+R`

### Issue: "WooCommerce API credentials not found"
**Cause:** Store record exists but `api_credentials` is NULL
**Fix:** Reconnect via WooCommerceConnect page

---

## Development Workflow

### Making Changes

1. **Fetch current file:**
```bash
curl -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx"
```

2. **Edit locally in /home/claude/**

3. **Push via GitHub API:**
```bash
SHA=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx" \
  | grep '"sha"' | head -1 | cut -d'"' -f4)

CONTENT=$(base64 -w 0 /home/claude/file.tsx)
curl -X PUT -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx" \
  -d "{\"message\": \"fix: description\", \"content\": \"$CONTENT\", \"sha\": \"$SHA\"}"
```

4. **Check Vercel dashboard** for build success/failure

5. **Wait ~30 seconds** for deploy

### Rules

- **ONE file at a time** - Don't batch changes
- **Check Vercel builds** - Silent failures are common
- **Remove unused imports** - TypeScript will fail the build
- **Meaningful commits** - Not "fix" "fix2" "fix3"

---

## Roadmap

### ✅ COMPLETE
- [x] Supabase + Auth
- [x] Products CRUD
- [x] Store connections (WooCommerce, Shopify, Gallery Store)
- [x] WooCommerce import/push
- [x] Shopify OAuth + import
- [x] Gallery Store publish/reset
- [x] WooCommerce variation editing

### 🔄 IN PROGRESS
- [ ] Shopify push (edit → update in Shopify)

### 📋 TODO
- [ ] WooCommerce category sync
- [ ] Etsy integration (pending API approval)
- [ ] Bulk operations
- [ ] Inventory sync
- [ ] Order management

---

## Test Credentials

**Commerce Hub Login:**
```
Email: admin@gallerystore.com
Password: CommerceHub2024!
```

**See CREDENTIALS-PRIVATE.md for API keys**

---

## Reference Links

- WooCommerce REST API: https://woocommerce.github.io/woocommerce-rest-api-docs/
- Shopify Admin API: https://shopify.dev/docs/api/admin-rest
- Supabase Docs: https://supabase.com/docs
- Vercel Serverless: https://vercel.com/docs/functions

---

## Session History

| Date | Focus | Key Changes |
|------|-------|-------------|
| Dec 20, 2024 (Session 3) | Shopify import | ShopifyImport.tsx, api/shopify/products.js, fixed upsert→insert |
| Dec 20, 2024 (Session 2) | Gallery Store bugs | Collection mapping, cache headers, auto-save UX |
| Dec 20, 2024 (Session 1) | WooCommerce variations | Inline price editing, variation sync |

---

*Last Updated: December 20, 2024*
*Next Task: Shopify push (edit products back to Shopify)*
