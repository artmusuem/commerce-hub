# Commerce Hub - Development Roadmap

## Start Next Session With:

```
I'm continuing Commerce Hub development.
Read: /mnt/project/COMMERCE-HUB-HANDOFF.md
Current task: Step 1.2 - Fix WooCommerce category mapping
```

---

## Current State Assessment (Dec 31, 2024)

### ✅ What Works

| Feature | Status | Notes |
|---------|--------|-------|
| **Gallery Store → Commerce Hub** | ✅ Complete | 110 products importable |
| **Commerce Hub → WooCommerce** | ✅ Working | Creates new products, updates via external_id |
| **Commerce Hub → Shopify** | ✅ Working | Creates new products, updates via external_id |
| **Supabase CRUD** | ✅ Working | Products, stores, relationships |
| **OAuth flows** | ✅ Shopify | WooCommerce uses API keys |
| **Cloudinary image proxy** | ✅ Working | Fixes Smithsonian URL issues |
| **Platform-aware transforms** | ✅ Working | Different formats per platform |
| **Variant editing (Shopify)** | ✅ Working | Inline price/SKU/inventory edits |
| **Variation editing (WooCommerce)** | ✅ Working | Inline price updates |
| **Digital downloads** | ✅ Working | File URL/name fields |

### ⚠️ Identified Issues

| Issue | Impact | Priority |
|-------|--------|----------|
| **Tags not syncing to Shopify** | Tags entered in Commerce Hub aren't appearing on Shopify products | HIGH |
| **Categories not mapping (WooCommerce)** | Products push without category assignment | HIGH |
| **No two-way sync** | Platform changes don't reflect in Commerce Hub | MEDIUM |
| **One product at a time** | No bulk push operations | MEDIUM |
| **Images don't update** | Only creates on first push, no gallery sync | LOW |
| **Inventory not syncing** | Stock levels managed separately | LOW |

---

## Phase 1: Fix Current Issues (Priority: HIGH)

### Step 1.1: Fix Shopify Tags Not Syncing

**Problem:** Gallery Store products pushed to Shopify show empty Tags field.

**Root Cause:** `transformToShopify()` already has fallback logic:
```typescript
const tags = shopifyTags 
  ? shopifyTags.split(',').map(t => t.trim()).join(', ')
  : product.artist ? `art, print, ${product.artist.toLowerCase()}` : 'art, print'
```

The fallback should generate tags from artist name (e.g., "art, print, winslow homer"), but the `tags` variable isn't being included in the payload, OR the payload structure has an issue.

**Investigation needed:**
1. Check if `tags` is actually in the ShopifyPushPayload being sent
2. Verify Shopify API is receiving the tags field
3. Check if Shopify API requires different format

**Quick Fix (if tags missing from payload):**
```
Files to check:
- src/lib/transforms.ts → Verify tags in payload object
- api/shopify/products.js → Log the product being sent
```

**Verification:**
1. Push a Gallery Store product (Winslow Homer artwork)
2. Check Shopify admin → Tags should show "art, print, winslow homer"

**Estimated effort:** 30 minutes

---

### Step 1.2: Fix WooCommerce Category Mapping

**Problem:** Products push to WooCommerce without categories because categoryMap isn't populated from the imported categories.

**Current State:**
- WooCommerce categories ARE fetched on store connection (stored in `api_credentials.categories`)
- ProductEdit.tsx shows category dropdown for WooCommerce products ✓
- transformToWooCommerce accepts categoryMap but often gets undefined

**Root Cause:** The categoryMap is built in ProductEdit.tsx but only works for products that already have a category assigned from WooCommerce. Gallery Store products have categories like "Paintings" but WooCommerce expects `[{id: 15}]`.

**Fix Required:**
```
Files to modify:
- src/pages/products/ProductEdit.tsx
  → Build categoryMap from ALL WooCommerce stores' categories
  → Pass categoryMap to transformToWooCommerce call

- Consider adding category mapping table:
  → Map "Paintings" → WooCommerce ID 15
  → Map "Art Print" → WooCommerce ID 23
```

