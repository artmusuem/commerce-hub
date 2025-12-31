# Commerce Hub - Bi-Directional Product Sync

## Project Specification v1.0

---

## Executive Summary

**Goal:** Enable seamless product synchronization between WooCommerce and Shopify platforms through Commerce Hub, allowing products to flow in either direction while preserving platform-specific attributes.

**Success Criteria:**
- Import products from WooCommerce → Commerce Hub → Export to Shopify
- Import products from Shopify → Commerce Hub → Export to WooCommerce
- Preserve all critical product data (title, description, price, images, variants, inventory)
- Handle platform-specific field transformations correctly
- Provide clear sync status and error reporting

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         COMMERCE HUB                                │
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │  IMPORT     │    │  UNIFIED    │    │  EXPORT     │            │
│  │  TRANSFORMS │ → │  PRODUCT    │ → │  TRANSFORMS │            │
│  │             │    │  SCHEMA     │    │             │            │
│  └─────────────┘    └─────────────┘    └─────────────┘            │
│        ↑                                      ↓                    │
└────────┼──────────────────────────────────────┼────────────────────┘
         │                                      │
    ┌────┴────┐                            ┌────┴────┐
    │         │                            │         │
┌───▼───┐ ┌───▼───┐                    ┌───▼───┐ ┌───▼───┐
│ WOO   │ │SHOPIFY│                    │ WOO   │ │SHOPIFY│
│COMMERCE│ │      │                    │COMMERCE│ │      │
└───────┘ └───────┘                    └───────┘ └───────┘
   SOURCE PLATFORMS                      TARGET PLATFORMS
```

---

## Milestones

### M1: Unified Product Schema
**Objective:** Define the canonical product structure that Commerce Hub uses internally.

**Deliverables:**
- [ ] `src/types/product.ts` - TypeScript interfaces for unified product schema
- [ ] Schema documentation in `docs/UNIFIED-SCHEMA.md`
- [ ] Database migration if needed (Supabase)

**Verification:**
- [ ] TypeScript compiles without errors
- [ ] Schema covers all fields from both WooCommerce and Shopify samples
- [ ] Schema handles variants/variations properly

**Acceptance Test:**
```typescript
// A valid unified product should satisfy this interface
const product: UnifiedProduct = {
  id: 'uuid',
  externalId: 'platform-id',
  platform: 'woocommerce' | 'shopify',
  title: 'Product Name',
  // ... all fields documented and typed
}
```

---

### M2: WooCommerce Import Transform
**Objective:** Convert WooCommerce product data to unified schema.

**Deliverables:**
- [ ] `src/lib/transforms/woocommerce-to-unified.ts`
- [ ] Unit tests with official WooCommerce sample data
- [ ] Handle all product types: simple, variable, variation, grouped, external

**Verification:**
- [ ] Import `woocommerce-sample-products.csv` (27 products)
- [ ] All products appear in Commerce Hub with correct data
- [ ] Variants linked to parent products correctly
- [ ] Categories preserved (flattened if needed)
- [ ] Images imported with correct URLs

**Acceptance Test:**
```bash
# Import official sample
npm run test:import:woocommerce

# Expected: 27 products imported
# - 15 simple products
# - 2 variable products with 9 variations
# - 1 grouped product
# - 1 external product
```

---

### M3: Shopify Import Transform
**Objective:** Convert Shopify product data to unified schema.

**Deliverables:**
- [ ] `src/lib/transforms/shopify-to-unified.ts`
- [ ] Unit tests with official Shopify sample data
- [ ] Handle variants (same Handle, different options)

**Verification:**
- [ ] Import `shopify-apparel-sample.csv` (21 products)
- [ ] Import `shopify-jewelry-sample.csv` (53 products with variants)
- [ ] All products appear in Commerce Hub with correct data
- [ ] Variants grouped correctly under parent products
- [ ] Weight converted from grams to standard unit

**Acceptance Test:**
```bash
# Import official samples
npm run test:import:shopify

