# Commerce Hub - System Architecture

> Multi-Channel E-Commerce Product Management Platform

**Version:** 1.0  
**Last Updated:** December 2024  
**Status:** Production

---

## Executive Summary

Commerce Hub is a centralized product management system that enables unified control over multiple e-commerce platforms from a single dashboard. The system currently supports WooCommerce, Shopify, and Gallery Store (Smithsonian-powered static storefront), with architecture designed for extensibility to additional platforms.

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMMERCE HUB                                       │
│                      commerce-hub-iota.vercel.app                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        FRONTEND (React + TypeScript)                  │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │  Dashboard  │  │  Products   │  │   Stores    │  │  Product    │  │  │
│  │  │             │  │    Grid     │  │   Index     │  │    Edit     │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         LIB LAYER (TypeScript)                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │  │
│  │  │ transforms  │  │ woocommerce │  │   shopify   │  │   supabase  │  │  │
│  │  │    .ts      │  │     .ts     │  │     .ts     │  │     .ts     │  │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SERVERLESS API LAYER (Vercel)                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ /api/woocommerce│  │  /api/shopify   │  │/api/gallery-store│             │
│  │   - push.js     │  │  - products.js  │  │   - push.js     │             │
│  │   - variations  │  │  - token.js     │  │   - reset.js    │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
          ▼                          ▼                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   WooCommerce   │      │     Shopify     │      │  Gallery Store  │
│  rapidwoo.com   │      │ myshopify.com   │      │   GitHub JSON   │
│   REST API v3   │      │  Admin API      │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘

                                     │
                                     ▼
                        ┌─────────────────────┐
                        │      SUPABASE       │
                        │   PostgreSQL + Auth │
                        │                     │
                        │  • products table   │
                        │  • stores table     │
                        │  • users (auth)     │
                        └─────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 18 + TypeScript | UI components and state management |
| Styling | Tailwind CSS | Utility-first CSS framework |
| Build | Vite 5 | Fast build tooling and HMR |
| Database | Supabase (PostgreSQL) | Product storage, auth, real-time |
| Serverless | Vercel Functions | API proxies, OAuth handlers |
| Hosting | Vercel | Auto-deploy from GitHub |
| Image CDN | Cloudinary | Image proxy for cross-platform compatibility |

---

## Database Schema

### Products Table

```sql
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users,
  store_id        UUID REFERENCES stores(id),
  external_id     TEXT,                    -- Platform's product ID
  title           TEXT NOT NULL,
  description     TEXT,
  price           DECIMAL(10,2),
  artist          TEXT,
  category        TEXT,
  image_url       TEXT,
  sku             TEXT,
  status          TEXT DEFAULT 'draft',    -- draft | active | archived
  product_type    TEXT DEFAULT 'simple',   -- simple | variable
  is_digital      BOOLEAN DEFAULT false,
  digital_file_url    TEXT,
  digital_file_name   TEXT,
  download_limit      INTEGER DEFAULT -1,
  download_expiry     INTEGER DEFAULT -1,
  shopify_tags    TEXT,                    -- Shopify-specific tags
  attributes      JSONB,                   -- Variable product attributes
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Stores Table

```sql
CREATE TABLE stores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES auth.users,
  platform        TEXT NOT NULL,           -- woocommerce | shopify | gallery-store | etsy
  name            TEXT,
  store_url       TEXT,
  api_credentials JSONB,                   -- Platform-specific credentials
  is_active       BOOLEAN DEFAULT true,
  last_sync_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### Credential Storage Patterns

**WooCommerce:**
```json
{
  "consumer_key": "ck_xxxxx",
  "consumer_secret": "cs_xxxxx"
}
```

**Shopify:**
```json
{
  "access_token": "shpat_xxxxx",
  "scope": "read_products,write_products"
}
```

**Gallery Store:**
```json
{
  "github_token": "github_pat_xxxxx",
  "repo": "artmusuem/ecommerce-react"
}
```

---

## Core Design Patterns

### 1. External ID Pattern (Critical)

The `external_id` field tracks platform-specific product IDs to enable update-vs-create logic:

```typescript
// On IMPORT from platform:
await supabase.from('products').insert({
  ...productData,
  external_id: String(platformProduct.id)  // "12345"
})

// On PUSH to platform:
if (product.external_id && product.store_id === targetStore.id) {
  // UPDATE existing product
  await api.updateProduct(parseInt(external_id), payload)
} else {
  // CREATE new product
  await api.createProduct(payload)
}
```

**Cross-Platform Safety:** Only use `external_id` when pushing to the SAME platform the product originated from. A Shopify product ID (e.g., `7558835110001`) is invalid on WooCommerce.

### 2. Transform Layer Pattern

All platform-specific formatting is centralized in `transforms.ts`:

```typescript
// Commerce Hub → WooCommerce
transformToWooCommerce(product: CommerceHubProduct): WooCommercePushPayload

// Commerce Hub → Shopify  
transformToShopify(product: CommerceHubProduct): ShopifyPushPayload
```

This ensures:
- Consistent field mapping across all push operations
- Centralized handling of edge cases (image URLs, digital products)
- Easy addition of new platforms

### 3. Serverless Proxy Pattern

All external API calls route through Vercel serverless functions:

```
Frontend → /api/{platform}/push → External API
```

**Benefits:**
- Secrets never exposed to browser
- CORS issues eliminated
- Centralized error handling
- Rate limiting capability

---

## File Structure

