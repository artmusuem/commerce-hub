# Multi-Channel Architecture - Future Implementation

## Overview

This document captures the multi-channel headless architecture work explored on December 26, 2025. The implementation was reverted to preserve Gallery Store's clean JSON-based functionality, but the architecture is sound and can be implemented properly in the future.

---

## What Was Built (Proof of Concept)

### Gallery Store Data Source Switching
- JSON (local files) - ✅ Working
- Shopify Storefront API - ✅ Working  
- WooCommerce REST API - ✅ Working
- Supabase (Commerce Hub database) - ✅ Working

### Files Created (still in repo)
```
src/data/shopify-api.ts      - Shopify Storefront API client
src/data/woocommerce-api.ts  - WooCommerce REST API client
src/data/supabase-api.ts     - Supabase REST API client
```

### Key Insight: Supabase is Fastest
All data should flow through Supabase for display:
```
WooCommerce ─┐
             ├─→ Import to Supabase ─→ Gallery Store reads from Supabase
Shopify ─────┘
```

This avoids slow external API calls on every page load.

---

## Architecture (Correct Pattern)

### Read Path (Display)
```
Gallery Store → Supabase (fast, your data)
```

### Write Path (Sync)
```
Commerce Hub → Platform APIs (necessary for updates)
```

### Import Path
```
Platform API → Transform → Supabase
```

---

## Why It Was Reverted

1. **Product type mismatch** - Gallery Store expects Smithsonian artwork format (artist, year, medium, frame options). Platform products are generic e-commerce (title, price, SKU).

2. **Missing transformations** - Products from WooCommerce/Shopify don't have the metadata needed for the frame/size selector UI.

3. **Scope creep** - Started as "headless demo" but proper implementation requires rethinking the entire product model.

---

## To Implement Properly

### Option A: Separate Storefronts
- Keep Gallery Store for Smithsonian art prints (JSON)
- Create new storefront for multi-channel products

### Option B: Unified Product Model
1. Extend Commerce Hub product schema:
   ```sql
   ALTER TABLE products ADD COLUMN product_data JSONB;
   -- Store platform-specific + artwork-specific data
   ```

2. Create proper transforms that map to Gallery Store's Product type:
   ```typescript
   interface Product {
     id: string
     title: string
     artist: string      // Required for Gallery Store
     year: string        // Required for Gallery Store
     medium: string      // Required for Gallery Store
     image: string
     description: string
     tags: string[]
   }
   ```

3. Update Commerce Hub to capture artwork metadata on import

### Option C: Headless-Only Mode
- Create a simplified product display mode without frame/size options
- Just show products with title, image, price, buy button
- Good for demo, not for full Gallery Store experience

---

## Environment Variables (for future use)

```bash
# Shopify Storefront API
VITE_SHOPIFY_STORE=dev-store-749237498237498787.myshopify.com
VITE_SHOPIFY_STOREFRONT_TOKEN=0280512affca137e1ea6ddd246cf1bc7

# WooCommerce REST API
VITE_WOOCOMMERCE_URL=https://rapidwoo.com/commerce
VITE_WOOCOMMERCE_KEY=ck_e230e6dffb1f1a6d84b699d1b997b9666b015545
VITE_WOOCOMMERCE_SECRET=cs_4bd4aa392d6bfda27d71cf610629f582600574c3

# Supabase
VITE_SUPABASE_URL=https://owfyxfeaialumomzsejd.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Performance Benchmarks (from testing)

| Source | Load Time | Notes |
|--------|-----------|-------|
| JSON (local) | ~0ms | Bundled with app |
| Supabase | ~0.5s | Direct PostgreSQL |
| Shopify API | ~1s | Enterprise CDN |
| WooCommerce API | ~2-4s | WordPress overhead |

**Conclusion:** Supabase is the right choice for production display.

---

## Related Work in Commerce Hub

- WooCommerce import now fetches all products (pagination fix)
- Import clears existing products before re-import (no duplicates)
- Store filtering ready in supabase-api.ts

---

## Next Steps (When Ready)

1. Define unified product schema
2. Update Commerce Hub import to capture all needed fields
3. Create proper transforms in Gallery Store
4. Test with real data
5. Add webhooks for real-time sync

---

*Documented: December 26, 2025*
*Status: Reverted to JSON-only, architecture preserved for future*
