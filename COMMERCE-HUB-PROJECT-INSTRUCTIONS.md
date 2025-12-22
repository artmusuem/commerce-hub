# COMMERCE HUB - Claude Project Instructions

> Multi-Channel E-Commerce Product Management Platform

**Last Updated:** December 2024  
**Status:** Production - All integrations working

---

## Project Overview

Commerce Hub is a centralized admin panel that manages products across multiple e-commerce platforms from one dashboard. Products can be imported, edited, and pushed to any connected platform with one click.

**Current Capabilities:**
- ✅ WooCommerce: Full import/push with variations and digital downloads
- ✅ Shopify: OAuth + full import/push with tags
- ✅ Gallery Store: Smithsonian artwork → JSON storefront via GitHub
- ✅ Bulk Push: Push all Gallery Store products to WooCommerce/Shopify
- ⏳ Etsy: Pending API approval

---

## Tech Stack (Decided - Don't Suggest Alternatives)

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite 5 |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL + Auth) |
| Serverless | Vercel Functions |
| Image CDN | Cloudinary (for WooCommerce image proxy) |
| Platforms | WooCommerce REST API, Shopify Admin API, GitHub API |

---

## Repositories

| Project | GitHub URL | Live URL |
|---------|------------|----------|
| Commerce Hub | github.com/artmusuem/commerce-hub | commerce-hub-iota.vercel.app |
| Gallery Store | github.com/artmusuem/ecommerce-react | ecommerce-react-beta-woad.vercel.app |

**GitHub Token:** See CREDENTIALS-PRIVATE.md (local only)

---

## Database (Supabase)

**Project:** owfyxfeaialumomzsejd  
**Dashboard:** https://supabase.com/dashboard/project/owfyxfeaialumomzsejd

### Products Table
```sql
id, user_id, store_id, external_id, title, description, price, artist, 
category, image_url, sku, status, product_type, is_digital, digital_file_url,
digital_file_name, download_limit, download_expiry, shopify_tags, attributes,
created_at, updated_at
```

### Stores Table
```sql
id, user_id, platform, name, store_url, api_credentials (JSONB), 
is_active, last_sync_at, created_at
```

### Credential Storage Patterns
```json
// WooCommerce
{ "consumer_key": "ck_xxx", "consumer_secret": "cs_xxx" }

// Shopify
{ "access_token": "shpat_xxx", "scope": "read_products,write_products" }

// Gallery Store
{ "github_token": "github_pat_xxx", "repo": "artmusuem/ecommerce-react" }
```

---

## Key Architecture Patterns

### 1. External ID Pattern (CRITICAL)
Products store `external_id` = platform's product ID. Used for update-vs-create logic:
- **Import:** Save platform ID as external_id
- **Push:** If external_id exists AND same platform → PUT (update), else POST (create)
- **Cross-platform safety:** Never use Shopify ID for WooCommerce (causes "Invalid ID" error)

### 2. Serverless Proxy Pattern
All external API calls route through `/api/{platform}/` to hide secrets and avoid CORS.

### 3. Transform Layer
`src/lib/transforms.ts` converts Commerce Hub format to platform-specific formats.

### 4. Cloudinary Image Proxy
WooCommerce rejects URLs without file extensions. Smithsonian URLs get proxied:
```
https://res.cloudinary.com/dh4qwuvuo/image/fetch/{encoded_url}.jpg
```

---

## File Structure

```
commerce-hub/
├── api/                          # Vercel serverless
│   ├── woocommerce/
│   │   ├── push.js               # Create/update products
│   │   ├── variations.js         # Fetch variations
│   │   └── variation-update.js   # Update variation prices
│   ├── shopify/
│   │   ├── products.js           # CRUD proxy
│   │   └── token.js              # OAuth token exchange
│   └── gallery-store/
│       ├── push.js               # Publish to GitHub
│       └── reset.js              # Reset to Smithsonian data
│
├── src/
│   ├── lib/
│   │   ├── supabase.ts           # Database client
│   │   ├── transforms.ts         # Product format converters
│   │   ├── woocommerce.ts        # WooCommerce API wrapper
│   │   └── shopify.ts            # Shopify OAuth + API
│   │
│   └── pages/
│       ├── products/
│       │   ├── ProductsIndex.tsx # Product list with filters
│       │   └── ProductEdit.tsx   # Edit + Push to platforms
│       └── stores/
│           ├── StoresIndex.tsx   # Store connections + bulk push
│           ├── WooCommerceConnect.tsx
│           ├── ShopifyConnect.tsx
│           └── ShopifyImport.tsx
│
└── docs/                         # Documentation
    ├── COMMERCE-HUB-ARCHITECTURE.md
    ├── WOOCOMMERCE-INTEGRATION.md
    ├── SHOPIFY-INTEGRATION.md
    └── GALLERY-STORE-INTEGRATION.md
```

