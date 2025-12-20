# Commerce Hub - Comprehensive Project Handoff

**Last Updated:** December 20, 2024  
**Status:** ✅ Phase 1 Complete + Shopify OAuth Working  
**Next Priority:** Product Push to External Platforms

---

## Live Application

| Resource | URL |
|----------|-----|
| **Production** | https://commerce-hub-iota.vercel.app |
| **Repository** | https://github.com/artmusuem/commerce-hub |
| **Local Dev** | `C:\xampp\htdocs\commerce-hub-v2` |

---

## What Commerce Hub Does

A centralized admin panel for managing products across multiple e-commerce platforms:

```
                    ┌─────────────────┐
                    │  Commerce Hub   │
                    │   (Supabase)    │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │ Gallery     │   │ WooCommerce │   │  Shopify    │
    │ Store       │   │ REST API    │   │ Admin API   │
    │ (JSON)      │   │             │   │             │
    └─────────────┘   └─────────────┘   └─────────────┘
```

**Current Capabilities:**
- ✅ Import products FROM Gallery Store (JSON files)
- ✅ Import products FROM WooCommerce (REST API)
- ✅ Connect Shopify stores (OAuth 2.0)
- ⏳ Push products TO WooCommerce (next)
- ⏳ Push products TO Shopify (next)

---

## Connected Stores

### 1. Gallery Store (JSON-based)
- **Type:** Static JSON files
- **Products:** 111 imported
- **Source:** `/public/data/*.json` in ecommerce-react repo
- **Live Site:** https://ecommerce-react-beta-woad.vercel.app

### 2. WooCommerce (REST API)
- **Type:** REST API with Basic Auth
- **Products:** 12 imported
- **Store URL:** https://rapidwoo.developer2.us
- **API Docs:** https://woocommerce.github.io/woocommerce-rest-api-docs/

### 3. Shopify (Admin API)
- **Type:** OAuth 2.0 + GraphQL/REST Admin API
- **Products:** 0 (dev store, ready for push)
- **Store URL:** https://admin.shopify.com/store/dev-store-749237498237498787
- **API Docs:** https://shopify.dev/docs/api/admin-rest

---

## Platform API Structures

### WooCommerce Product Schema
```json
{
  "name": "Product Title",
  "type": "simple",
  "regular_price": "29.99",
  "description": "Full description",
  "short_description": "Brief desc",
  "sku": "PROD-001",
  "images": [
    { "src": "https://example.com/image.jpg" }
  ],
  "categories": [
    { "id": 15 }
  ],
  "status": "publish"
}
```

**Endpoint:** `POST /wp-json/wc/v3/products`  
**Auth:** Basic Auth (Consumer Key + Secret)

### Shopify Product Schema
```json
{
  "product": {
    "title": "Product Title",
    "body_html": "<p>Description</p>",
    "vendor": "Gallery Store",
    "product_type": "Art Print",
    "status": "active",
    "variants": [
      {
        "price": "29.99",
        "sku": "PROD-001",
        "inventory_quantity": 100
      }
    ],
    "images": [
      { "src": "https://example.com/image.jpg" }
    ]
  }
}
```

**Endpoint:** `POST /admin/api/2024-01/products.json`  
**Auth:** `X-Shopify-Access-Token: {access_token}`

### Commerce Hub Internal Schema (Supabase)
```sql
products (
  id              UUID PRIMARY KEY,
  store_id        UUID REFERENCES stores(id),
  external_id     TEXT,           -- ID from source platform
  title           TEXT NOT NULL,
  price           DECIMAL,
  sku             TEXT,
  image_url       TEXT,
  description     TEXT,
  status          TEXT,           -- 'active', 'draft', 'archived'
  raw_data        JSONB,          -- Original platform data
  created_at      TIMESTAMP,
  updated_at      TIMESTAMP
)
```

---

## Credentials & Access

**⚠️ Full credentials stored locally. See `HANDOFF-CREDENTIALS.md` on your machine.**

### Where to Find Credentials

| Service | Location |
|---------|----------|
| Supabase | https://supabase.com/dashboard (login with GitHub) |
| GitHub Token | Local `.env` file or password manager |
| Vercel | https://vercel.com/nathan-mcmullens-projects/commerce-hub/settings/environment-variables |
| WooCommerce | Local `.env` file |
| Shopify | Vercel env vars + Supabase `stores.api_credentials` |
| Etsy | Local `.env` file (pending approval) |

### Test User (Commerce Hub Login)
- **Email:** admin@gallerystore.com
- **Password:** CommerceHub2024!

---

## Database Schema

### stores
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
name            TEXT
platform        TEXT NOT NULL  -- 'gallery-store', 'woocommerce', 'shopify', 'etsy'
store_url       TEXT
api_credentials JSONB          -- { access_token, consumer_key, etc. }
user_id         UUID REFERENCES auth.users
created_at      TIMESTAMP DEFAULT now()
```

### products
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
store_id        UUID REFERENCES stores(id)
external_id     TEXT           -- ID from source platform
title           TEXT NOT NULL
price           DECIMAL
sku             TEXT
image_url       TEXT
description     TEXT
status          TEXT DEFAULT 'active'
raw_data        JSONB
created_at      TIMESTAMP DEFAULT now()
updated_at      TIMESTAMP DEFAULT now()
```

