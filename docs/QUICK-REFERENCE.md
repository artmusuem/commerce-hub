# Product Sync - Quick Reference

## Current Phase: 1 - WooCommerce → Shopify

## Milestone Checklist

### Phase 1: WooCommerce → Shopify (Week 1)
- [ ] **M1.1** Import WooCommerce sample data (27 products)
- [ ] **M1.2** Create `woocommerce-import.ts` transform
- [ ] **M1.3** Create `shopify-export.ts` transform  
- [ ] **M1.4** Validate end-to-end with 5 test products

### Phase 2: Shopify → WooCommerce (Week 2)
- [ ] **M2.1** Create `shopify-import.ts` transform
- [ ] **M2.2** Create `woocommerce-export.ts` transform
- [ ] **M2.3** Validate reverse direction

### Phase 3: Gallery Store (Week 3)
- [ ] **M3.1** Analyze Gallery Store JSON schema
- [ ] **M3.2** Create `gallery-store-import.ts` transform
- [ ] **M3.3** Create `gallery-store-export.ts` transform
- [ ] **M3.4** Validate three-way sync

### Phase 4: UI Polish (Week 3-4)
- [ ] **M4.1** Remove platform restrictions in UI
- [ ] **M4.2** Import wizard
- [ ] **M4.3** Export wizard
- [ ] **M4.4** Sync status dashboard

---

## Key Transforms

| Direction | File | Status |
|-----------|------|--------|
| WooCommerce → Unified | `woocommerce-import.ts` | TODO |
| Unified → Shopify | `shopify-export.ts` | TODO |
| Shopify → Unified | `shopify-import.ts` | TODO |
| Unified → WooCommerce | `woocommerce-export.ts` | TODO |
| Gallery Store → Unified | `gallery-store-import.ts` | TODO |
| Unified → Gallery Store | `gallery-store-export.ts` | TODO |

---

## Critical Conversions

```
PRICES:
  dollars → cents:  price * 100
  cents → dollars:  (price / 100).toFixed(2)

WEIGHTS:
  lbs → grams:      weight * 453.592
  grams → lbs:      weight / 453.592
  kg → grams:       weight * 1000
  oz → grams:       weight * 28.3495

STATUS:
  WooCommerce 'publish' = Unified 'active'
  WooCommerce 'draft'   = Unified 'draft'
  WooCommerce 'private' = Unified 'archived'
  Shopify uses same as Unified
```

---

## Test Data

| Platform | Source | Product Count |
|----------|--------|---------------|
| WooCommerce | Official sample CSV | 27 |
| Shopify | Official sample CSVs | 94 |
| Gallery Store | Smithsonian JSON | 110 |

---

## Verification Commands

```bash
# Check WooCommerce products
curl "https://rapidwoo.com/commerce/wp-json/wc/v3/products?per_page=5" \
  -u ck_e230e6dffb1f1a6d84b699d1b997b9666b015545:cs_4bd4aa392d6bfda27d71cf610629f582600574c3

# Check Supabase products
curl "https://owfyxfeaialumomzsejd.supabase.co/rest/v1/products?select=title,price&limit=5" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93Znl4ZmVhaWFsdW1vbXpzZWpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTYxMjEsImV4cCI6MjA4MTY3MjEyMX0.qqhS5hud9ilAgdOV9M0zlkAcqrPxKakJobwMMPMVAcI"

# Check Gallery Store JSON
curl "https://ecommerce-react-beta-woad.vercel.app/data/winslow-homer.json" | head -50
```

---

## Session Starter

```
I'm continuing the Product Sync project.

Current milestone: [X.X]
Last completed: [describe]

Please:
1. Read docs/PRODUCT-SYNC-SPECIFICATION.md
2. Check src/types/product.ts 
3. [specific task]
```

---

## Files

```
commerce-hub/
├── docs/
│   └── PRODUCT-SYNC-SPECIFICATION.md   ✅ Created
├── src/
│   ├── types/
│   │   └── product.ts                   ✅ Created
│   └── lib/
│       └── transforms/
│           ├── index.ts                 TODO
│           ├── woocommerce-import.ts    TODO (M1.2)
│           ├── shopify-export.ts        TODO (M1.3)
│           ├── shopify-import.ts        TODO (M2.1)
│           ├── woocommerce-export.ts    TODO (M2.2)
│           ├── gallery-store-import.ts  TODO (M3.2)
│           ├── gallery-store-export.ts  TODO (M3.3)
│           └── utils.ts                 TODO
```

---

*Last Updated: December 31, 2024*