```
commerce-hub/
├── api/                              # Vercel serverless functions
│   ├── woocommerce/
│   │   ├── push.js                   # Create/update products
│   │   ├── variations.js             # Fetch variations
│   │   └── variation-update.js       # Update variation prices
│   ├── shopify/
│   │   ├── products.js               # CRUD operations
│   │   └── token.js                  # OAuth token exchange
│   ├── gallery-store/
│   │   ├── push.js                   # Publish to GitHub
│   │   └── reset.js                  # Reset to Smithsonian data
│   └── image-proxy.js                # Image URL proxy
│
├── src/
│   ├── lib/                          # Core utilities
│   │   ├── supabase.ts               # Database client
│   │   ├── transforms.ts             # Product format converters
│   │   ├── woocommerce.ts            # WooCommerce API wrapper
│   │   ├── shopify.ts                # Shopify API wrapper
│   │   └── etsy.ts                   # Etsy OAuth (pending)
│   │
│   ├── pages/
│   │   ├── products/
│   │   │   ├── ProductsIndex.tsx     # Product list with filters
│   │   │   ├── ProductsGrid.tsx      # Grid view
│   │   │   └── ProductEdit.tsx       # Edit + Push to platforms
│   │   │
│   │   └── stores/
│   │       ├── StoresIndex.tsx       # Store connections + bulk push
│   │       ├── WooCommerceConnect.tsx
│   │       ├── ShopifyConnect.tsx
│   │       ├── ShopifyImport.tsx
│   │       └── ImportStore.tsx       # Gallery Store import
│   │
│   └── App.tsx                       # Router configuration
│
└── docs/                             # Documentation
    ├── COMMERCE-HUB-ARCHITECTURE.md
    ├── WOOCOMMERCE-INTEGRATION.md
    ├── SHOPIFY-INTEGRATION.md
    └── GALLERY-STORE-INTEGRATION.md
```

---

## Data Flow Diagrams

### Import Flow (Platform → Commerce Hub)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  External   │────▶│  API Proxy  │────▶│  Transform  │────▶│  Supabase   │
│  Platform   │     │  (Vercel)   │     │  to CH      │     │  products   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
                                        Save external_id
```

### Push Flow (Commerce Hub → Platform)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Product    │────▶│  Transform  │────▶│  API Proxy  │────▶│  External   │
│  Edit UI    │     │  to Platform│     │  (Vercel)   │     │  Platform   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                                                           │
       │                                                           ▼
       │                                                   Return product ID
       │                                                           │
       └───────────────────────────────────────────────────────────┘
                        Save external_id if new
```

### Bulk Push Flow (Gallery Store → Multiple Platforms)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Gallery    │     │  Transform  │     │ WooCommerce │
│  Store      │────▶│  + Push     │────▶│   API       │
│  Products   │     │  Loop       │     └─────────────┘
└─────────────┘     │             │     ┌─────────────┐
      │             │             │────▶│  Shopify    │
      │             └─────────────┘     │   API       │
      │                   │             └─────────────┘
      │                   ▼
      │             Progress: 57/110...
      │                   │
      └───────────────────┘
                200ms delay between
                requests (rate limit)
```

---

## Authentication & Security

### Supabase Auth
- Email/password authentication
- Row-level security on products/stores tables
- JWT tokens for API calls

### Platform Credentials
- Stored encrypted in Supabase JSONB columns
- Never exposed to frontend JavaScript
- Passed to serverless functions per-request

### OAuth Flows
- **Shopify:** Full OAuth 2.0 with PKCE
- **Etsy:** OAuth 2.0 (pending API approval)
- **WooCommerce:** Consumer key/secret (API keys)

---

## Deployment

### Repositories

| Project | URL | Purpose |
|---------|-----|---------|
| Commerce Hub | github.com/artmusuem/commerce-hub | Admin panel |
| Gallery Store | github.com/artmusuem/ecommerce-react | Customer storefront |

### Environments

| Environment | URL | Auto-Deploy |
|-------------|-----|-------------|
| Commerce Hub | commerce-hub-iota.vercel.app | Yes (GitHub push) |
| Gallery Store | ecommerce-react-beta-woad.vercel.app | Yes (GitHub push) |

### Deployment Workflow

```
1. Push to GitHub main branch
2. Vercel detects change (~5 seconds)
3. Build starts (~20-30 seconds)
4. Deploy completes
5. Changes live at production URL
```

---

## Current Platform Status

| Platform | Connect | Import | Edit | Push | Digital Downloads | Bulk Push |
|----------|---------|--------|------|------|-------------------|-----------|
| WooCommerce | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Shopify | ✅ OAuth | ✅ | ✅ | ✅ | ✅ | ✅ |
| Gallery Store | ✅ GitHub | ✅ | ✅ | ✅ Publish | N/A | N/A |
| Etsy | ⏳ Pending | - | - | - | - | - |
| Amazon | 🔮 Planned | - | - | - | - | - |

---

## Product Counts (Current)

| Store | Products |
|-------|----------|
| WooCommerce | 147+ |
| Shopify | 128+ |
| Gallery Store | 110 |
| **Total Managed** | **385+** |

---

## Related Documentation

- [WooCommerce Integration](./WOOCOMMERCE-INTEGRATION.md)
- [Shopify Integration](./SHOPIFY-INTEGRATION.md)
- [Gallery Store Integration](./GALLERY-STORE-INTEGRATION.md)

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| Dec 2024 | 1.0 | Initial release with WooCommerce, Shopify, Gallery Store |