# Expected: 
# - Apparel: 21 products (some with size variants)
# - Jewelry: 53 rows → ~30 products with variants
```

---

### M4: WooCommerce Export Transform
**Objective:** Convert unified schema to WooCommerce format for push/CSV export.

**Deliverables:**
- [ ] `src/lib/transforms/unified-to-woocommerce.ts`
- [ ] CSV export function
- [ ] API push function (update existing `woocommerce.ts`)

**Verification:**
- [ ] Export products originally imported from Shopify
- [ ] Generated CSV matches WooCommerce schema exactly
- [ ] Push to WooCommerce API succeeds
- [ ] Verify in WooCommerce admin that data is correct

**Acceptance Test:**
```bash
# Round-trip test
1. Import Shopify jewelry sample → Commerce Hub
2. Export to WooCommerce CSV
3. Import that CSV into WooCommerce test store
4. Verify: Products appear correctly with variants, prices, images
```

---

### M5: Shopify Export Transform
**Objective:** Convert unified schema to Shopify format for push/CSV export.

**Deliverables:**
- [ ] `src/lib/transforms/unified-to-shopify.ts`
- [ ] CSV export function
- [ ] API push function (update existing `shopify.ts`)

**Verification:**
- [ ] Export products originally imported from WooCommerce
- [ ] Generated CSV matches Shopify schema exactly
- [ ] Push to Shopify API succeeds (via Admin API)
- [ ] Verify in Shopify admin that data is correct

**Acceptance Test:**
```bash
# Round-trip test
1. Import WooCommerce sample → Commerce Hub
2. Export to Shopify CSV
3. Import that CSV into Shopify dev store
4. Verify: Products appear correctly with variants, prices, images
```

---

### M6: UI Integration
**Objective:** Add import/export UI to Commerce Hub dashboard.

**Deliverables:**
- [ ] Import wizard with platform selection
- [ ] CSV upload functionality
- [ ] Export button with format selection
- [ ] Sync status indicators
- [ ] Error reporting with actionable messages

**Verification:**
- [ ] User can import via CSV upload
- [ ] User can import via API connection
- [ ] User can export to CSV (either format)
- [ ] User can push to connected store
- [ ] Errors display clearly with resolution steps

**Acceptance Test:**
```
Manual test flow:
1. Upload WooCommerce CSV → Products appear in list
2. Select products → Click "Export to Shopify CSV"
3. Download CSV → Import into Shopify
4. Products match original data
```

---

### M7: Full Integration Testing
**Objective:** End-to-end testing with real stores.

**Deliverables:**
- [ ] Test suite covering all sync scenarios
- [ ] Documentation of edge cases and limitations
- [ ] Performance benchmarks (products per second)

**Test Matrix:**

| Source | Target | Products | Variants | Images | Status |
|--------|--------|----------|----------|--------|--------|
| WooCommerce CSV | Commerce Hub | ✅ | ✅ | ✅ | |
| Shopify CSV | Commerce Hub | ✅ | ✅ | ✅ | |
| Commerce Hub | WooCommerce CSV | ✅ | ✅ | ✅ | |
| Commerce Hub | Shopify CSV | ✅ | ✅ | ✅ | |
| WooCommerce API | Commerce Hub | ✅ | ✅ | ✅ | |
| Commerce Hub | WooCommerce API | ✅ | ✅ | ✅ | |
| Shopify API | Commerce Hub | ✅ | ✅ | ✅ | |
| Commerce Hub | Shopify API | ✅ | ✅ | ✅ | |

**Acceptance Criteria:**
- [ ] All cells in test matrix pass
- [ ] No data loss in round-trip (WooCommerce → Hub → Shopify → Hub → WooCommerce)
- [ ] Performance: 100+ products sync in under 60 seconds

---

## Technical Specifications

### Unified Product Schema (Draft)

```typescript
interface UnifiedProduct {
  // Identity
  id: string;                    // Commerce Hub UUID
  externalId: string | null;     // Platform's product ID
  sourceStore: string;           // Store UUID in Commerce Hub
  sourcePlatform: 'woocommerce' | 'shopify' | 'manual';
  
  // Core
  title: string;
  handle: string;                // URL slug
  description: string;           // HTML allowed
  shortDescription?: string;     // WooCommerce only
  vendor?: string;               // Shopify only
  
  // Organization
  productType: string;
  categories: string[];          // Flattened hierarchy
  tags: string[];
  
  // Pricing (stored in cents to avoid float issues)
  price: number;
  compareAtPrice: number | null; // Original price if on sale
  costPerItem?: number;
  
  // Inventory
  sku: string;
  barcode?: string;
  trackInventory: boolean;
  inventoryQuantity: number;
  inventoryPolicy: 'deny' | 'continue';
  
  // Physical
  weight: number;                // Always stored in grams
  weightUnit: 'g' | 'kg' | 'lb' | 'oz';
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: 'cm' | 'in';
  };
  
  // Shipping & Tax
  requiresShipping: boolean;
  taxable: boolean;
  taxClass?: string;
  
  // Media
  images: ProductImage[];
  
  // Variants
  hasVariants: boolean;
  options: ProductOption[];      // e.g., [{name: 'Size', values: ['S', 'M', 'L']}]
  variants: ProductVariant[];
  
  // Status
  status: 'active' | 'draft' | 'archived';
  publishedAt: string | null;
  
  // SEO
  seoTitle?: string;
  seoDescription?: string;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
  
  // Platform-specific (preserved for round-trip)
  platformMeta?: Record<string, any>;
}

interface ProductImage {
  id?: string;
  src: string;
  alt?: string;
  position: number;
  variantIds?: string[];         // Which variants use this image
}

interface ProductOption {
  name: string;                  // e.g., "Size", "Color"
  position: number;
  values: string[];              // e.g., ["S", "M", "L"]
}

