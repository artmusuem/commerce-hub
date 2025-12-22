# Commerce Hub - Shopify State of the Art Integration

## Vision
Match or exceed Nembol/Sellbrite UX for Shopify product management with clean, professional UI.

---

## Phase 1: Enhanced Product Editor (Priority: HIGH)

### 1.1 Vendor Field
**Current:** Hardcoded to store name
**Goal:** Editable vendor field that syncs both ways

```typescript
// Add to ProductEdit state
const [vendor, setVendor] = useState('')

// Load from product
setVendor(product.artist || store.store_name || '')

// Save to Shopify
vendor: vendor || store.store_name
```

### 1.2 Full Variant Support
**Current:** Only first variant imported, no editing
**Goal:** Display all variants, edit prices/SKUs/inventory inline

```typescript
// New interface
interface ShopifyVariant {
  id: number
  title: string           // "Small / Blue"
  price: string
  sku: string
  inventory_quantity: number
  option1: string | null  // "Small"
  option2: string | null  // "Blue"
  option3: string | null
}

// Store in products table
variants: JSONB  // Array of variant objects
options: JSONB   // [{name: "Size", values: ["S","M","L"]}, {name: "Color", values: ["Blue","Red"]}]
```

**UI Component:**
```
┌─────────────────────────────────────────────────────────────┐
│ Product Options                                              │
│ ┌───────────────┬───────────────────────────────────────┐   │
│ │ Size          │ [S] [M] [L] [XL] [+ Add]              │   │
│ ├───────────────┼───────────────────────────────────────┤   │
│ │ Color         │ [Blue] [Red] [Green] [+ Add]          │   │
│ └───────────────┴───────────────────────────────────────┘   │
│                                                              │
│ Variants (12 total)                                         │
│ ┌──────────┬─────────┬─────────┬──────────┬───────────────┐│
│ │ Variant  │ SKU     │ Price   │ Quantity │ Actions       ││
│ ├──────────┼─────────┼─────────┼──────────┼───────────────┤│
│ │ S / Blue │ TSH-S-B │ $25.00  │ 10       │ [Save]        ││
│ │ S / Red  │ TSH-S-R │ $25.00  │ 8        │ [Save]        ││
│ │ M / Blue │ TSH-M-B │ $28.00  │ 15       │ [Save]        ││
│ │ ...      │         │         │          │               ││
│ └──────────┴─────────┴─────────┴──────────┴───────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Inventory Management
**Current:** Not tracked
**Goal:** Edit inventory quantities, track stock status

```typescript
// Add inventory endpoint
// api/shopify/inventory.js
// Uses Shopify Inventory API to update quantities

// UI: Inline quantity editing per variant
// Shows: In Stock (15) | Low Stock (3) | Out of Stock
```

### 1.4 Multiple Images
**Current:** Only first image displayed
**Goal:** View all images, reorder, add new

```typescript
// Import all images
images: product.images.map(img => ({
  id: img.id,
  src: img.src,
  alt: img.alt,
  position: img.position
}))

// UI: Image gallery with drag-to-reorder
```

---

## Phase 2: Import Enhancements (Priority: HIGH)

### 2.1 Import All Product Data
Update ShopifyImport.tsx to capture:
- All variants (not just first)
- All images (not just first)
- Options (Size, Color, etc.)
- Inventory levels
- SEO fields (handle, metafields)
- Collections

### 2.2 Selective Import
Let user choose which products to import (checkboxes).

### 2.3 Sync Status Tracking
Add `sync_status` column:
```sql
ALTER TABLE products ADD COLUMN sync_status TEXT DEFAULT 'synced';
-- Values: 'synced', 'pending', 'modified_local', 'modified_remote', 'conflict'

