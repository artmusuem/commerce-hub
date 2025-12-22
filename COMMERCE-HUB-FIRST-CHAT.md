# Commerce Hub - New Session Kickoff

## Project Handoff

You're taking over as lead developer on **Commerce Hub**, a multi-channel e-commerce admin panel. The system is production-ready with WooCommerce, Shopify, and Gallery Store integrations all working.

---

## First Steps

### 1. Read Project Documentation

Start by reading the project instructions in your Project Knowledge, then fetch and review the architecture docs:

```bash
# Fetch architecture overview
curl -s -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/docs/COMMERCE-HUB-ARCHITECTURE.md"
```

### 2. Download Critical Files to /home/claude

Set up your local working environment with the core files:

```bash
export GH_TOKEN="$GH_TOKEN (see CREDENTIALS-PRIVATE.md)"

# Core transform and API libraries
curl -s -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/src/lib/transforms.ts" > /home/claude/transforms.ts

curl -s -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/src/lib/woocommerce.ts" > /home/claude/woocommerce.ts

curl -s -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/src/lib/shopify.ts" > /home/claude/shopify.ts

# Main UI components
curl -s -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/src/pages/products/ProductEdit.tsx" > /home/claude/ProductEdit.tsx

curl -s -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/src/pages/stores/StoresIndex.tsx" > /home/claude/StoresIndex.tsx

# Serverless API endpoints
curl -s -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/api/woocommerce/push.js" > /home/claude/api-woo-push.js

curl -s -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/api/shopify/products.js" > /home/claude/api-shopify-products.js

# Verify downloads
ls -la /home/claude/*.ts /home/claude/*.tsx /home/claude/*.js
```

### 3. Review Current State

After downloading, give me a brief status report:
- Confirm files downloaded successfully
- Note the line counts of key files
- Identify the main patterns you see (external_id, transforms, serverless proxy)

---

## Current System Status

| Platform | Status | Products |
|----------|--------|----------|
| WooCommerce | ✅ Full sync working | 147+ |
| Shopify | ✅ OAuth + full sync | 128+ |
| Gallery Store | ✅ Bulk push to both platforms | 110 |
| Etsy | ⏳ Pending API approval | - |

**Recent completions:**
- Bulk push (Gallery Store → WooCommerce/Shopify)
- Digital downloads support
- Cloudinary image proxy for Smithsonian URLs
- Cross-platform external_id safety
- Variation price editing

---

## Key URLs

| Resource | URL |
|----------|-----|
| Production | https://commerce-hub-iota.vercel.app |
| GitHub Repo | https://github.com/artmusuem/commerce-hub |
| Supabase | https://supabase.com/dashboard/project/owfyxfeaialumomzsejd |
| WooCommerce | https://rapidwoo.com/commerce |
| Gallery Store | https://ecommerce-react-beta-woad.vercel.app |

---

## Working Agreement

- **Senior-to-senior** - Skip basic explanations
- **One file at a time** - Verify deployment before next change
- **Fetch before edit** - Always work with current repo version
- **Meaningful commits** - Descriptive messages, not "fix"
- **Stop on errors** - Diagnose before rapid-fire attempts

---

## Ready to Go

Once you've completed the setup steps above, let me know:
1. What you see in the codebase
2. Any questions about the architecture
3. You're ready for the next task

Looking forward to shipping features together.
