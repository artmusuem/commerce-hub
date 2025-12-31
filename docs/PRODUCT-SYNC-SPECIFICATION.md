# Product Sync System - Project Specification

## Executive Summary

**Goal:** Build a validated, tested product transformation layer that enables reliable sync between WooCommerce, Shopify, and Gallery Store.

**Approach:** Prove transforms work between known platforms (WooCommerce ↔ Shopify) first, then derive unified schema from what actually works, then retrofit Gallery Store.

**Timeline:** 4 phases, ~3 weeks total

---

## Current State (Problems)

| Issue | Impact |
|-------|--------|
| No unified product schema | Each platform transform is ad-hoc, untested |
| Gallery Store has artwork-specific fields | Can't map `artist`, `year_created`, `medium` to WooCommerce/Shopify |
| transforms.ts written without validation | Unknown if output actually works on target platforms |
| UI restricts cross-platform push | "Only stores' products can be pushed to their corresponding stores" |

---

## Architecture Overview

```
PHASE 1-2: Prove Platform Transforms Work
─────────────────────────────────────────
                    
  WooCommerce                         Shopify
  CSV/API                             CSV/API
      │                                   │
      ▼                                   ▼
┌─────────────┐                   ┌─────────────┐
│  Import     │                   │   Import    │
│  Transform  │                   │  Transform  │
└──────┬──────┘                   └──────┬──────┘
       │                                  │
       └──────────┬───────────────────────┘
                  │
                  ▼
         ┌───────────────┐
         │   UNIFIED     │
         │   PRODUCT     │
         │   SCHEMA      │
         └───────┬───────┘
                 │
       ┌─────────┴─────────┐
       │                   │
       ▼                   ▼
┌─────────────┐     ┌─────────────┐
│   Export    │     │   Export    │
│  Transform  │     │  Transform  │
│ WooCommerce │     │   Shopify   │
└─────────────┘     └─────────────┘


PHASE 3: Add Gallery Store
──────────────────────────

Gallery Store JSON  ◄──► Unified Schema ◄──► Platforms
```

---

## Phase 1: WooCommerce → Shopify Migration

**Objective:** Validate one-way export from WooCommerce to Shopify using official sample data.

**Duration:** 1 week

### Milestone 1.1: Test Data Setup
**Time:** 2 hours

**Steps:**
1. Download official WooCommerce sample CSV from GitHub
2. Import sample products to test WooCommerce store (rapidwoo.com/commerce)
3. Document what imported successfully

**Acceptance Criteria:**
- [ ] 27 sample products imported to WooCommerce
- [ ] Products visible in WooCommerce admin
- [ ] Screenshot documenting import

**Verification:**
```bash
# Check WooCommerce products via API
curl "https://rapidwoo.com/commerce/wp-json/wc/v3/products?per_page=50" \
  -u ck_xxx:cs_xxx | jq '.[] | {id, name, type}'
```

---

### Milestone 1.2: WooCommerce Import Transform
**Time:** 1 day

**Create:** `src/lib/transforms/woocommerce-import.ts`

**Steps:**
1. Fetch products from WooCommerce API
2. Transform to unified schema
3. Store in Supabase with `source_platform: 'woocommerce'`

**Input (WooCommerce REST API):**
```typescript
interface WooCommerceProduct {
  id: number
  name: string
  slug: string
  type: 'simple' | 'variable' | 'grouped' | 'external'
  status: 'publish' | 'draft' | 'private'
  description: string
  short_description: string
  sku: string
  price: string
  regular_price: string
  sale_price: string
  weight: string               // lbs
  dimensions: { length, width, height }
  categories: { id, name, slug }[]
  tags: { id, name, slug }[]
  images: { id, src, alt }[]
  attributes: { id, name, position, visible, variation, options }[]
  variations: number[]         // IDs of variation products
  meta_data: { key, value }[]
}
```