ALTER TABLE products ADD COLUMN last_synced_at TIMESTAMP;
```

---

## Phase 3: Collections/Categories (Priority: MEDIUM)

### 3.1 Fetch Collections
```typescript
// api/shopify/collections.js
// GET /admin/api/2024-01/custom_collections.json
// GET /admin/api/2024-01/smart_collections.json
```

### 3.2 Collection Picker in ProductEdit
Dropdown to assign product to collections.

### 3.3 Sync Collections
Push collection assignments when saving product.

---

## Phase 4: Bulk Operations (Priority: MEDIUM)

### 4.1 Products List Enhancements
- Checkbox selection
- "Actions" dropdown:
  - Bulk edit prices
  - Bulk push to Shopify
  - Bulk update status
  - Export CSV

### 4.2 Bulk Push
"Push All Selected to Shopify" with progress bar.

---

## Phase 5: Sync Status & UI Polish (Priority: HIGH)

### 5.1 Channel Badges in Product List
```
┌────────────────────────────────────────────────────────────┐
│ 🛍️ Blue T-Shirt                                            │
│ $25.00 • In Stock (45)                                     │
│ [🟢 Shopify] [🟡 WooCommerce] [⚪ Etsy]                     │
└────────────────────────────────────────────────────────────┘
```
- 🟢 Green = Synced
- 🟡 Yellow = Modified locally, needs push
- 🔴 Red = Error/conflict
- ⚪ Gray = Not listed on this channel

### 5.2 Sync Status Bar in ProductEdit
```
┌────────────────────────────────────────────────────────────┐
│ Sync Status                                                 │
│ ┌──────────────┬───────────────┬──────────────────────────┐│
│ │ Shopify      │ ✅ Synced     │ Last: 2 hours ago        ││
│ │ WooCommerce  │ ⚠️ Modified   │ [Push Now]               ││
│ │ Etsy         │ ➖ Not Listed │ [List on Etsy]           ││
│ └──────────────┴───────────────┴──────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

---

## Phase 6: SEO & Metafields (Priority: LOW)

### 6.1 SEO Fields
- URL Handle (slug)
- Meta title
- Meta description

### 6.2 Metafields
Custom key-value data for advanced use cases.

---

## Implementation Order

### Sprint 1: Foundation (Today)
1. ✅ Audit complete
2. [ ] Database schema updates (variants, options, sync_status)
3. [ ] Enhanced import (all variants, all images)
4. [ ] Variant display in ProductEdit (read-only first)

### Sprint 2: Variant Editing
1. [ ] Inline variant price editing
2. [ ] Inventory quantity editing
3. [ ] api/shopify/variant.js endpoint
4. [ ] Push variant changes to Shopify

### Sprint 3: UI Polish
1. [ ] Channel badges in product list
2. [ ] Sync status indicators
3. [ ] Multiple image display
4. [ ] Vendor field editing

### Sprint 4: Advanced
1. [ ] Collections sync
2. [ ] Bulk operations
3. [ ] Two-way sync detection

---

## API Endpoints Needed

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/shopify/products` | POST | ✅ Exists (fetch/create/update) |
| `/api/shopify/variants` | POST | NEW - Update single variant |
| `/api/shopify/inventory` | POST | NEW - Update inventory levels |
| `/api/shopify/collections` | POST | NEW - Fetch/manage collections |
| `/api/shopify/images` | POST | NEW - Upload/reorder images |

---

## Database Schema Updates

```sql
-- Add variant support
ALTER TABLE products ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]';

-- Add sync tracking
ALTER TABLE products ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP;
ALTER TABLE products ADD COLUMN IF NOT EXISTS shopify_updated_at TIMESTAMP;

-- Add inventory
ALTER TABLE products ADD COLUMN IF NOT EXISTS inventory_quantity INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN DEFAULT true;

-- Add vendor (separate from artist)
ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor TEXT;

-- Add SEO
ALTER TABLE products ADD COLUMN IF NOT EXISTS url_handle TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description TEXT;
```

---

## Success Metrics

1. **Import captures 100% of Shopify data** - All variants, images, options
2. **Round-trip editing works** - Edit variant → Push → Verify in Shopify
3. **Visual sync status** - User knows what's synced at a glance
4. **Bulk operations** - Can push 50+ products in one action
5. **Professional UI** - Matches quality of Nembol/Sellbrite

---

*Created: December 22, 2024*
*Goal: State of the Art Shopify Integration*
