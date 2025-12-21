# Commerce Hub - Multi-Channel Digital Downloads Sprint Plan

## Project Goal
Add digital download support to existing multi-channel system. Launch real digital product business to validate the tool.

---

## Success Criteria
1. Digital file upload and attachment working
2. Digital products push correctly to WooCommerce, Shopify
3. 3 real product bundles live and for sale
4. At least 1 sale within 30 days

---

## Current State (December 21, 2024 - Evening) ✅ DIGITAL DOWNLOADS WORKING

| Platform | Auth | Import | Push | Tags/Categories | Digital Files |
|----------|------|--------|------|-----------------|---------------|
| WooCommerce | ✅ | ✅ | ✅ | ✅ Categories | ✅ Working |
| Shopify | ✅ OAuth | ✅ | ✅ | ✅ Tags + Type | ⚠️ Manual |
| Gallery Store | ✅ GitHub | ✅ | ✅ | N/A | ❌ TODO |
| Etsy | ⏳ Pending | ❌ | ❌ | ❌ | ❌ |

**Connected Stores:**
- Shopify: dev-store-749237498237498787.myshopify.com (17 products)
- WooCommerce: rapidwoo.com/commerce (35 products)
- Gallery Store: ecommerce-react-beta-woad.vercel.app (110 products)

**Key Accomplishments (Dec 21, 2024 - Evening Session):**
- ✅ Database schema updated with digital download columns
- ✅ WooCommerce digital downloads fully working (tested end-to-end)
- ✅ ProductEdit UI has digital product toggle + file URL inputs
- ✅ transforms.ts forces `type: "simple"` for digital products (WooCommerce requirement)
- ✅ BUGFIX: Reverted ProductsGrid → ProductsIndex (store filtering was broken)

**Test Results:**
- Blue Hoodie converted to digital download product
- Pushed to WooCommerce - shows as Downloadable/Virtual ✅
- Download file URL attached correctly ✅
- Product type changed from Variable → Simple ✅

---

# PHASE 1: VERIFY & TEST EXISTING INTEGRATIONS ✅ COMPLETE

## 1.1 Test Shopify Flow ✅ DONE
- [x] Confirm Shopify store is connected
- [x] Test product push: Edit → Push → Verified in Shopify admin
- [x] Test product update: Edit title/price/tags → Push → Verified
- [x] Test import: Import from Shopify → 17 products imported
- [x] Test re-import: Updates existing products (no duplicates)
- [x] Test tags sync: Bidirectional tags working

## 1.2 Test WooCommerce Flow ✅ DONE
- [x] Confirm WooCommerce credentials in Supabase
- [x] Test product push to rapidwoo.com/commerce
- [x] Test product update
- [x] Test variation price editing

## 1.3 Documentation ✅ DONE
- [x] Created COMMERCE-HUB-PROJECT.md (main handoff)
- [x] Created WOOCOMMERCE-INTEGRATION.md (deep dive)
- [x] Created SHOPIFY-INTEGRATION.md (deep dive)

### Phase 1 Checkpoint ✅ ALL PASSED
```
[x] Shopify push working end-to-end
[x] WooCommerce push working end-to-end
[x] External_id pattern working (updates not duplicates)
[x] Tags/categories syncing properly
[x] Platform-aware UI working
```

---

# PHASE 2: DIGITAL DOWNLOAD SUPPORT (NEXT)

## 2.1 Database Schema Update
**Add to products table:**

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS 
  is_digital BOOLEAN DEFAULT false;
  
ALTER TABLE products ADD COLUMN IF NOT EXISTS 
  digital_file_url TEXT;
  
ALTER TABLE products ADD COLUMN IF NOT EXISTS 
  digital_file_name TEXT;
  
ALTER TABLE products ADD COLUMN IF NOT EXISTS 
  download_limit INTEGER DEFAULT -1;
  
ALTER TABLE products ADD COLUMN IF NOT EXISTS 
  download_expiry INTEGER DEFAULT -1;