---

## Critical Files to Fetch

When starting work, fetch these files:
```bash
# Core logic
src/lib/transforms.ts
src/lib/woocommerce.ts
src/lib/shopify.ts

# Main UI
src/pages/products/ProductEdit.tsx
src/pages/stores/StoresIndex.tsx

# API endpoints
api/woocommerce/push.js
api/shopify/products.js
```

---

## Working Style

- **Senior developer approach** - no junior explanations
- **One file change at a time** - verify deployment before next change
- **Meaningful commit messages** - not "fix" "fix2" "fix3"
- **Stop on errors** - diagnose before rapid-fire fixes
- **Fetch files before editing** - always work with current version

---

## Development Workflow

### Fetch File from Repo
```bash
curl -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx"
```

### Push Changes
```bash
# Get SHA
SHA=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx" \
  | grep '"sha"' | head -1 | cut -d'"' -f4)

# Push
CONTENT=$(base64 -w 0 /home/claude/file.tsx)
curl -X PUT -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx" \
  -d "{\"message\": \"feat: description\", \"content\": \"$CONTENT\", \"sha\": \"$SHA\"}"
```

### Verify Deployment
Wait ~30 seconds, then check https://commerce-hub-iota.vercel.app

---

## Platform Credentials

### WooCommerce (rapidwoo.com/commerce)
```
Consumer Key: ck_xxxx (see CREDENTIALS-PRIVATE.md)
Consumer Secret: cs_xxxx (see CREDENTIALS-PRIVATE.md)
```

### Supabase
```
URL: https://owfyxfeaialumomzsejd.supabase.co
Anon Key: (see CREDENTIALS-PRIVATE.md)
```

### Cloudinary
```
Cloud Name: dh4qwuvuo
```

### Commerce Hub Login
```
Email: admin@gallerystore.com
Password: (see CREDENTIALS-PRIVATE.md)
```

---

## Current Product Counts

| Store | Products |
|-------|----------|
| WooCommerce | 147+ |
| Shopify | 128+ |
| Gallery Store | 110 |

---

## Recent Completed Work

1. **Bulk Push** - Push all Gallery Store products to WooCommerce/Shopify with one click
2. **Digital Downloads** - Full support for downloadable products
3. **Cloudinary Proxy** - Smithsonian images work on WooCommerce
4. **Cross-Platform Safety** - external_id only used for same-platform updates
5. **Shopify Tags** - Persist tags on edit/push cycles
6. **Variation Editing** - Inline price editing for WooCommerce variable products

---

## Known Patterns & Gotchas

| Issue | Solution |
|-------|----------|
| WooCommerce "Invalid ID" | Only use external_id for same-platform updates |
| WooCommerce "Invalid image" | Use Cloudinary proxy for Smithsonian URLs |
| Shopify tags disappear | Check `productPlatform === 'shopify'` before loading tags |
| Duplicate products on import | Upsert by external_id, not insert |
| Store filter shows all products | Use ProductsIndex (not ProductsGrid) for store filtering |

---

## Documentation

Full documentation in `docs/` folder:
- `COMMERCE-HUB-ARCHITECTURE.md` - System overview, data flows
- `WOOCOMMERCE-INTEGRATION.md` - WooCommerce API, auth, transforms
- `SHOPIFY-INTEGRATION.md` - OAuth flow, API proxy, tags
- `GALLERY-STORE-INTEGRATION.md` - GitHub publishing, Smithsonian data

---

## Quick Start for New Session

```
I'm continuing work on Commerce Hub. Please fetch:
1. src/lib/transforms.ts
2. src/pages/products/ProductEdit.tsx
3. src/pages/stores/StoresIndex.tsx

Then review docs/COMMERCE-HUB-ARCHITECTURE.md for context.
```

---

## Local Development

```cmd
cd C:\xampp\htdocs\commerce-hub
git pull origin main
npm install
npm run dev
```
Opens: http://localhost:5173
