# Commerce Hub - Development Documentation

> Last Updated: December 22, 2024
> Current Phase: Shopify Integration Enhancement (Phase 3 Complete)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Platform Integrations](#platform-integrations)
4. [Key Patterns & Conventions](#key-patterns--conventions)
5. [Resolved Issues & Learnings](#resolved-issues--learnings)
6. [Development Workflow](#development-workflow)
7. [Roadmap](#roadmap)

---

## Architecture Overview

### System Design

```
┌─────────────────────────────────────────────────────────────────┐
│                       COMMERCE HUB                               │
│                    (React + TypeScript)                          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Products   │  │    Stores    │  │  Sync Logs   │          │
│  │    Page      │  │    Page      │  │    Page      │          │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘          │
│         │                 │                                      │
│         ▼                 ▼                                      │
│  ┌─────────────────────────────────────┐                        │
│  │         Supabase (PostgreSQL)        │                        │
│  │  • products table                    │                        │
│  │  • stores table                      │                        │
│  │  • Auth (user management)            │                        │
│  └─────────────────────────────────────┘                        │
│                                                                  │
│  ┌─────────────────────────────────────┐                        │
│  │      Vercel Serverless Functions     │                        │
│  │  • /api/woocommerce/*               │                        │
│  │  • /api/shopify/*                   │                        │
│  │  • /api/gallery-store/*             │                        │
│  └─────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXTERNAL PLATFORMS                            │
│                                                                  │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │WooCommerce│  │  Shopify  │  │   Etsy    │  │  Gallery  │   │
│  │ REST API  │  │Admin API  │  │  (pending)│  │   Store   │   │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 18 + TypeScript | UI Components |
| Styling | Tailwind CSS | Utility-first CSS |
| Build | Vite 5 | Fast dev server & bundler |
| Database | Supabase (PostgreSQL) | Data persistence + Auth |
| Hosting | Vercel | Frontend + Serverless functions |
| APIs | REST | Platform integrations |

### Key Files

```
commerce-hub/
├── api/                          # Vercel serverless functions
│   ├── shopify/
│   │   └── products.js           # Shopify CRUD proxy
│   ├── woocommerce/
│   │   └── push.js               # WooCommerce push endpoint
│   └── gallery-store/
│       └── publish.js            # Gallery Store publish
├── src/
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client
│   │   ├── transforms.ts         # Product format converters
│   │   ├── woocommerce.ts        # WooCommerce API wrapper
│   │   └── shopify.ts            # Shopify API wrapper
│   └── pages/
│       ├── products/
│       │   ├── ProductsIndex.tsx # Product list
│       │   └── ProductEdit.tsx   # Product edit form
│       └── stores/
│           ├── ShopifyImport.tsx # Import from Shopify
│           └── WooCommerceConnect.tsx
└── DEVELOPMENT.md                # This file
```

---

## Database Schema

### Products Table

```sql
CREATE TABLE products (
  -- Core fields
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users,
  store_id        UUID REFERENCES stores(id),
  external_id     TEXT,              -- Platform's product ID (critical for updates)
  
  -- Basic product info
  title           TEXT NOT NULL,
  description     TEXT,
  price           DECIMAL,
  sku             TEXT,
  status          TEXT DEFAULT 'draft',  -- draft, active, archived
  
  -- Categorization
  artist          TEXT,              -- For art/gallery products
  vendor          TEXT,              -- Shopify vendor field (added Phase 1)
  category        TEXT,
  tags            TEXT[],            -- PostgreSQL array
  
  -- Product type & variants
  product_type    TEXT DEFAULT 'simple',  -- simple, variable (added Phase 2)
  variants        JSONB DEFAULT '[]',     -- Full variant data (added Phase 3)
  options         JSONB DEFAULT '[]',     -- Product options like Size, Color (added Phase 4)
  
  -- Images
  image_url       TEXT,              -- Primary image
  thumbnail_url   TEXT,
  images          TEXT[],            -- Additional images array
  
  -- Digital downloads
  is_digital      BOOLEAN DEFAULT false,
  digital_file_url TEXT,
  digital_file_name TEXT,
  download_limit  INTEGER DEFAULT -1,
  download_expiry INTEGER DEFAULT -1,
  
  -- Platform-specific
  attributes      JSONB,             -- Platform-specific attributes
  
  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### Stores Table

```sql
CREATE TABLE stores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users,
  platform        TEXT,              -- 'woocommerce', 'shopify', 'gallery-store', 'etsy'
  store_name      TEXT,
  store_url       TEXT,
  api_credentials JSONB,             -- Platform-specific auth (encrypted at rest)
  is_connected    BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### Variants JSONB Structure (Shopify)

```json
[
  {
    "id": 42878763696241,        // Shopify variant ID (critical for updates!)
    "title": "Ice",
    "price": "699.95",
    "compare_at_price": null,
    "sku": "SNOWBOARD-ICE",
    "barcode": null,
    "position": 1,
    "inventory_quantity": 10,
    "inventory_management": "shopify",
    "option1": "Ice",
    "option2": null,
    "option3": null
  }
]
```

---

## Platform Integrations

### Shopify

**Authentication:** OAuth 2.0 with access token stored in `stores.api_credentials`

**Import Flow:**
```
ShopifyImport.tsx
    │
    ├─ Fetch products from Shopify Admin API
    │   GET /admin/api/2024-01/products.json
    │
    ├─ Transform to Commerce Hub format
    │   • Extract variants with IDs
    │   • Parse tags string → array
    │   • Determine product_type (simple vs variable)
    │
    └─ Upsert to Supabase
        • Match by store_id + external_id
        • Update if exists, insert if new
```

**Push Flow:**
```
ProductEdit.tsx
    │
    ├─ Build product object with variants
    │
    ├─ transforms.ts: transformToShopify()
    │   • CRITICAL: Include variant IDs for updates
    │   • Pass through existing variants, don't replace
    │
    ├─ POST /api/shopify/products
    │   • If external_id exists → PUT (update)
    │   • If no external_id → POST (create)
    │
    └─ Update Supabase with new external_id if created
```

**Key Learning:** When updating Shopify products, variant IDs MUST be included in the payload. Without IDs, Shopify replaces all variants with new ones, destroying existing variant data.

### WooCommerce

**Authentication:** Consumer Key + Consumer Secret (Basic Auth)

**Push Flow:**
```
ProductEdit.tsx
    │
    ├─ transforms.ts: transformToWooCommerce()
    │   • Map status: active → publish
    │   • Convert category name → ID
    │   • Handle digital downloads
    │
    └─ /api/woocommerce/push.js
        • If external_id → PUT /products/{id}
        • Else → POST /products
```

### Gallery Store

**Architecture:** JSON file pushed to GitHub, deployed via Vercel

**Publish Flow:**
```
ProductEdit.tsx
    │
    ├─ Build gallery product JSON
    │
    └─ /api/gallery-store/publish.js
        • Read current products.json from GitHub
        • Merge/update product
        • Push updated JSON via GitHub API
        • Vercel auto-deploys
```

---

## Key Patterns & Conventions

### The external_id Pattern (Critical)

Every product imported from a platform stores the platform's product ID in `external_id`. This enables:

1. **Update vs Create Logic:** If `external_id` exists, send PUT. Otherwise POST.
2. **Duplicate Prevention:** On import, check `store_id + external_id` to find existing products.
3. **Cross-Platform Tracking:** Each product knows its origin.

```typescript
// On Import
external_id: String(shopifyProduct.id)  // "7558165987441"

// On Push
const isUpdate = productPlatform === 'shopify' && externalId
const method = isUpdate ? 'PUT' : 'POST'
```

### Platform-Aware Components

Components check `productPlatform` to show relevant fields:

```tsx
{productPlatform === 'shopify' && (
  <div>
    <label>Vendor</label>
    <input value={vendor} onChange={...} />
  </div>
)}
```

### Serverless Proxy Pattern

All external API calls go through `/api/` functions to:
- Hide API credentials from frontend
- Avoid CORS issues
- Add consistent error handling

```
Frontend → /api/shopify/products → Shopify Admin API
          (credentials injected)
```

### Transform Functions

`src/lib/transforms.ts` converts Commerce Hub products to platform formats:

```typescript
// Commerce Hub → Shopify format
transformToShopify(product, vendor, tags): ShopifyPushPayload

// Commerce Hub → WooCommerce format  
transformToWooCommerce(product, categoryMap): WooCommercePushPayload
```

---

## Resolved Issues & Learnings

### Issue: Shopify Variants Deleted on Push (Dec 22, 2024)

**Symptom:** Pushing a product to Shopify removed all variants, leaving only one "Default Title" variant.

**Root Cause:** `transformToShopify()` was creating a single default variant instead of passing through existing variants with their IDs.

**Solution:** 
1. Updated `CommerceHubProduct` interface to include `variants` array
2. Modified `transformToShopify()` to preserve variants with IDs
3. Updated `ProductEdit.tsx` to include variants in push payload

**Key Code:**
```typescript
// transforms.ts
if (product.variants && product.variants.length > 0) {
  variants = product.variants.map(v => ({
    id: v.id,  // CRITICAL: Include ID for updates
    price: v.price,
    sku: v.sku,
    // ... other fields
  }))
}
```

### Issue: PostgreSQL Array Format Error (Dec 22, 2024)

**Symptom:** `malformed array literal` error when importing Shopify products.

**Root Cause:** Shopify sends tags as comma-separated string, but `tags` column is `TEXT[]`.

**Solution:** Parse string to array before insert:
```typescript
const tagsArray = product.tags 
  ? product.tags.split(',').map(t => t.trim()).filter(t => t.length > 0)
  : null
```

### Issue: Duplicate Products on Import

**Symptom:** Re-importing creates new products instead of updating.

**Root Cause:** `external_id` not saved on initial import, so upsert logic couldn't find match.

**Solution:** Always save `external_id: String(product.id)` on import.

### Issue: Accidental Cross-Platform Push

**Symptom:** User pushed Shopify product to WooCommerce accidentally.

**Solution:** Added UX improvements:
1. Platform badge in edit header
2. Auto-select product's original store in dropdown
3. Yellow warning when pushing to different platform

---

## Development Workflow

### Making Changes

1. **Fetch current file** from GitHub to `/home/claude/workspace/`
2. **Make changes** using `str_replace` tool
3. **Push via GitHub API** with descriptive commit message
4. **Wait 45 seconds** for Vercel deployment
5. **Verify** deployment succeeded before next change

### Commit Message Convention

```
type(scope): description

Types:
- feat: New feature
- fix: Bug fix
- refactor: Code restructure
- docs: Documentation
- chore: Maintenance

Examples:
- feat(shopify): save product_type as simple or variable
- fix(shopify): preserve existing variants on push
- docs: add development documentation
```

### Database Migrations

1. Document SQL in this file
2. Run in Supabase SQL Editor
3. Verify with SELECT query
4. Update code to use new column

```sql
-- Example migration
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor TEXT;
```

---

## Roadmap

### Completed ✅

- [x] **Phase 1:** Vendor field (Shopify-specific)
- [x] **Phase 2:** Product type (simple/variable)
- [x] **Phase 3:** Variants JSONB storage + editable table
- [x] **Phase 3b:** Variant preservation on push
- [x] **UX:** Platform badge, auto-select store, cross-platform warning
- [x] **Phase 4:** Options storage (Color, Size, etc.) with colored pills display
- [x] **Phase 5:** Multiple images array with gallery view + set-primary

### In Progress 🔄

- [ ] **Phase 6:** Sync tracking (last_synced_at, sync_status)

### Planned 📋

- [ ] **Phase 7:** SEO fields (url_handle, meta_title, meta_description)
- [ ] **Phase 8:** UI polish (two-column layout, status tabs)
- [ ] **Phase 9:** Bulk operations
- [ ] **Phase 10:** Etsy integration (pending API approval)

### Strategic Pivot Option 🎯

Consider stripping to core value proposition:
- WooCommerce ↔ Shopify bidirectional sync only
- Shopify App Store submission (distribution + portfolio)
- See `LEARNINGS.md` for full strategic analysis

---

## Environment & Credentials

See `CREDENTIALS-PRIVATE.md` (not committed to repo) for:
- Supabase project URL and keys
- WooCommerce consumer key/secret
- Shopify app credentials
- GitHub token

---

## Related Documentation

- [COMMERCE-HUB-HANDOFF.md](./COMMERCE-HUB-HANDOFF.md) - Quick start guide
- [LEARNINGS.md](./LEARNINGS.md) - Patterns, protocols, strategic direction
- [WooCommerce REST API](https://woocommerce.github.io/woocommerce-rest-api-docs/)
- [Shopify Admin API](https://shopify.dev/docs/api/admin-rest)
- [Supabase Docs](https://supabase.com/docs)

---

*This document is maintained alongside code changes. Update when making architectural decisions or resolving significant issues.*