interface ProductVariant {
  id: string;
  externalId?: string;
  sku: string;
  title: string;                 // e.g., "Small / Red"
  options: Record<string, string>; // e.g., {Size: "S", Color: "Red"}
  price: number;
  compareAtPrice?: number;
  inventoryQuantity: number;
  weight?: number;
  image?: ProductImage;
  barcode?: string;
}
```

### Field Mapping Reference

See `docs/csv-reference/CSV-FORMAT-REFERENCE.md` for complete field-by-field mapping.

### Key Transformations

| Transformation | Rule |
|---------------|------|
| Weight: WooCommerce → Unified | `lbs * 453.592 = grams` |
| Weight: Unified → Shopify | Already in grams |
| Weight: Unified → WooCommerce | `grams / 453.592 = lbs` |
| Price: WooCommerce sale → Unified | `regular_price → compareAtPrice`, `sale_price → price` |
| Price: Unified → Shopify | `price → variant_price`, `compareAtPrice → compare_at_price` |
| Categories: WooCommerce → Unified | Split `Parent > Child` into array |
| Categories: Unified → Shopify | Join as tags or use product_type |
| Variants: WooCommerce → Unified | Match by `Parent` SKU |
| Variants: Unified → Shopify | Same `Handle`, increment rows |

---

## Development Workflow

### Per-Milestone Process

1. **Plan** - Review milestone requirements
2. **Implement** - Write code with TypeScript types
3. **Test** - Run against official sample data
4. **Verify** - Check acceptance criteria
5. **Document** - Update relevant docs
6. **Commit** - Meaningful commit message
7. **Deploy** - Push to GitHub → Vercel auto-deploys
8. **Validate** - Test on production

### Testing Strategy

```
Unit Tests (per transform function)
├── Input: Official sample CSV row
├── Output: Unified schema object
└── Assert: All fields mapped correctly

Integration Tests (per milestone)
├── Input: Full sample CSV file
├── Process: Import → Transform → Store
└── Assert: Database contains correct products

E2E Tests (M7)
├── Input: Real API connection
├── Process: Full sync workflow
└── Assert: Data matches in both platforms
```

### File Structure

```
commerce-hub/
├── src/
│   ├── types/
│   │   └── product.ts              # Unified schema interfaces
│   ├── lib/
│   │   ├── transforms/
│   │   │   ├── index.ts            # Export all transforms
│   │   │   ├── woocommerce-to-unified.ts
│   │   │   ├── shopify-to-unified.ts
│   │   │   ├── unified-to-woocommerce.ts
│   │   │   └── unified-to-shopify.ts
│   │   ├── csv/
│   │   │   ├── parser.ts           # CSV parsing utilities
│   │   │   └── generator.ts        # CSV generation utilities
│   │   ├── woocommerce.ts          # API client
│   │   └── shopify.ts              # API client
│   └── pages/
│       └── sync/
│           ├── import.tsx          # Import wizard
│           └── export.tsx          # Export wizard
├── tests/
│   ├── transforms/
│   │   ├── woocommerce.test.ts
│   │   └── shopify.test.ts
│   └── fixtures/
│       ├── woocommerce-sample.json
│       └── shopify-sample.json
└── docs/
    ├── csv-reference/              # Official samples & mapping
    └── SYNC-SPECIFICATION.md       # This document
```

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Field mapping gaps | Medium | High | Use official samples, document unsupported fields |
| API rate limits | Medium | Medium | Implement batching and backoff |
| Image hosting differences | Low | Medium | Copy images to neutral CDN or preserve URLs |
| Variant complexity | High | High | Start with simple products, iterate to complex |
| Price precision | Low | High | Store in cents, convert on display |

---

## Timeline Estimate

| Milestone | Estimated Days | Dependencies |
|-----------|---------------|--------------|
| M1: Unified Schema | 1 | None |
| M2: WooCommerce Import | 2 | M1 |
| M3: Shopify Import | 2 | M1 |
| M4: WooCommerce Export | 2 | M1, M2, M3 |
| M5: Shopify Export | 2 | M1, M2, M3 |
| M6: UI Integration | 3 | M4, M5 |
| M7: Full Testing | 2 | M6 |

**Total: ~14 days**

---

## Success Metrics

1. **Data Integrity:** 100% field preservation for supported fields
2. **Round-Trip Accuracy:** Product exported and re-imported matches original
3. **Performance:** 100 products/minute minimum
4. **Error Rate:** < 1% sync failures on valid data
5. **User Satisfaction:** Complete sync workflow in < 5 minutes

---

## Next Steps

1. **Review this specification** - Identify gaps or concerns
2. **Begin M1** - Define and implement unified schema
3. **Set up test fixtures** - Parse official samples into JSON for unit tests
4. **Iterate** - Complete one milestone at a time with verification

---

*Document Version: 1.0*
*Created: December 2024*
*Status: Ready for Review*
