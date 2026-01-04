# Commerce Hub - Session Handoff v2
## January 4, 2026

---

## Quick Start for New Chat

```
I'm continuing work on Commerce Hub. Key context:
1. Read /mnt/project/COMMERCE-HUB-HANDOFF-v2.md (this file)
2. We just completed a major architecture assessment using Claude Code + MCPs
3. New files were created: shopify-graphql.ts, shopify-push.ts, WOOCOMMERCE-SHOPIFY-SYNC-GUIDE.md
4. Focus: WooCommerce → Shopify sync with A-grade quality
```

---

## What Happened This Session

### 1. Root Cause Discovery: Why Variants Didn't Sync

**Problem:** WooCommerce products imported but variants showed empty in Supabase.

**Discovery:** 
- `WooCommerceConnect.tsx` fetched products but **never called** `/products/{id}/variations` endpoint
- Variations were fetched LIVE in ProductEdit.tsx for display only
- Never saved to database → Push to Shopify had no variant data

**Fix Applied:** Updated `WooCommerceConnect.tsx` to:
- Fetch variations for each variable product during import
- Transform to unified format (option1/option2/option3 like Shopify)
- Save to `variants` and `options` JSONB columns

### 2. Claude Code + MCP Orchestration (Major Discovery)

**The Paradigm Shift:**
Instead of fixing Commerce Hub's rigid transform code, we used Claude Code with MCPs to:
- Read from WooCommerce MCP
- Reason about the data
- Write to Shopify MCP
- Debug errors in real-time

**Test Results:**

| Product | Sync Method | Grade | Issues |
|---------|-------------|-------|--------|
| DNK Black Shoes | First attempt | D+ (51%) | No images, no inventory, truncated description |
| Anchor Bracelet | Applied learnings | A (100%) | All images, inventory set, full HTML, SEO |

**What Claude Code Learned (12 Technical Discoveries):**
1. Must define `productOptions` in initial product create
2. First variant created automatically, rest need `productVariantsBulkCreate`
3. SKU goes in `inventoryItem: { sku }`, not top-level
4. `optionValues` needs both `optionName` AND `name`
5. Must use `ignoreCompareQuantity: true` for inventory
6. Can't query location `name`, only `id` (permissions)
7. Media upload is async - must poll for READY status
8. Variant images need explicit `mediaId` assignment
9. Use `descriptionHtml` not `description` for HTML
10. SEO has dedicated `seo.title` / `seo.description` fields
11. Create as DRAFT → configure → set ACTIVE
12. Image URLs may be in different date folders per variation

### 3. Documentation Created

**docs/WOOCOMMERCE-SHOPIFY-SYNC-GUIDE.md** (865 lines)
- Complete field mapping tables
- 7-step order of operations flowchart
- 7 common pitfalls with wrong/right code
- Copy-paste GraphQL mutations
- Image handling workflow
- Inventory setup logic
- Sync checklist

**docs/ARCHITECTURE-ASSESSMENT.md**
- Sellbrite-style data model (master product → channel listings)
- Gap analysis of current code vs guide
- Minimum refactor plan

### 4. New Code Files (Complete)

**src/lib/shopify-graphql.ts** - GraphQL Mutations & Input Builders

```
MUTATIONS:
| Mutation               | Purpose                                      | Step |
|------------------------|----------------------------------------------|------|
| createProduct          | Create product with options                  | 1    |
| createMedia            | Upload images                                | 2    |
| getProduct             | Check media status                           | 2    |
| createVariants         | Bulk create additional variants              | 3    |
| updateVariants         | Set prices, assign images                    | 4    |
| getInventoryItem       | Get location ID                              | 5    |
| setInventory           | Set stock quantities                         | 5    |
| updateProduct          | Set description, SEO                         | 6    |
| activateProduct        | Set status to ACTIVE                         | 7    |
| getLocations           | List store locations                         | -    |

Input Builders:
- buildCreateProductInput()     // Step 1
- buildMediaInput()             // Step 2
- buildCreateVariantsInput()    // Step 3 (skips first variant)
- buildUpdateVariantsInput()    // Step 4
- buildInventoryInput()         // Step 5 (includes ignoreCompareQuantity)
- buildSeoUpdateInput()         // Step 6
- buildActivateInput()          // Step 7

Helper Functions:
- areAllMediaReady() - Check if images finished processing
- extractErrors() - Pull user errors from responses
- mapVariantsToMedia() - Match variants to images by alt text
- getShopifyQuantity() - Convert WooCommerce stock to Shopify quantity
- transformSupabaseToShopify() - Convert Supabase product → Shopify format

Usage with MCP:
  import { MUTATIONS, buildCreateProductInput } from './shopify-graphql'
  await mcp__shopify__executeGraphQL({
    query: MUTATIONS.createProduct,
    variables: { input: buildCreateProductInput(product) }
  })
```