---

## Repository Structure

```
commerce-hub/
├── api/
│   ├── etsy/
│   │   └── token.js           # Etsy OAuth token exchange
│   └── shopify/
│       └── token.js           # Shopify OAuth token exchange
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   └── Sidebar.tsx
│   │   └── ProtectedRoute.tsx
│   ├── contexts/
│   │   └── AuthContext.tsx
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── etsy.ts            # Etsy OAuth utilities
│   │   └── shopify.ts         # Shopify OAuth utilities
│   ├── pages/
│   │   ├── auth/
│   │   │   └── Login.tsx
│   │   ├── products/
│   │   │   ├── ProductsIndex.tsx
│   │   │   └── ProductDetail.tsx
│   │   └── stores/
│   │       ├── StoresIndex.tsx
│   │       ├── StoreDetail.tsx
│   │       ├── GalleryStoreImport.tsx
│   │       ├── WooCommerceImport.tsx
│   │       ├── ShopifyConnect.tsx
│   │       ├── ShopifyCallback.tsx
│   │       └── EtsyConnect.tsx
│   ├── App.tsx
│   └── main.tsx
├── .env.local                  # Local environment variables
├── package.json
└── vite.config.ts
```

---

## Completed Work

### Phase 1: Foundation ✅
- [x] Supabase project + database schema
- [x] User authentication (email/password)
- [x] Protected routes
- [x] Admin layout with sidebar
- [x] Products CRUD
- [x] Stores management

### Phase 1.5: Import System ✅
- [x] Gallery Store JSON import (111 products)
- [x] WooCommerce REST API import (12 products)
- [x] Store-product relationships via foreign keys
- [x] Bulk delete functionality

### Phase 2: OAuth Connections ✅
- [x] Shopify OAuth 2.0 flow (working!)
- [x] Etsy OAuth flow (built, pending API approval)
- [x] Token storage in Supabase

---

## Next Priority: Product Push System

### Goal
Push products FROM Commerce Hub TO external platforms (WooCommerce, Shopify).

### Architecture
```
Commerce Hub Product
        │
        ▼
   Transform to
   Platform Schema
        │
        ├──────────────────┐
        ▼                  ▼
 WooCommerce API     Shopify API
 POST /products      POST /products.json
```

### Deliverables

1. **Product Transformer Service**
   - `transformToWooCommerce(product)` → WooCommerce schema
   - `transformToShopify(product)` → Shopify schema

2. **Push API Functions**
   - `api/woocommerce/push.js` - Push to WooCommerce
   - `api/shopify/push.js` - Push to Shopify

3. **UI Components**
   - "Push to Store" button on product detail page
   - Store selector dropdown
   - Push status/progress indicator
   - Bulk push from products list

4. **Sync Tracking**
   - Log all push operations to `sync_logs`
   - Track external_id mapping
   - Handle update vs create logic

### Estimated Effort
- Transformers: 2 hours
- WooCommerce Push: 2-3 hours
- Shopify Push: 2-3 hours
- UI: 2-3 hours
- **Total: 8-11 hours**

---

## Development Workflow

### Claude → GitHub → Vercel Flow
```
1. Claude edits code
2. Claude pushes to GitHub via API
3. Vercel auto-deploys
4. Nathan pulls locally to sync:
   cd C:\xampp\htdocs\commerce-hub-v2
   git pull origin main
```

### Local Development
```bash
cd C:\xampp\htdocs\commerce-hub-v2
npm install
npm run dev
# Opens http://localhost:5173
```

---

## Related Projects

### Gallery Store (ecommerce-react)
- **Purpose:** Production React storefront
- **Status:** ✅ Complete, A-level code
- **Live:** https://ecommerce-react-beta-woad.vercel.app
- **Repo:** https://github.com/artmusuem/ecommerce-react
- **Local:** `C:\xampp\htdocs\SMITHSONIAN-CLAUDE-AUTOMATED\smithsonian-art-store\gallery-store`

---

## Quick Start for New Chat

Copy-paste this to start a new session:

```
I'm continuing work on Commerce Hub. The project handoff is in this project's files.

Current status:
- ✅ Supabase backend working
- ✅ Gallery Store import (111 products)
- ✅ WooCommerce import (12 products)
- ✅ Shopify OAuth connected (dev store)
- ⏳ Etsy pending API approval

Next task: Build product PUSH functionality to sync Commerce Hub products TO WooCommerce and Shopify stores.

Workflow: Claude pushes to GitHub, I pull locally. Vercel auto-deploys.
```

---

## Technical Decisions Log

| Decision | Rationale |
|----------|-----------|
| Supabase over Firebase | PostgreSQL with proper relations, Row Level Security |
| Vercel serverless for OAuth | Client secret must stay server-side |
| OAuth 2.0 for Shopify | Required by Shopify, custom apps deprecated Jan 2026 |
| JSONB for api_credentials | Flexible storage for different platform tokens |
| Store-product FK relationship | Enables filtering, prevents orphaned products |

---

*Commerce Hub v1.5 - OAuth Complete, Push System Next*