```

- [ ] Run migration in Supabase SQL Editor
- [ ] Update TypeScript interfaces

## 2.2 File Upload to Cloudinary
**Cloud Name:** dh4qwuvuo

**New File:** `src/lib/cloudinary.ts`

```typescript
export async function uploadDigitalFile(file: File): Promise<{url: string, filename: string}> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', 'commerce_hub_digital')
  
  const response = await fetch(
    'https://api.cloudinary.com/v1_1/dh4qwuvuo/raw/upload',
    { method: 'POST', body: formData }
  )
  
  const data = await response.json()
  return { url: data.secure_url, filename: file.name }
}
```

- [ ] Create Cloudinary upload preset (unsigned, for raw files)
- [ ] Create upload function
- [ ] Add to ProductEdit form

## 2.3 WooCommerce Digital Product Push
**Update:** `src/lib/transforms.ts`

WooCommerce downloadable product structure:
```typescript
// Add to WooCommercePushPayload interface
interface WooCommercePushPayload {
  // ... existing fields
  downloadable?: boolean
  virtual?: boolean
  downloads?: {
    name: string
    file: string
  }[]
  download_limit?: number
  download_expiry?: number
}

// Update transformToWooCommerce
if (product.is_digital && product.digital_file_url) {
  payload.downloadable = true
  payload.virtual = true
  payload.downloads = [{
    name: product.digital_file_name || 'Download',
    file: product.digital_file_url
  }]
  payload.download_limit = product.download_limit || -1
  payload.download_expiry = product.download_expiry || -1
}
```

- [ ] Update WooCommercePushPayload interface
- [ ] Update transformToWooCommerce function
- [ ] Test: Create digital product → Push → Purchase → Download

## 2.4 Shopify Digital Product Push
**Note:** Shopify handles digital differently - needs "Digital Downloads" app or custom fulfillment.

**Options:**
1. **Shopify Digital Downloads App** (free) - auto-fulfills with download link
2. **Metafields** - store file URL, handle fulfillment manually
3. **Third-party** - SendOwl, FetchApp integration

**Recommended approach:** Use Shopify's free Digital Downloads app
- Product is created as normal
- File is uploaded via Shopify admin (manual step for now)
- Or: Use Shopify Files API to upload programmatically

- [ ] Research Shopify Digital Downloads API
- [ ] Implement file attachment if API available
- [ ] Document manual workflow if not

## 2.5 ProductEdit UI Updates
**File:** `src/pages/products/ProductEdit.tsx`

```tsx
// Add state
const [isDigital, setIsDigital] = useState(false)
const [digitalFileUrl, setDigitalFileUrl] = useState('')
const [digitalFileName, setDigitalFileName] = useState('')
const [uploading, setUploading] = useState(false)

// Add UI section
{/* Product Type Toggle */}
<div className="flex gap-4 mb-4">
  <label className="flex items-center gap-2">
    <input
      type="radio"
      checked={!isDigital}
      onChange={() => setIsDigital(false)}
    />
    Physical Product
  </label>
  <label className="flex items-center gap-2">
    <input
      type="radio"
      checked={isDigital}
      onChange={() => setIsDigital(true)}
    />
    Digital Download
  </label>
</div>

