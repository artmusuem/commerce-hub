# Commerce Hub - Multi-Channel E-Commerce Management

## Quick Start for New Chat Sessions

**First message to Claude:**
```
I'm continuing work on Commerce Hub. Please read these files:
1. /mnt/project/COMMERCE-HUB-HANDOFF.md (this file - upload to project)
2. Fetch from repo: src/pages/products/ProductEdit.tsx
3. Fetch from repo: src/pages/stores/WooCommerceConnect.tsx
4. Fetch from repo: src/lib/transforms.ts
5. Fetch from repo: src/lib/woocommerce.ts
```

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

## Repositories

| Project | GitHub URL | Purpose |
|---------|------------|---------|
| Commerce Hub | https://github.com/artmusuem/commerce-hub | Admin panel (this project) |
| Gallery Store | https://github.com/artmusuem/ecommerce-react | Customer storefront |
| WooCommerce Fork | https://github.com/artmusuem/woocommerce | Reference for CSV formats |

**GitHub Token:**
```
GITHUB_TOKEN_IN_ENV
```

---

## Deployments

| Environment | URL | Auto-Deploy |
|-------------|-----|-------------|
| Commerce Hub | https://commerce-hub-iota.vercel.app | Yes (GitHub push) |
| Gallery Store | https://ecommerce-react-beta-woad.vercel.app | Yes (GitHub push) |

---

## Database (Supabase)

**Project:** https://supabase.com/dashboard/project/owfyxfeaialumomzsejd

**Connection:**
```
Host: db.owfyxfeaialumomzsejd.supabase.co
Port: 5432
Database: postgres
```

**API Keys:**
```
URL: https://owfyxfeaialumomzsejd.supabase.co
Anon Key: SUPABASE_KEY_IN_ENV
Service Role: SUPABASE_KEY_IN_ENV
```

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

## Platform Integrations

### WooCommerce (✅ Working)

**Test Store:** https://rapidwoo.com/commerce

**Credentials:**
```
Consumer Key: ck_YOUR_CONSUMER_KEY
Consumer Secret: cs_YOUR_CONSUMER_SECRET
```

**API Endpoints:**
```
GET  /wp-json/wc/v3/products           - List products
POST /wp-json/wc/v3/products           - Create product
PUT  /wp-json/wc/v3/products/{id}      - Update product
GET  /wp-json/wc/v3/products/categories - List categories
```

**What Works:**
- ✅ Import products from WooCommerce to Supabase
- ✅ Push product updates (title, price, description)
- ✅ external_id tracking for update-vs-create logic

**What Needs Work:**
- ❌ Categories (WooCommerce uses IDs, we send nothing)
- ❌ Attributes/Variations
- ❌ Images on update

**CSV Format Reference:**
```
plugins/woocommerce/sample-data/sample_products.csv
Key: Categories column uses "Parent > Child" text format
```

### Shopify (✅ OAuth Working)

**App Credentials (Vercel env vars):**
```
SHOPIFY_API_KEY=your_key
SHOPIFY_API_SECRET=your_secret
```

**What Works:**
- ✅ OAuth flow
- ✅ Token storage in Supabase
- ✅ Basic product push

### Etsy (⏳ Pending API Approval)

**Credentials:**
```
API Key: ETSY_API_KEY_IN_ENV
Shared Secret: ETSY_SECRET_IN_ENV
```

### Gallery Store (✅ Working)

**What it is:** JSON-based import from Smithsonian API artwork

---

## Code Architecture

### Key Files

```
commerce-hub/
├── api/
│   └── woocommerce/
│       └── push.js              # Serverless function - handles PUT vs POST
├── src/
│   ├── lib/
│   │   ├── supabase.ts          # Supabase client
│   │   ├── woocommerce.ts       # WooCommerce API wrapper
│   │   ├── shopify.ts           # Shopify API wrapper
│   │   └── transforms.ts        # Product format converters
│   └── pages/
│       ├── products/
│       │   └── ProductEdit.tsx  # Edit product + Push to Store
│       └── stores/
│           └── WooCommerceConnect.tsx  # Import from WooCommerce
```

### Data Flow: Push to WooCommerce

```
ProductEdit.tsx
    │
    ├─ Load product from Supabase (includes external_id)
    │
    ├─ User clicks "Push to Store"
    │
    ├─ transforms.ts: transformToWooCommerce(product)
    │       │
    │       └─ Converts Commerce Hub format → WooCommerce format
    │
    ├─ woocommerce.ts: pushProductToWooCommerce(creds, payload, external_id?)
    │       │
    │       └─ POST to /api/woocommerce/push
    │
    └─ api/woocommerce/push.js
            │
            ├─ If external_id exists → PUT /products/{id} (UPDATE)
            │
            └─ If no external_id → POST /products (CREATE)
```