**src/lib/shopify-push.ts** - 7-Step Orchestrator

```typescript
// Push single product with progress tracking
const result = await pushProductToShopify(product, store, {
  onProgress: (step, message) => console.log(`Step ${step}: ${message}`),
  defaultInventory: 10,
  activateOnComplete: true
})

// Push batch of products
const batch = await pushBatchToShopify(products, store, {
  onProductProgress: (i, total, product, result) => {...},
  continueOnError: true
})

// Get Supabase update after success
const update = buildSupabaseUpdate(result)
// { platform_ids: { shopify: "gid://..." }, sync_status: "synced", last_synced_at: "..." }
```

7-Step Functions:
| Step | Function            | What it does                              |
|------|---------------------|-------------------------------------------|
| 1    | step1CreateProduct  | Creates product with productOptions       |
| 2    | step2UploadImages   | Uploads all images, polls for READY       |
| 3    | step3CreateVariants | Creates additional variants (skips first) |
| 4    | step4UpdateVariants | Sets prices, assigns images to variants   |
| 5    | step5SetInventory   | Sets stock with ignoreCompareQuantity     |
| 6    | step6UpdateSeo      | Full HTML description + SEO fields        |
| 7    | step7Activate       | Sets status to ACTIVE                     |

Result Structure:
```typescript
interface PushResult {
  success: boolean
  shopifyProductId?: string    // "gid://shopify/Product/123"
  shopifyHandle?: string       // "anchor-bracelet"
  variantIds?: string[]        // All variant GIDs
  errors?: string[]
  steps: {
    step: number
    name: string
    success: boolean
    duration: number           // ms
    error?: string
  }[]
}
```

**Note:** Needs `/api/shopify/graphql` serverless route to proxy GraphQL calls.

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        COMMERCE HUB                              │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ WooCommerceConnect│    │  ShopifyImport   │                   │
│  │ (imports products │    │  (imports from   │                   │
│  │  + variations)    │    │   Shopify)       │                   │
│  └────────┬─────────┘    └────────┬─────────┘                   │
│           │                       │                              │
│           ▼                       ▼                              │
│  ┌──────────────────────────────────────────┐                   │
│  │            SUPABASE (Master Products)    │                   │
│  │  - products table (with variants JSONB)  │                   │
│  │  - platform_ids: {shopify: "...", woo: "..."}                │
│  │  - options JSONB                         │                   │
│  └────────────────────┬─────────────────────┘                   │
│                       │                                          │
│           ┌───────────┴───────────┐                             │
│           ▼                       ▼                              │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │ shopify-push.ts │    │ (future: etsy)  │                     │
│  │ (7-step process)│    │                 │                     │
│  └────────┬────────┘    └─────────────────┘                     │
│           │                                                      │
└───────────┼──────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SHOPIFY (via GraphQL)                         │
│  Step 1: productCreate (with options)                           │
│  Step 2: productCreateMedia (upload images)                     │
│  Step 3: productVariantsBulkCreate (additional variants)        │
│  Step 4: productVariantsBulkUpdate (prices, assign images)      │
│  Step 5: inventorySetQuantities (make purchasable)              │
│  Step 6: productUpdate (description, SEO)                       │
│  Step 7: productUpdate (status: ACTIVE)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## MCP Configuration

Claude Code has these MCPs configured:

**WooCommerce MCP (custom modified)**
- `wc_get_product` - Get single product
- `wc_get_product_variations` - Get variations for product
- `wc_execute_rest` - Run any REST endpoint

**Shopify MCP (custom modified)**
- `createProduct` - Basic product create
- `productVariantCreate` - Added by us
- `executeGraphQL` - Run any GraphQL mutation (key tool)

**Supabase MCP**
- Database queries

---

## Repositories & Credentials

| Project | GitHub | Production |
|---------|--------|------------|
| Commerce Hub | nathanmcmullendev/commerce-hub | commerce-hub-iota.vercel.app |
| Gallery Store | nathanmcmullendev/ecommerce-react | ecommerce-react-beta-woad.vercel.app |

**Credentials Location:**
- GitHub Token: In Claude Project instructions (first line)
- Supabase: See CREDENTIALS-PRIVATE.md in Claude Project
- WooCommerce: See CREDENTIALS-PRIVATE.md in Claude Project
- Shopify: OAuth token stored in Supabase `stores` table