{/* Digital File Upload */}
{isDigital && (
  <div>
    <label>Digital File (ZIP, PDF, etc.)</label>
    <input
      type="file"
      accept=".zip,.pdf,.png,.jpg,.psd,.ai"
      onChange={handleFileUpload}
    />
    {digitalFileUrl && (
      <p className="text-green-600">
        ✓ {digitalFileName} uploaded
      </p>
    )}
  </div>
)}
```

- [ ] Add isDigital toggle
- [ ] Add file upload input
- [ ] Add upload progress indicator
- [ ] Save digital fields to Supabase
- [ ] Include in push payloads

### Phase 2 Checkpoint
```
[x] Database schema updated (is_digital, digital_file_url, digital_file_name)
[x] ProductEdit UI shows digital product options (toggle + URL inputs)
[x] Digital products push to WooCommerce with download link
[x] WooCommerce shows product as Downloadable/Virtual
[x] Customer can purchase and download on WooCommerce
[ ] Shopify digital products (requires manual file upload in Shopify admin)
```

**WooCommerce Digital Downloads:** ✅ COMPLETE
- Product type automatically set to "simple" for digital products
- Downloadable and Virtual flags set correctly
- Download file URL attached
- Download limits configurable (-1 = unlimited)
- Tested with Blue Hoodie product → working perfectly

**Shopify Digital Downloads:** ⚠️ REQUIRES MANUAL WORKFLOW
- Shopify doesn't have a direct API for attaching downloadable files
- Products push with "digital-download" tag added automatically
- File must be uploaded manually via Shopify admin or Digital Downloads app
- Alternative: Use Shopify Files API (requires additional development)

---

# BUG FIXES (Dec 21, 2024)

## Issue: Store Filtering Broken
**Symptom:** Clicking "View Products" from Stores page showed ALL 52 products instead of filtering by store.

**Root Cause:** 
- Someone added `ProductsGrid.tsx` spreadsheet view (commit eb926f0)
- Router changed from `ProductsIndex` → `ProductsGrid` in App.tsx
- ProductsGrid filtered by platform NAME ('shopify', 'woocommerce')
- But "View Products" button sends store UUID
- Mismatch caused all products to show

**Fix:**
- Reverted App.tsx to use `ProductsIndex` instead of `ProductsGrid`
- ProductsIndex correctly filters by store UUID
- Store filtering now working correctly

**Files Changed:**
- `src/App.tsx` - Import and route reverted to ProductsIndex
- Commit: 371c452

**Test:**
- Navigate to https://commerce-hub-iota.vercel.app/stores
- Click "View Products" on WooCommerce → Shows only 35 WooCommerce products ✅
- Click "View Products" on Shopify → Shows only 17 Shopify products ✅

---

# PHASE 3: REAL PRODUCT BUNDLES (Week 3)

## 3.1 Create Clipart Bundles

### Bundle 1: Vintage Botanicals ($8.99)
- [ ] Source 40-50 botanical illustrations from Smithsonian
- [ ] Process: remove backgrounds, ensure 300 DPI
- [ ] Create transparent PNGs
- [ ] Create ZIP file with organized folders
- [ ] Create 5 mockup images showing usage

### Bundle 2: Maritime & Nautical ($8.99)
- [ ] Source 40-50 ships, maps, nautical elements
- [ ] Process: clean up, transparent PNGs
- [ ] Create ZIP file with organized folders
- [ ] Create 5 mockup images

### Bundle 3: Vintage Labels & Ephemera ($8.99)
- [ ] Source 50-60 old ads, tickets, labels
- [ ] Process: clean up, organize by type
- [ ] Create ZIP file with organized folders
- [ ] Create 5 mockup images

## 3.2 Upload Products to Commerce Hub
- [ ] Create each bundle as product
- [ ] Upload ZIP files to Cloudinary
- [ ] Add mockup images
- [ ] Write SEO-optimized descriptions
- [ ] Set digital download fields

## 3.3 Push to All Channels

### WooCommerce (rapidwoo.com/commerce)
- [ ] Push all 3 bundles
- [ ] Verify download works after purchase
- [ ] Price: $8.99

### Shopify (dev-store)
- [ ] Push all 3 bundles
- [ ] Attach digital files (manual or API)
- [ ] Price: $6.99 (lower fees)

### Etsy (Manual until API approved)
- [ ] Create listings manually
- [ ] Upload files directly to Etsy
- [ ] Optimize titles/tags for Etsy SEO
- [ ] Price: $8.99

### Phase 3 Checkpoint
```
[ ] 3 bundles created with professional mockups
[ ] Live on WooCommerce with working checkout
[ ] Live on Shopify with working checkout
[ ] Live on Etsy with optimized listings
[ ] First sale achieved
```

---

# PHASE 4: MARKETING & ETSY API (Week 4)

## 4.1 Pinterest Marketing
- [ ] Create Pinterest Business account
- [ ] Create boards: "Vintage Botanicals", "Nautical Clipart", etc.
- [ ] Pin 5-10 mockup images daily
- [ ] Link to Etsy listings initially (trust factor)

## 4.2 Etsy Optimization
- [ ] Research competitor keywords
- [ ] Optimize all 13 tags per listing
- [ ] A/B test listing photos
- [ ] Consider $1/day promoted listings

## 4.3 Etsy API Integration (When Approved)
**Status:** Waiting on Etsy review of "commerce-hub" app
**Callback URL:** https://commerce-hub-iota.vercel.app/stores/etsy/callback

When approved:
- [ ] `api/etsy/auth.js` - OAuth flow
- [ ] `api/etsy/products.js` - Product push
- [ ] `src/pages/stores/EtsyConnect.tsx` - Connection flow
- [ ] `src/pages/stores/EtsyImport.tsx` - Import products
- [ ] Add `transformToEtsy()` to transforms.ts
- [ ] Update ProductEdit.tsx for Etsy push

## 4.4 "Push to All" Feature
**File:** `src/pages/products/ProductEdit.tsx`

```tsx
async function handlePushToAll() {
  setPushingAll(true)
  const results = []
  
  for (const store of pushableStores) {
    try {
      await pushToStore(store)
      results.push({ store: store.platform, success: true })
    } catch (err) {
      results.push({ store: store.platform, success: false, error: err.message })
    }
  }
  
  setPushAllResults(results)
  setPushingAll(false)
}
```

- [ ] Add "Push to All Stores" button
- [ ] Show progress for each platform
- [ ] Display success/failure for each

### Phase 4 Checkpoint
```
[ ] Pinterest posting strategy active
[ ] Etsy listings optimized with research
[ ] Etsy API integrated (when approved)
[ ] "Push to All" feature working
[ ] Tracking sales across all channels
```

---

# TECHNICAL REFERENCE

## File Structure
```
commerce-hub/
├── api/
│   ├── gallery-store/
│   │   ├── push.js           ✅
│   │   └── reset.js          ✅
│   ├── shopify/
│   │   ├── token.js          ✅
│   │   └── products.js       ✅
│   ├── woocommerce/
│   │   ├── push.js           ✅ (includes digital downloads)
│   │   ├── variations.js     ✅
│   │   └── variation-update.js ✅
│   └── etsy/                 TODO
│       ├── auth.js
│       └── products.js
├── src/lib/
│   ├── supabase.ts           ✅
│   ├── woocommerce.ts        ✅ (digital download interfaces)
│   ├── shopify.ts            ✅
│   ├── transforms.ts         ✅ (digital download transforms)
│   └── cloudinary.ts         SKIPPED (using direct URLs)
└── src/pages/
    ├── products/
    │   ├── ProductsIndex.tsx     ✅ (ACTIVE - store filtering works)
    │   ├── ProductsGrid.tsx      ⚠️ (DISABLED - broke filtering)
    │   └── ProductEdit.tsx       ✅ (digital download UI added)
    └── stores/
        ├── WooCommerceConnect.tsx    ✅
        ├── ShopifyConnect.tsx        ✅
        ├── ShopifyCallback.tsx       ✅
        ├── ShopifyImport.tsx         ✅
        ├── ImportStore.tsx           ✅
        └── EtsyConnect.tsx           TODO