**Output (Unified Schema):**
```typescript
interface UnifiedProduct {
  // Identity
  id: string                   // Commerce Hub UUID
  externalId: string           // Platform's ID (for updates)
  sourcePlatform: 'woocommerce' | 'shopify' | 'gallery-store'
  handle: string               // URL slug
  
  // Core
  title: string
  description: string
  shortDescription: string
  
  // Pricing (stored in cents to avoid float issues)
  price: number                // Regular price in cents
  compareAtPrice: number | null // Sale comparison price
  costPerItem: number | null   // Cost for profit calculations
  
  // Inventory
  sku: string
  barcode: string | null
  trackInventory: boolean
  inventoryQuantity: number
  
  // Physical
  weight: number               // Always grams (convert from lbs)
  weightUnit: 'g'              // Normalized
  dimensions: {
    length: number             // cm
    width: number
    height: number
  } | null
  
  // Taxonomy
  productType: string          // simple, variable, etc.
  categories: string[]         // Flat list of names
  tags: string[]
  vendor: string
  
  // Media
  images: {
    src: string
    alt: string
    position: number
  }[]
  
  // Variants (for variable products)
  hasVariants: boolean
  options: {
    name: string               // "Color", "Size"
    values: string[]           // ["Red", "Blue"]
  }[]
  variants: {
    id: string
    title: string
    sku: string
    price: number              // cents
    compareAtPrice: number | null
    inventoryQuantity: number
    option1: string | null
    option2: string | null
    option3: string | null
    weight: number             // grams
    barcode: string | null
  }[]
  
  // Status
  status: 'active' | 'draft' | 'archived'
  
  // Metadata
  createdAt: string
  updatedAt: string
  
  // Platform-specific (preserved for round-trip)
  platformMeta: Record<string, unknown>
}
```

**Transform Rules:**
| WooCommerce | Unified | Transformation |
|-------------|---------|----------------|
| `id` | `externalId` | `String(id)` |
| `name` | `title` | Direct copy |
| `slug` | `handle` | Direct copy |
| `regular_price` | `price` | `parseFloat(price) * 100` (dollars → cents) |
| `sale_price` | `compareAtPrice` | If sale_price set, regular_price becomes compareAtPrice |
| `weight` | `weight` | `parseFloat(weight) * 453.592` (lbs → grams) |
| `status: 'publish'` | `status: 'active'` | Map values |
| `categories[].name` | `categories` | Extract names to flat array |
| `type` | `productType` | Direct copy |

**Acceptance Criteria:**
- [ ] Transform function created with TypeScript types
- [ ] All 27 sample products import without errors
- [ ] Prices correctly converted to cents
- [ ] Weights correctly converted to grams
- [ ] Categories extracted as flat string array
- [ ] Simple and variable products both handled

**Verification:**
```sql
-- Check imported products in Supabase
SELECT title, price, weight, categories, product_type 
FROM products 
WHERE source_platform = 'woocommerce' 
LIMIT 5;
```

---

### Milestone 1.3: Shopify Export Transform
**Time:** 1 day

**Create:** `src/lib/transforms/shopify-export.ts`

**Steps:**
1. Read unified products from Supabase
2. Transform to Shopify format
3. Push via Shopify Admin API

**Output (Shopify Admin API):**
```typescript
interface ShopifyProductCreate {
  title: string
  body_html: string
  vendor: string
  product_type: string
  handle: string              // URL slug
  tags: string                // Comma-separated
  status: 'active' | 'draft' | 'archived'
  variants: {
    price: string             // "19.99"
    compare_at_price?: string
    sku?: string
    barcode?: string
    weight: number            // Shopify uses grams natively
    weight_unit: 'g'
    inventory_quantity?: number
    inventory_management?: 'shopify' | null
    option1?: string
    option2?: string
    option3?: string
  }[]
  options?: {
    name: string
    values: string[]
  }[]
  images?: {
    src: string
    alt?: string
    position?: number
  }[]
}
```

**Transform Rules:**
| Unified | Shopify | Transformation |
|---------|---------|----------------|
| `title` | `title` | Direct copy |
| `description` | `body_html` | Wrap in `<p>` tags |
| `handle` | `handle` | Direct copy |
| `price` | `variants[0].price` | `(price / 100).toFixed(2)` (cents → dollars string) |
| `weight` | `variants[0].weight` | Direct (both use grams) |
| `categories` | `product_type` | Use first category |
| `tags` | `tags` | `tags.join(', ')` |
| `status` | `status` | Direct (same values) |

**Acceptance Criteria:**
- [ ] Transform function created with TypeScript types
- [ ] All 27 products push to Shopify without API errors
- [ ] Prices display correctly in Shopify admin
- [ ] Images attached successfully
- [ ] Products visible on Shopify storefront

**Verification:**
```bash
# Check products in Shopify via API
curl -X GET "https://{shop}.myshopify.com/admin/api/2024-01/products.json" \
  -H "X-Shopify-Access-Token: {token}" | jq '.products | length'
```

---

### Milestone 1.4: End-to-End Validation
**Time:** 1 day

**Steps:**
1. Export 5 specific WooCommerce products (known good data)
2. Import to Commerce Hub
3. Export to Shopify
4. Compare original WooCommerce vs final Shopify

**Test Matrix:**

| Product | Type | Has Variants | Has Image | Expected Result |
|---------|------|--------------|-----------|-----------------|
| V-Neck T-Shirt | variable | Yes (colors/sizes) | Yes | Variants preserved |
| Beanie | simple | No | Yes | Simple product |
| Belt | simple | No | Yes | Simple product |
| Hoodie with Logo | variable | Yes | Yes | Options preserved |
| Cap | simple | No | Yes | Simple product |