**Steps:**
1. Fetch categories from WooCommerce store credentials
2. Build lowercase name → ID map
3. Pass to transform function
4. Category from Commerce Hub product matches to WooCommerce ID

**Verification:**
1. Push a Gallery Store product (category: "Paintings")
2. Check WooCommerce → Should have category assigned

**Estimated effort:** 1-2 hours

---

### Step 1.3: Ensure Update vs Create Logic Works Consistently

**Problem:** Cross-platform pushes can cause confusion (pushing Shopify product to WooCommerce uses wrong external_id).

**Current State:**
- ProductEdit.tsx already has platform-aware logic ✓
- Only uses external_id for updates if productPlatform matches target

**Review needed:** Confirm this logic is solid by testing:
1. Import product from Shopify
2. Edit in Commerce Hub
3. Push back to Shopify (should UPDATE, not create new)
4. Push to WooCommerce (should CREATE new)

**Verification checklist:**
- [ ] Shopify → Shopify update works (external_id used)
- [ ] Shopify → WooCommerce creates new (external_id ignored)
- [ ] WooCommerce → WooCommerce update works
- [ ] WooCommerce → Shopify creates new
- [ ] Gallery Store → WooCommerce creates new
- [ ] Gallery Store → Shopify creates new

**Estimated effort:** 1 hour testing

---

## Phase 2: Bulk Operations

### Step 2.1: Bulk Push from Products List

**Goal:** Select multiple products, push all to selected store

**Implementation:**
```
Files to create/modify:
- src/pages/products/ProductList.tsx
  → Add checkboxes for selection
  → Add "Push Selected" button
  → Store modal/dropdown

- src/lib/woocommerce.ts
  → Add batch create endpoint (WooCommerce supports batch)

- api/woocommerce/batch.js
  → New endpoint for batch operations
```

**WooCommerce Batch API:**
```javascript
POST /wp-json/wc/v3/products/batch
{
  create: [product1, product2, ...],
  update: [product3, product4, ...],
  delete: [5, 6, ...]
}
```

**Shopify Batch:** Shopify doesn't have true batch - use Promise.all with rate limiting

**Verification:**
1. Select 5 products
2. Click "Push to WooCommerce"
3. All 5 created/updated in one operation

**Estimated effort:** 3-4 hours

---

### Step 2.2: Bulk Import from WooCommerce

**Goal:** Import all WooCommerce products with deduplication

**Current state:** WooCommerceConnect.tsx imports products but may create duplicates

**Fix:**
- On import, check if external_id already exists
- Update existing instead of creating new
- Show "Updated: X, Created: Y" summary

**Estimated effort:** 1-2 hours

---

## Phase 3: Two-Way Sync

### Step 3.1: Pull Changes from WooCommerce

**Goal:** "Sync Now" button that pulls latest from WooCommerce and updates Supabase

**Implementation:**
```
src/pages/stores/StoreDetail.tsx (or similar)
  → Add "Sync Now" button per store
  → Fetch all products from WooCommerce
  → Match by external_id
  → Update Supabase with latest values
  → Show diff/summary
```

**Conflict resolution strategy:**
- Option A: Platform wins (always overwrite Commerce Hub)
- Option B: Newer wins (compare updated_at timestamps)
- Option C: Manual (show diff, let user choose)

**Recommended:** Start with Option A (platform wins) for simplicity

**Estimated effort:** 4-5 hours

---

### Step 3.2: Pull Changes from Shopify

**Same as 3.1 but for Shopify:**
- Use Shopify Products API (already have fetch function)
- Match by external_id
- Handle variants sync (more complex than WooCommerce)

**Estimated effort:** 4-5 hours

---

## Phase 4: Enhanced Product Management

### Step 4.1: Image Gallery Sync

**Problem:** Only primary image syncs, additional images ignored

