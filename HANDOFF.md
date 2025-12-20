# Commerce Hub - Comprehensive Project Handoff

**Last Updated:** December 19, 2024  
**Status:** ✅ Phase 2 Complete - Product Push System Built  
**Next Priority:** Testing & Refinement

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
- ✅ Push products TO WooCommerce (NEW!)
- ✅ Push products TO Shopify (NEW!)
- ⏳ Etsy integration (pending API approval)

---

## New: Product Push System (Phase 2)

### How It Works

1. Edit any product in Commerce Hub
2. Scroll to "Push to External Store" section
3. Select target store (WooCommerce or Shopify)
4. Click "Push to Store"
5. Product is created on the external platform

### New Files Added

| File | Purpose |
|------|---------|
| `src/lib/woocommerce.ts` | WooCommerce API utilities |
| `src/lib/transforms.ts` | Product schema transformers |
| `api/woocommerce/push.js` | Serverless function for WooCommerce push |
| `src/pages/products/ProductEdit.tsx` | Updated with push UI |

### Product Transformation

Commerce Hub products are automatically transformed to platform schemas:

**To WooCommerce:**
```javascript
{
  name: "Product Title",
  type: "simple",
  status: "publish",
  regular_price: "29.99",
  description: "Full description",
  short_description: "By Artist Name",
  sku: "CH-abc12345",
  images: [{ src: "https://..." }]
}
```

**To Shopify:**
```javascript
{
  title: "Product Title",
  body_html: "<p>Description</p><p><strong>Artist:</strong> Name</p>",
  vendor: "Commerce Hub",
  product_type: "Art Print",
  status: "active",
  variants: [{ price: "29.99", sku: "CH-abc12345" }],
  images: [{ src: "https://..." }]
}
```

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
- **Credentials:** Stored in Supabase `stores.api_credentials`

### 3. Shopify (Admin API)
- **Type:** OAuth 2.0 + REST Admin API
- **Products:** 0 (dev store, ready for push)
- **Store URL:** https://admin.shopify.com/store/dev-store-749237498237498787
- **API Docs:** https://shopify.dev/docs/api/admin-rest
- **Credentials:** Access token stored in Supabase `stores.api_credentials`

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

---

## Credentials & Access

**⚠️ Full credentials stored locally. See `HANDOFF-CREDENTIALS.md` on your machine.**

### Where to Find Credentials

| Service | Location |
|---------|----------|
| Supabase | https://supabase.com/dashboard (login with GitHub) |
| GitHub Token | Local `.env` file or password manager |
| Vercel | https://vercel.com/nathan-mcmullens-projects/commerce-hub/settings/environment-variables |
| WooCommerce | Stored in Supabase `stores.api_credentials` |
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
api_credentials JSONB          -- { access_token, consumer_key, consumer_secret }
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
│   ├── shopify/
│   │   └── token.js           # Shopify OAuth token exchange
│   └── woocommerce/
│       └── push.js            # WooCommerce product push (NEW)
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
│   │   ├── shopify.ts         # Shopify OAuth + push utilities
│   │   ├── woocommerce.ts     # WooCommerce API utilities (NEW)
│   │   └── transforms.ts      # Product transformers (NEW)
│   ├── pages/
│   │   ├── auth/
│   │   │   └── Login.tsx
│   │   ├── products/
│   │   │   ├── ProductsIndex.tsx
│   │   │   └── ProductEdit.tsx   # Updated with push functionality
│   │   └── stores/
│   │       ├── StoresIndex.tsx
│   │       ├── StoreDetail.tsx
│   │       ├── WooCommerceConnect.tsx  # Updated to store credentials
│   │       ├── ShopifyConnect.tsx
│   │       └── ShopifyCallback.tsx
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

### Phase 2.5: Product Push System ✅ (NEW)
- [x] WooCommerce push via serverless function
- [x] Shopify push via Admin API
- [x] Product transformers (Commerce Hub → platform schemas)
- [x] Push UI on product edit page
- [x] Credential storage for WooCommerce

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

## Testing the Push System

### WooCommerce Push
1. Connect WooCommerce store at `/stores/woocommerce/connect`
2. Enter API credentials (consumer key/secret)
3. Import products
4. Go to any product edit page
5. Select the WooCommerce store from dropdown
6. Click "Push to Store"
7. Verify product appears in WooCommerce admin

### Shopify Push
1. Connect Shopify store at `/stores/shopify/connect`
2. Complete OAuth flow
3. Go to any product edit page
4. Select the Shopify store from dropdown
5. Click "Push to Store"
6. Verify product appears in Shopify admin

---

## Next Steps

### Testing & Validation
- [ ] Test WooCommerce push with real store
- [ ] Test Shopify push with dev store
- [ ] Handle update vs create (check if product exists)
- [ ] Add sync status tracking

### Future Enhancements
- [ ] Bulk push from products list
- [ ] Two-way sync (detect changes on platforms)
- [ ] Push status indicators per product
- [ ] Etsy integration (when approved)

---

## Related Projects

### Gallery Store (ecommerce-react)
- **Purpose:** Production React storefront
- **Status:** ✅ Complete, A-level code
- **Live:** https://ecommerce-react-beta-woad.vercel.app
- **Repo:** https://github.com/artmusuem/ecommerce-react
- **Local:** `C:\xampp\htdocs\SMITHSONIAN-CLAUDE-AUTOMATED\smithsonian-art-store\gallery-store`

---

*Commerce Hub v2.0 - Product Push System Complete*