**Comparison Checklist:**
- [ ] Titles match exactly
- [ ] Descriptions match (allowing HTML differences)
- [ ] Prices within $0.01
- [ ] SKUs match
- [ ] Variant count matches
- [ ] Image count matches
- [ ] Categories/product_type reasonable mapping

**Acceptance Criteria:**
- [ ] All 5 test products complete round-trip
- [ ] No data loss in critical fields
- [ ] Documented any field losses (acceptable vs unacceptable)

---

## Phase 2: Shopify → WooCommerce (Reverse)

**Objective:** Validate reverse direction to prove transforms are truly bidirectional.

**Duration:** 1 week

### Milestone 2.1: Shopify Import Transform
**Time:** 1 day

**Create:** `src/lib/transforms/shopify-import.ts`

**Acceptance Criteria:**
- [ ] Import transform handles Shopify product structure
- [ ] Variants properly parsed into unified format
- [ ] Weight already in grams (no conversion needed)
- [ ] Options extracted correctly

---

### Milestone 2.2: WooCommerce Export Transform
**Time:** 1 day

**Create:** `src/lib/transforms/woocommerce-export.ts`

**Transform Rules:**
| Unified | WooCommerce | Transformation |
|---------|-------------|----------------|
| `price` | `regular_price` | `(price / 100).toFixed(2)` |
| `weight` | `weight` | `weight / 453.592` (grams → lbs) |
| `status: 'active'` | `status: 'publish'` | Map values |
| `categories` | `categories` | Need category ID lookup |

**Category Challenge:**
WooCommerce requires category IDs, not names. Solution:
1. Fetch all WooCommerce categories on store connect
2. Cache name→ID mapping
3. Look up IDs during export transform

**Acceptance Criteria:**
- [ ] Export transform handles all unified fields
- [ ] Category name→ID resolution works
- [ ] Weight converted back to lbs
- [ ] Variable products export with variations

---

### Milestone 2.3: Reverse End-to-End Validation
**Time:** 1 day

**Steps:**
1. Start with 5 Shopify products
2. Import to Commerce Hub
3. Export to WooCommerce
4. Compare original vs result

**Acceptance Criteria:**
- [ ] All 5 products complete reverse round-trip
- [ ] Data integrity maintained
- [ ] Documented any asymmetric field losses

---

## Phase 3: Gallery Store Integration

**Objective:** Retrofit Gallery Store JSON to use unified schema.

**Duration:** 1 week

### Milestone 3.1: Gallery Store Schema Analysis
**Time:** 2 hours

**Current Gallery Store JSON structure:**
```typescript
interface GalleryStoreArtwork {
  title: string
  artist: string
  year_created: string
  medium: string
  image: string                // Smithsonian URL
  museum: string
  location: string
  description: string
  accession_number: string
  smithsonian_id: string
  object_type: string
  dimensions: string
  credit_line: string
  created_date: string
}
```

**Missing for Unified Schema:**
- `price` - Not in Smithsonian data (art prints need pricing)
- `sku` - Need to generate
- `weight` - Physical print weight
- `categories` - Map from museum/medium
- `inventory` - Default stock level

**Extra Fields (Gallery-Specific):**
- `artist` → Store in `vendor`
- `year_created` → Store in `platformMeta`
- `medium` → Store in `platformMeta` or `tags`
- `museum`, `credit_line` → Store in `platformMeta`

---

### Milestone 3.2: Gallery Store Import Transform
**Time:** 1 day

**Create:** `src/lib/transforms/gallery-store-import.ts`

**Transform Rules:**
| Gallery Store | Unified | Transformation |
|---------------|---------|----------------|
| `title` | `title` | Direct copy |
| `artist` | `vendor` | Direct copy |
| `description` | `description` | Direct copy |
| `image` | `images[0].src` | Cloudinary proxy for Smithsonian URLs |
| (none) | `price` | Default: 4999 ($49.99 for art print) |
| (none) | `sku` | Generate: `GS-{smithsonian_id}` |
| `medium` | `tags` | Include as tag |
| `museum` | `categories` | Use as category |
| `year_created`, `medium`, etc. | `platformMeta` | Preserve for round-trip |

**Acceptance Criteria:**
- [ ] All 110 Gallery Store artworks import
- [ ] Smithsonian images proxied through Cloudinary
- [ ] Default pricing applied
- [ ] SKUs generated consistently
- [ ] Artist preserved in vendor field

---

### Milestone 3.3: Gallery Store Export Transform  
**Time:** 1 day

**Create:** `src/lib/transforms/gallery-store-export.ts`