**Fix:**
- Store `images` JSONB array in products table (already exists!)
- On import, save all images
- On push, send all images to platform

**WooCommerce:** `images: [{src: url1}, {src: url2}]`
**Shopify:** `images: [{src: url1}, {src: url2}]`

**Estimated effort:** 2 hours

---

### Step 4.2: Inventory Sync

**Goal:** Stock levels update across platforms

**Implementation:**
```
products table:
  ADD inventory_quantity INTEGER
  ADD inventory_management TEXT ('manual', 'shopify', 'woocommerce')

On sync:
  → Update inventory from source platform
  → Optionally push inventory changes to platforms
```

**WooCommerce:** `stock_quantity`, `manage_stock`
**Shopify:** Via Inventory API (more complex, requires inventory_item_id)

**Estimated effort:** 4-6 hours

---

### Step 4.3: Order Management (Future)

**Goal:** View orders from all platforms in one dashboard

**Scope:**
- Read-only initially
- Show order details, status
- Link to platform admin for fulfillment

**Estimated effort:** 8-12 hours

---

## Implementation Order (Recommended)

### Week 1: Fix Current Issues
1. ✅ Step 1.1: Fix Shopify tags (30 min) - DONE
2. ⬜ Step 1.2: Fix WooCommerce categories (2 hr) - **NEXT**
3. ✅ Step 1.3: Cross-platform update logic (1 hr) - DONE (platform_ids)

### Week 2: Bulk Operations
4. Step 2.1: Bulk push (4 hr)
5. Step 2.2: Bulk import with deduplication (2 hr)

### Week 3: Two-Way Sync
6. Step 3.1: Pull from WooCommerce (5 hr)
7. Step 3.2: Pull from Shopify (5 hr)

### Week 4: Polish
8. Step 4.1: Image gallery sync (2 hr)
9. Step 4.2: Inventory sync (6 hr)
10. Documentation and testing (4 hr)

---

## Clear Goal Statement

**By end of Phase 2:**
> Commerce Hub is a fully functional multi-channel product management system where users can:
> 1. Import products from WooCommerce, Shopify, or Gallery Store
> 2. Edit products centrally (price, description, images, categories, tags)
> 3. Push changes to any connected platform with proper category/tag mapping
> 4. Perform bulk operations (push 10+ products at once)

**By end of Phase 3:**
> Add two-way sync: Changes made in WooCommerce/Shopify are pulled back to Commerce Hub with a single click.

---

## Quick Reference: Testing Checklist

### After each change, verify:
- [ ] Products page loads without errors
- [ ] Edit page shows all fields correctly
- [ ] Save to Supabase works
- [ ] Push to WooCommerce creates/updates correctly
- [ ] Push to Shopify creates/updates correctly
- [ ] Categories appear on WooCommerce products
- [ ] Tags appear on Shopify products
- [ ] No console errors in browser

### Test Products:
- Gallery Store product: "High Cliff, Coast of Maine" by Winslow Homer
- WooCommerce product: Any from rapidwoo.com/commerce
- Shopify product: Any from dev store

---

## Files to Modify (Summary)

| Phase | File | Change |
|-------|------|--------|
| 1.1 | ShopifyConnect.tsx | Store tags in products.tags |
| 1.2 | ProductEdit.tsx | Build categoryMap from all stores |
| 1.3 | ProductEdit.tsx | Already done, verify logic |
| 2.1 | ProductList.tsx | Add selection + bulk push UI |
| 2.1 | api/woocommerce/batch.js | New batch endpoint |
| 2.2 | WooCommerceConnect.tsx | Dedupe on import |
| 3.1 | StoreDetail.tsx | Add sync button + pull logic |
| 3.2 | StoreDetail.tsx | Same for Shopify |
| 4.1 | transforms.ts | Include all images in push |
| 4.2 | transforms.ts | Include inventory fields |

---

*Generated: December 31, 2024*
*Next Session: Start with Step 1.1 (Shopify tags)*
