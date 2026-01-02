# Commerce Hub - Clean Architecture

## Directory Structure

```
api/
├── index.ts                    # Clean exports
├── types/
│   ├── product.ts              # UniversalProduct + related types
│   └── platform.ts             # Platform configs + SyncMapping
├── adapters/
│   ├── woocommerce.ts          # WooCommerce REST API wrapper
│   └── shopify.ts              # Shopify Admin API wrapper
├── transformers/
│   └── product-transformer.ts  # Pure conversion functions
└── services/
    └── sync-service.ts         # Orchestration layer
```

## Data Flow

```
┌──────────────┐     ┌────────────────────┐     ┌──────────────┐
│  WooCommerce │ ──> │   UniversalProduct │ ──> │   Shopify    │
│   Adapter    │     │   (The Hub Format) │     │   Adapter    │
└──────────────┘     └────────────────────┘     └──────────────┘
       │                      │                        │
       │                      │                        │
       ▼                      ▼                        ▼
  WooCommerce           Commerce Hub              Shopify
  REST API v3            Database               Admin API
```

## Key Principles

### 1. Adapters (api/adapters/)
- **One adapter per platform**
- **Only talks to that platform's API**
- **Returns RAW platform data** - no transformation
- Example: `WooCommerceAdapter.getProducts()` returns raw WooCommerce JSON

### 2. Transformers (api/transformers/)
- **Pure functions** - no side effects
- **No API calls** - that's the adapter's job
- **No database access** - that's the service's job
- Example: `fromWooCommerce(rawProduct)` → `UniversalProduct`

### 3. Services (api/services/)
- **Orchestration only**
- **Uses adapters + transformers**
- **Handles business logic** (upsert vs create, batch processing)
- Example: `syncWooToShopify(productId)` coordinates the full flow

### 4. Universal Product Format (api/types/product.ts)
- **The canonical representation**
- **All platforms convert to/from this**
- **Lowest common denominator** (e.g., max 3 options like Shopify)

## Usage Examples

### Import from WooCommerce
```typescript
import { WooCommerceAdapter, ProductTransformer } from './api'

const woo = new WooCommerceAdapter({
  url: 'https://store.com',
  key: 'ck_xxx',
  secret: 'cs_xxx'
})

// Get raw WooCommerce data
const rawProducts = await woo.getProducts({ per_page: 50 })

// Transform to universal format
const products = rawProducts.map(p => ProductTransformer.fromWooCommerce(p))

// Insert into database...
```

### Sync WooCommerce → Shopify
```typescript
import { WooCommerceAdapter, ShopifyAdapter, SyncService } from './api'

const woo = new WooCommerceAdapter({ ... })
const shopify = new ShopifyAdapter({ ... })
const sync = new SyncService(woo, shopify)

// Sync single product
const result = await sync.syncWooToShopify(12345)

// Batch sync
const results = await sync.syncBatchWooToShopify({ page: 1, perPage: 10 })
```

### Dry Run (Preview)
```typescript
const result = await sync.syncWooToShopify(12345, { dryRun: true })
// Logs what would happen, doesn't actually push
```

## What About Art Prints?

Art-specific logic goes in a SEPARATE service:

```
api/services/
├── sync-service.ts              # Generic platform sync
└── artwork-enrichment.ts        # Art-specific logic (FUTURE)
```

The enrichment service operates on `UniversalProduct` format:
1. Check if product.metadata.is_artwork
2. If yes, run enrichment (add frame options, pricing tiers, etc.)
3. Return enriched UniversalProduct
4. Continue normal sync flow

This keeps art print logic **completely separate** from platform code.

## Migration Steps

1. ✅ Created clean architecture in `/home/claude/new-architecture/`
2. ⬜ Push to repo as `api/` folder
3. ⬜ Update import pages to use new architecture
4. ⬜ Update push pages to use new architecture
5. ⬜ Remove old tangled `src/lib/transforms.ts`
6. ⬜ Add database mapping table

## Files Ready to Push

- `api/index.ts` - Clean exports
- `api/types/product.ts` - UniversalProduct format
- `api/types/platform.ts` - Platform configs
- `api/adapters/woocommerce.ts` - WooCommerce API
- `api/adapters/shopify.ts` - Shopify API
- `api/transformers/product-transformer.ts` - Conversion functions
- `api/services/sync-service.ts` - Orchestration

Total: 7 files, ~1000 lines of clean, focused code
