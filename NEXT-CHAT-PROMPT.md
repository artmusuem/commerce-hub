# Commerce Hub - New Chat Starter

Copy-paste everything below the line into a new chat:

---

I'm continuing work on Commerce Hub.

## Current Status

| Component | Status |
|-----------|--------|
| Supabase backend | ✅ Working |
| Gallery Store import | ✅ 111 products |
| WooCommerce import | ✅ 12 products |
| Shopify OAuth | ✅ Connected (dev-store-749237498237498787.myshopify.com) |
| Product PUSH to WooCommerce | ✅ Built |
| Product PUSH to Shopify | ✅ Built |
| Etsy OAuth | ⏳ Built, pending API approval |

## Paths & URLs

- **Local:** `C:\xampp\htdocs\commerce-hub`
- **Repo:** https://github.com/artmusuem/commerce-hub
- **Production:** https://commerce-hub-iota.vercel.app
- **Vercel Dashboard:** https://vercel.com/nathan-mcmullens-projects/commerce-hub

## Development Workflow

```
Claude pushes to GitHub → Vercel auto-deploys → I pull locally to sync

cd C:\xampp\htdocs\commerce-hub
git pull origin main
npm run dev
```

## GitHub Token

(Stored in Claude Project or local .env - not in repo)

## Key Files

- `src/lib/woocommerce.ts` - WooCommerce API utilities
- `src/lib/shopify.ts` - Shopify OAuth + push
- `src/lib/transforms.ts` - Product schema transformers
- `src/pages/products/ProductEdit.tsx` - Product edit with push UI
- `api/woocommerce/push.js` - Serverless function for WooCommerce
- `HANDOFF.md` - Full project context

## My Preferences

- Don't explain things, just build
- Push code directly to GitHub, I'll pull
- Senior-level expert approach
- Speed and efficiency over discussion