```

## Credentials Location
`C:\xampp\htdocs\PRIVATE\CREDENTIALS-PRIVATE.md`

| Platform | Status |
|----------|--------|
| GitHub Token | ✅ Have |
| Supabase Keys | ✅ Have |
| WooCommerce API | ✅ Have |
| Shopify OAuth | ✅ In Vercel env |
| Cloudinary | ✅ Cloud: dh4qwuvuo |
| Etsy API | ⏳ Pending review |

## Quick Commands

### Start Session
```
Continuing Commerce Hub. Current phase: 2
Working on: Digital download support
```

### Pull Latest
```cmd
cd C:\xampp\htdocs\commerce-hub
git pull origin main
```

### Verify Deploy
1. Push code via GitHub API
2. Check Vercel dashboard for build status
3. Wait for green checkmark (~30 seconds)
4. Test at https://commerce-hub-iota.vercel.app

---

# PROGRESS TRACKING

## Phase 1 ✅ COMPLETE (Dec 21, 2024)
- [x] 1.1 Shopify full sync verified
- [x] 1.2 WooCommerce full sync verified
- [x] 1.3 Documentation complete

## Phase 2 - IN PROGRESS (Dec 21, 2024 - Evening)
- [x] 2.1 Database schema update
- [ ] 2.2 Cloudinary upload (SKIPPED - using direct URLs instead)
- [x] 2.3 WooCommerce digital products
- [ ] 2.4 Shopify digital products (needs manual file upload)
- [x] 2.5 ProductEdit UI updates

## Phase 3 - NOT STARTED
- [ ] 3.1 Create bundles
- [ ] 3.2 Upload to Commerce Hub
- [ ] 3.3 Push to all channels

## Phase 4 - NOT STARTED
- [ ] 4.1 Pinterest setup
- [ ] 4.2 Etsy optimization
- [ ] 4.3 Etsy API integration
- [ ] 4.4 Push to All feature

---

*Last Updated: December 21, 2024*
*Current Phase: 2 - Digital Download Support*
*Next Task: Database schema update for digital products*