**Purpose:** Update Gallery Store JSON from Commerce Hub edits.

**Acceptance Criteria:**
- [ ] Can update Gallery Store JSON via GitHub API
- [ ] Preserves Smithsonian metadata
- [ ] Price/title changes reflected

---

### Milestone 3.4: Full Three-Way Validation
**Time:** 1 day

**Test Flow:**
```
Gallery Store → Commerce Hub → WooCommerce
                            → Shopify
```

**Test Products:** 5 artworks from different artists

**Acceptance Criteria:**
- [ ] Artworks appear correctly in WooCommerce
- [ ] Artworks appear correctly in Shopify
- [ ] Images display (Cloudinary proxy working)
- [ ] Prices editable in Commerce Hub, push to platforms

---

## Phase 4: UI Integration & Polish

**Objective:** Update Commerce Hub UI to enable cross-platform operations.

**Duration:** 3-4 days

### Milestone 4.1: Remove Platform Restrictions
**Time:** 4 hours

**Change:** Allow any product to be pushed to any connected store.

**File:** `src/pages/products/ProductEdit.tsx`

**Acceptance Criteria:**
- [ ] Gallery Store products can push to WooCommerce
- [ ] Gallery Store products can push to Shopify
- [ ] Any product can push to any platform

---

### Milestone 4.2: Import Wizard
**Time:** 1 day

**Create:** `src/pages/sync/ImportWizard.tsx`

**Features:**
- Select source: WooCommerce, Shopify, Gallery Store, CSV upload
- Preview products before import
- Show field mapping
- Import progress indicator

---

### Milestone 4.3: Export/Sync UI
**Time:** 1 day

**Create:** `src/pages/sync/ExportWizard.tsx`

**Features:**
- Select products (checkbox multi-select)
- Select target platform(s)
- Preview transformed data
- Bulk push with progress

---

### Milestone 4.4: Sync Status Dashboard
**Time:** 1 day

**Create:** `src/pages/sync/SyncStatus.tsx`

**Features:**
- Show last sync time per platform
- Show sync errors
- Manual re-sync buttons
- Sync log history

---

## File Structure

```
commerce-hub/
├── src/
│   ├── types/
│   │   └── product.ts              # UnifiedProduct interface
│   ├── lib/
│   │   └── transforms/
│   │       ├── index.ts            # Export all transforms
│   │       ├── woocommerce-import.ts
│   │       ├── woocommerce-export.ts
│   │       ├── shopify-import.ts
│   │       ├── shopify-export.ts
│   │       ├── gallery-store-import.ts
│   │       ├── gallery-store-export.ts
│   │       └── utils.ts            # Shared helpers (weight conversion, etc.)
│   └── pages/
│       └── sync/
│           ├── ImportWizard.tsx
│           ├── ExportWizard.tsx
│           └── SyncStatus.tsx
├── docs/
│   ├── PRODUCT-SYNC-SPECIFICATION.md  # This document
│   └── csv-reference/
│       ├── CSV-FORMAT-REFERENCE.md
│       ├── woocommerce-sample.csv
│       └── shopify-sample.csv
└── tests/
    └── transforms/
        ├── woocommerce-import.test.ts
        ├── shopify-export.test.ts
        └── round-trip.test.ts
```

---

## Success Metrics

| Metric | Target |
|--------|--------|
| WooCommerce → Shopify success rate | 100% of sample products |
| Shopify → WooCommerce success rate | 100% of sample products |
| Gallery Store → Platforms success rate | 100% of artworks |
| Data integrity (round-trip) | No loss of critical fields |
| Transform execution time | < 100ms per product |
| Bulk sync (100 products) | < 60 seconds |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| WooCommerce category ID lookup fails | Medium | Cache categories on connect, fallback to uncategorized |
| Smithsonian images blocked by platforms | High | Cloudinary proxy (already implemented) |
| Shopify API rate limits | Medium | Batch requests, add delays |
| Variable product transforms complex | High | Start with simple products, add variants incrementally |
| Platform API changes | Low | Pin API versions, document dependencies |

---

## Definition of Done

A milestone is complete when:
1. Code is pushed to GitHub
2. Vercel deployment succeeds
3. Acceptance criteria verified with screenshots/logs
4. Documentation updated if needed
5. No console errors in production

---

## Getting Started (Next Session)

```
I'm continuing the Product Sync project. Current milestone: 1.1 (Test Data Setup)

Please:
1. Read /mnt/project/docs/PRODUCT-SYNC-SPECIFICATION.md
2. Fetch WooCommerce sample CSV from official repo
3. Help me import to rapidwoo.com/commerce

Let's verify each step before moving to the next.
```

---

*Version: 1.0*
*Created: December 31, 2024*
*Status: Phase 1 - Ready to Start*