### The external_id Pattern (Critical)

This is how we avoid creating duplicates:

```typescript
// On IMPORT: Save the platform's product ID
external_id: String(wooProduct.id)  // "12345"

// On PUSH: Pass it to determine PUT vs POST
await pushProductToWooCommerce(
  credentials,
  transformedProduct,
  external_id ? parseInt(external_id) : undefined  // ← This triggers UPDATE
)
```

---

## What We Proved Works

1. **WooCommerce REST API** - Full CRUD via serverless proxy
2. **Update vs Create** - external_id pattern works
3. **Supabase as central DB** - Products table with store relationships
4. **OAuth flows** - Shopify working, Etsy pending approval
5. **Vercel serverless** - Token exchange, API proxying

---

## Known Issues & Solutions

### Issue: "WooCommerce API credentials not found"
**Cause:** Store record exists but `api_credentials` is NULL
**Fix:** Run SQL:
```sql
UPDATE stores 
SET api_credentials = '{"consumer_key": "ck_YOUR_CONSUMER_KEYxxx", "consumer_secret": "cs_YOUR_CONSUMER_SECRETxxx"}'::jsonb
WHERE platform = 'woocommerce';
```

### Issue: Push creates duplicates instead of updating
**Cause:** `external_id` not saved on import or not passed on push
**Fix:** Ensure WooCommerceConnect.tsx saves `external_id: String(p.id)`

### Issue: Categories not syncing
**Cause:** WooCommerce expects `categories: [{id: 15}]`, we send nothing
**Status:** TODO - need to fetch categories first, match by name

---

## Development Workflow

### Making Changes

1. **Fetch current file from repo:**
```bash
curl -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx"
```

2. **Make changes locally in /home/claude/**

3. **Push via GitHub API:**
```bash
# Get current SHA
SHA=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx" \
  | grep '"sha"' | head -1 | cut -d'"' -f4)

# Push update
CONTENT=$(base64 -w 0 /home/claude/file.tsx)
curl -X PUT -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx" \
  -d "{\"message\": \"fix: description\", \"content\": \"$CONTENT\", \"sha\": \"$SHA\"}"
```

4. **Wait for Vercel auto-deploy (~30 seconds)**

5. **Verify:** Check https://commerce-hub-iota.vercel.app

### Rules

- **ONE file at a time** - Don't batch changes
- **STOP on errors** - Don't rapid-fire fixes
- **Verify deployment** - Check Vercel before next change
- **Meaningful commits** - Not "fix" "fix2" "fix3"

---

## Roadmap

### Phase 1: Foundation ✅ COMPLETE
- [x] Supabase + Auth
- [x] Products CRUD
- [x] Store connections
- [x] WooCommerce import/push
- [x] Shopify OAuth

### Phase 2: Full WooCommerce Sync (NEXT)
- [ ] Fetch WooCommerce categories on connect
- [ ] Store categories in Supabase (or cache)
- [ ] Match category by name on push
- [ ] Two-way sync (pull changes from WooCommerce)
- [ ] Bulk operations

### Phase 3: Multi-Platform Parity
- [ ] Shopify full product sync
- [ ] Etsy integration (after approval)
- [ ] Unified product schema across platforms

### Phase 4: Advanced Features
- [ ] Inventory sync
- [ ] Order management
- [ ] CSV export/import
- [ ] Spreadsheet-style editing (like WP Sheet Editor)

---

## Test Credentials

**Commerce Hub Login:**
```
Email: admin@gallerystore.com
Password: CommerceHub2024!
```

---

## Reference Links

- WooCommerce REST API: https://woocommerce.github.io/woocommerce-rest-api-docs/
- WooCommerce CSV Format: https://github.com/artmusuem/woocommerce/tree/trunk/plugins/woocommerce/sample-data
- Shopify Admin API: https://shopify.dev/docs/api/admin-rest
- Supabase Docs: https://supabase.com/docs
- Vercel Serverless: https://vercel.com/docs/functions

---

## File Checksums (for verification)

After successful deployment (commit b422369):
- WooCommerceConnect.tsx - saves external_id + api_credentials
- ProductEdit.tsx - loads external_id, passes to push function
- push.js - handles PUT vs POST based on existingProductId
- transforms.ts - converts to WooCommerce format (missing categories)

---

*Last Updated: December 20, 2024*
*Status: WooCommerce basic sync working, categories TODO*