---

## Database Schema (Key Tables)

```sql
-- products table
id              UUID PRIMARY KEY
user_id         UUID
store_id        UUID REFERENCES stores(id)
external_id     TEXT              -- Platform's product ID
title           TEXT
description     TEXT
price           DECIMAL
category        TEXT
image_url       TEXT
sku             TEXT
status          TEXT
product_type    TEXT              -- 'simple', 'variable'
attributes      JSONB             -- WooCommerce attributes
variants        JSONB             -- [{id, price, sku, option1, option2, option3, ...}]
options         JSONB             -- [{name: "Color", values: ["Black", "Red"]}]
platform_ids    JSONB             -- {shopify: "gid://...", woocommerce: "375"}

-- stores table  
id              UUID PRIMARY KEY
platform        TEXT              -- 'woocommerce', 'shopify', 'gallery-store'
store_url       TEXT
api_credentials JSONB             -- Platform-specific auth
is_connected    BOOLEAN
```

---

## Files Changed This Session

| File | Change |
|------|--------|
| `src/pages/stores/WooCommerceConnect.tsx` | Added variation fetching on import |
| `src/lib/transforms.ts` | Fixed variant ID filtering (>1B = Shopify) |
| `src/pages/products/ProductEdit.tsx` | Better error display for Shopify 422 |
| `docs/WOOCOMMERCE-SHOPIFY-SYNC-GUIDE.md` | NEW - 865 line guide |
| `docs/ARCHITECTURE-ASSESSMENT.md` | NEW - Gap analysis |
| `src/lib/shopify-graphql.ts` | NEW - GraphQL mutations |
| `src/lib/shopify-push.ts` | NEW - 7-step orchestrator |

---

## Next Steps (Priority Order)

### 1. Complete shopify-push.ts
Claude Code is building the 7-step orchestrator. Once done:
- Test with a WooCommerce product
- Verify A-grade sync from Commerce Hub UI

### 2. Update ProductEdit.tsx
Replace current Shopify push with new orchestrator:
```typescript
import { pushToShopify } from '../lib/shopify-push'
// Use 7-step process instead of single REST call
```

### 3. Add Progress UI
Show user which step is running:
- "Creating product..."
- "Uploading images..."
- "Setting inventory..."

### 4. Test Reverse Direction
Shopify → Supabase → WooCommerce (should be similar pattern)

### 5. Etsy Integration
Once API approved, apply same pattern with Etsy MCPs

---

## Key Learnings for Future Sessions

1. **MCPs are API wrappers** - The underlying API supports more than hardcoded tools expose
2. **executeGraphQL is the key** - Can run any mutation, not limited to predefined tools
3. **Claude Code learns by doing** - Trial and error produced better docs than upfront design
4. **Order matters** - Shopify requires specific sequence (options → product → images → variants → inventory)
5. **Transform code is legacy** - New shopify-graphql.ts replaces rigid transforms.ts approach

---

## Commands for Claude Code

**Test a sync:**
```
Sync WooCommerce product ID 160 (Anchor Bracelet) to Shopify using the 7-step process
```

**Check a product:**
```
Compare WooCommerce product 375 with Shopify product gid://shopify/Product/7568515039345
```

**Grade a sync:**
```
Run sync comparison report on [product] and grade it A-F
```

---

## Session: January 4, 2026 - A-Grade Sync Deployed

### What Was Built
- api/shopify/graphql.js - Serverless GraphQL proxy
- src/lib/shopify-graphql.ts - Mutations + input builders
- src/lib/shopify-push.ts - 7-step orchestrator
- src/components/ShopifyPushButton.tsx - UI with progress
- src/lib/product-mapper.ts - Unified product transforms

### Deployment Status
- Production: commerce-hub-iota.vercel.app ✅
- API route /api/shopify/graphql ✅
- 7-step sync tested and working ✅

### Claude Code Best Practices

**Testing Node.js with GraphQL:**
- ❌ WRONG: node -e with GraphQL (bash breaks $, !, parentheses)
- ✅ RIGHT: Write to .mjs file first, then `node file.mjs`, then delete

**Local Dev:**
- ❌ WRONG: vercel dev with Vite (MIME errors)
- ✅ RIGHT: npm run dev for UI, test API on production

**Deployment Flow:**
1. npm run build (catch TS errors)
2. Test sync via MCPs (direct API, no proxy)
3. git push → Vercel auto-deploys
4. Test UI on production

---

*Last Updated: January 4, 2026*
*Session Focus: A-Grade Shopify sync deployed to production*
