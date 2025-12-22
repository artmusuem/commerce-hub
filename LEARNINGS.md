# Commerce Hub - Learnings & Protocols

> Accumulated knowledge from development iterations
> Last Updated: December 22, 2024

---

## Table of Contents

1. [Session Handoff Protocol](#session-handoff-protocol)
2. [Development Pipeline](#development-pipeline)
3. [Architecture Patterns Learned](#architecture-patterns-learned)
4. [Coding Patterns & Conventions](#coding-patterns--conventions)
5. [Bug Resolution Playbook](#bug-resolution-playbook)
6. [Platform-Specific Learnings](#platform-specific-learnings)
7. [Strategic Direction](#strategic-direction)

---

## Session Handoff Protocol

### Starting a New Session

**Minimum context to provide Claude:**

```
I'm continuing work on Commerce Hub. Key files:
- /mnt/project/COMMERCE-HUB-HANDOFF.md (project overview)
- /mnt/project/DEVELOPMENT.md (technical docs)
- /mnt/project/LEARNINGS.md (this file)

Current status: [what phase/feature you're on]
Last commit: [commit hash or description]
```

**Claude should then:**
1. Read project files from `/mnt/project/`
2. Fetch current versions of active files from GitHub
3. Verify deployment state before making changes

### Session Continuity Checklist

- [ ] Verify last deployment succeeded (check Vercel)
- [ ] Confirm database schema matches code expectations
- [ ] Review any pending issues from previous session
- [ ] Update documentation before ending session

### Ending a Session

1. **Push all changes** - Never leave uncommitted work
2. **Update DEVELOPMENT.md** - Document what was built
3. **Update this file** - Add new learnings
4. **Summarize status** - What's done, what's next, any blockers

---

## Development Pipeline

### The One-File-At-A-Time Rule

**Why:** Multiple simultaneous changes create:
- Merge conflicts
- Difficult debugging (which change broke it?)
- Incomplete deployments

**Process:**
```
1. Fetch file from GitHub → /home/claude/workspace/
2. Make changes using str_replace
3. Push to GitHub with descriptive commit
4. Wait 45 seconds for Vercel deployment
5. Verify deployment before next file
```

### Commit Message Convention

```
type(scope): concise description

Types:
  feat     - New feature
  fix      - Bug fix
  refactor - Code restructure (no behavior change)
  docs     - Documentation only
  chore    - Maintenance, dependencies

Scope examples:
  shopify, woocommerce, product-edit, transforms

Examples:
  feat(shopify): save product options as JSONB on import
  fix(shopify): preserve existing variants on push
  refactor(transforms): extract common validation logic
```

### Verification Steps

After each deployment:
1. **Visual check** - Load the page, see if it renders
2. **Functional check** - Test the specific feature changed
3. **Console check** - Browser DevTools for errors
4. **Database check** - Verify data saved correctly (Supabase SQL Editor)

### Rollback Protocol

If deployment breaks:
```bash
# Find last working commit
git log --oneline -10

# Revert to specific commit
git revert <commit-hash>

# Or reset file to previous version
git checkout <commit-hash> -- path/to/file.tsx
```

---

## Architecture Patterns Learned

### 1. The external_id Pattern (Critical)

**Problem:** How to update existing products without creating duplicates?

**Solution:** Store platform's product ID in `external_id` column.

```typescript
// On IMPORT from platform
external_id: String(shopifyProduct.id)  // "7558165987441"

// On PUSH to platform
if (external_id) {
  // PUT request (update existing)
  PUT /products/{external_id}
} else {
  // POST request (create new)
  POST /products
}
```

**Key insight:** Always save external_id immediately on import. Missing this causes duplicate products on re-import.

### 2. Platform-Aware Components

**Problem:** Different platforms have different fields (Shopify has vendor, WooCommerce has attributes).

**Solution:** Store platform in `attributes.platform` or determine from `store.platform`, then conditionally render:

```tsx
{productPlatform === 'shopify' && (
  <VendorField value={vendor} onChange={setVendor} />
)}

{productPlatform === 'woocommerce' && (
  <AttributesEditor attributes={attributes} onChange={setAttributes} />
)}
```

### 3. Serverless Proxy Pattern

**Problem:** Browser can't call external APIs directly (CORS, credential exposure).

**Solution:** All external API calls go through `/api/` serverless functions:

```
Browser → /api/shopify/products → Shopify API
          ↑
          Credentials injected server-side
          CORS headers added
          Error handling standardized
```

**File structure:**
```
api/
├── shopify/
│   └── products.js    # Handles create, update, delete
├── woocommerce/
│   └── push.js        # Handles push operations
└── gallery-store/
    └── publish.js     # Handles GitHub-based publishing
```

### 4. Transform Functions Pattern

**Problem:** Each platform has different data formats.

**Solution:** Centralized transform functions in `src/lib/transforms.ts`:

```typescript
// Single source of truth for format conversion
transformToShopify(product, vendor, tags): ShopifyPushPayload
transformToWooCommerce(product, categoryMap): WooCommercePushPayload

// Benefits:
// - Consistent transformation logic
// - Easy to test in isolation
// - Single place to fix format issues
```

### 5. JSONB for Flexible Data

**Problem:** Different platforms have varying data structures (variants, options, attributes).

**Solution:** Use PostgreSQL JSONB columns for platform-specific data:

```sql
variants    JSONB DEFAULT '[]'   -- Shopify variant array
options     JSONB DEFAULT '[]'   -- Shopify options (Color, Size)
attributes  JSONB                -- Platform-specific metadata
```

**Benefits:**
- No schema changes for new platform fields
- Can store full API responses for debugging
- Query with JSON operators when needed

### 6. Upsert on Import Pattern

**Problem:** Re-importing should update existing products, not create duplicates.

**Solution:** Check for existing product by `store_id + external_id`:

```typescript
// Check if exists
const { data: existing } = await supabase
  .from('products')
  .select('id')
  .eq('store_id', store.id)
  .eq('external_id', externalId)
  .single()

if (existing) {
  // Update
  await supabase.from('products').update(data).eq('id', existing.id)
} else {
  // Insert
  await supabase.from('products').insert(data)
}
```

---

## Coding Patterns & Conventions

### TypeScript Interfaces First

Before implementing a feature, define the data structures:

```typescript
// 1. Define what data looks like
interface ShopifyVariant {
  id: number
  title: string
  price: string
  // ...
}

// 2. Then implement the feature using that interface
const [variants, setVariants] = useState<ShopifyVariant[]>([])
```

### State Management Pattern

For editable data that needs to track changes:

```typescript
// Original data from database
const [shopifyVariants, setShopifyVariants] = useState<ShopifyVariant[]>([])

// Track edits separately (sparse object with only changed fields)
const [editedVariants, setEditedVariants] = useState<Record<number, Partial<ShopifyVariant>>>({})

// Get display value (edited or original)
const getValue = (variant: ShopifyVariant, field: keyof ShopifyVariant) => {
  return editedVariants[variant.id]?.[field] ?? variant[field]
}

// Check if any edits exist
const hasChanges = Object.keys(editedVariants).length > 0

// On save: merge edits into originals
const updatedVariants = shopifyVariants.map(v => ({
  ...v,
  ...editedVariants[v.id]
}))
```

### Error Handling Pattern

```typescript
try {
  setLoading(true)
  setError('')
  
  const result = await riskyOperation()
  
  // Success handling
  setSuccess(true)
  setTimeout(() => setSuccess(false), 2000)
  
} catch (err) {
  setError(err instanceof Error ? err.message : 'Unknown error')
} finally {
  setLoading(false)
}
```

### Conditional Rendering Pattern

```tsx
// Loading state
{loading && <Spinner />}

// Error state
{error && <ErrorBanner message={error} />}

// Success state
{success && <SuccessBanner />}

// Content (only when not loading and no error)
{!loading && !error && (
  <ActualContent />
)}
```

---

## Bug Resolution Playbook

### Bug: Data Disappears After Push

**Symptom:** Variants/options/images gone after pushing to platform.

**Diagnosis:**
1. Check transform function - is it including all required fields?
2. Check if IDs are included for updates (platforms replace data without IDs)
3. Check API response - what did platform actually receive?

**Example Fix (Shopify Variants):**
```typescript
// WRONG: Creates new variant, replaces all existing
variants: [{ price: "19.99" }]

// RIGHT: Updates existing variant by ID
variants: [{ id: 42878763696241, price: "19.99" }]
```

### Bug: Duplicate Products on Import

**Symptom:** Same product appears multiple times after re-import.

**Diagnosis:**
1. Is `external_id` being saved on first import?
2. Is upsert check using both `store_id` AND `external_id`?
3. Is `external_id` the correct type (String vs Number)?

**Fix:** Always save `external_id: String(product.id)` on import.

### Bug: Array Format Errors

**Symptom:** `malformed array literal` error on insert.

**Diagnosis:** PostgreSQL `TEXT[]` expects array, but receiving string.

**Fix:**
```typescript
// WRONG
tags: "tag1, tag2, tag3"

// RIGHT
tags: ["tag1", "tag2", "tag3"]

// Transform from comma-separated string:
const tagsArray = tagString.split(',').map(t => t.trim()).filter(Boolean)
```

### Bug: CORS Errors

**Symptom:** Browser blocks API request.

**Diagnosis:** Direct browser → external API call.

**Fix:** Route through serverless function:
```typescript
// WRONG
fetch('https://shop.myshopify.com/admin/api/products.json')

// RIGHT
fetch('/api/shopify/products', {
  body: JSON.stringify({ shop, accessToken, action: 'list' })
})
```

### Bug: Credentials Not Found

**Symptom:** "API credentials not found for this store"

**Diagnosis:**
1. Check `stores` table - is `api_credentials` populated?
2. Is it valid JSON?
3. Are the expected keys present (`access_token`, `consumer_key`, etc.)?

**Fix SQL:**
```sql
UPDATE stores 
SET api_credentials = '{"access_token": "shpua_xxx"}'::jsonb
WHERE platform = 'shopify';
```

---

## Platform-Specific Learnings

### Shopify

**Authentication:** OAuth 2.0
- Access token stored in `stores.api_credentials.access_token`
- Tokens don't expire (until app uninstalled)

**Critical: Variant Updates**
- MUST include variant `id` field when updating
- Without ID, Shopify creates new variants and deletes old ones
- This caused the major bug on Dec 22, 2024

**Data Format Quirks:**
- Tags: comma-separated string in API, we store as array
- Price: string in API (e.g., "699.95"), we store as decimal
- Status: "active" | "draft" | "archived"

**API Rate Limits:**
- 2 requests/second for standard plans
- Implement retry with exponential backoff for bulk operations

### WooCommerce

**Authentication:** Consumer Key + Consumer Secret (Basic Auth)
- Stored in `stores.api_credentials.consumer_key` and `.consumer_secret`
- Keys created in WooCommerce → Settings → Advanced → REST API

**Category Mapping:**
- WooCommerce uses category IDs, not names
- Must fetch categories first, build name→ID map
- Categories stored in `api_credentials.categories` after fetch

**Data Format Quirks:**
- Status: "publish" | "draft" | "private" (different from Shopify)
- Price: `regular_price` as string
- Categories: `[{ id: 15 }]` array of objects

**Digital Downloads:**
- Set `downloadable: true`, `virtual: true`
- Provide `downloads: [{ name, file }]` array

### Gallery Store

**Architecture:** JSON file in GitHub repo, auto-deployed via Vercel

**Publish Flow:**
1. Fetch current `products.json` from GitHub
2. Parse, merge/update product
3. Push updated JSON via GitHub API
4. Vercel detects change, rebuilds

**Limitations:**
- No real-time sync (file-based)
- All users share same product catalog
- Best for showcase/portfolio stores

---

## Strategic Direction

### Technical Assessment

**What's Built & Working:**
- OAuth flows (Shopify complete, Etsy pending approval)
- Credential storage pattern
- external_id update-vs-create logic
- Transform functions for format conversion
- JSONB storage for flexible platform data
- Multi-image gallery with primary selection
- Variant editing with inline save

**Architecture Strengths:**
- Platform-agnostic core (easy to add new platforms)
- Serverless-first (scales automatically, low cost)
- PostgreSQL/Supabase (reliable, SQL when needed)

### Business Viability Analysis

**Distribution Channels (ranked by potential):**

| Channel | Effort | Potential | Notes |
|---------|--------|-----------|-------|
| Shopify App Store | High (review process) | Huge | Built-in audience of merchants |
| WordPress.org | Medium (PHP wrapper) | Large | WooCommerce users live there |
| SEO/Content | Slow (6-12 months) | Sustainable | "How to sync WooCommerce to Shopify" |
| Reddit/Forums | Low | Trickle | Good for validation, not scale |

**Hosting Cost Reality:**

| Users | Monthly Cost | Notes |
|-------|--------------|-------|
| 0-100 | $0-12 | Free tiers sufficient |
| 100-500 | $12-50 | Supabase may need upgrade |
| 500+ | $50-100 | Revenue should cover this |

**Revenue Paths:**

1. **Freemium SaaS**
   - Free: 50 products
   - Pro: $9/month unlimited
   - 100 paying users = $900/month

2. **Shopify App Store**
   - 20% revenue share to Shopify
   - Distribution to millions of merchants
   - Similar apps charge $10-30/month

3. **WordPress Plugin**
   - Free on WordPress.org (distribution)
   - Pro: $49-99 one-time on your site

### Recommended Next Steps

**Phase 1: Tighten the Core**
- [ ] Strip to essential: WooCommerce ↔ Shopify bidirectional sync
- [ ] Polish UX for that one flow
- [ ] Write documentation for end users

**Phase 2: Distribution Setup**
- [ ] Landing page: "Sync WooCommerce and Shopify. Free for 50 products."
- [ ] Shopify App Store submission (portfolio gold regardless of approval)
- [ ] 3-5 SEO blog posts targeting "sync woocommerce shopify"

**Phase 3: Validation**
- [ ] Get 10 real users (not friends/family)
- [ ] Collect feedback on pain points
- [ ] Iterate based on actual usage

### Portfolio Value

**Already Demonstrated:**
- OAuth implementation
- Multi-platform API integration
- PostgreSQL/Supabase backend
- React/TypeScript frontend
- Vercel serverless deployment
- GitHub API automation
- Error handling and debugging
- Technical documentation

**Submission to Shopify App Store Would Add:**
- Real app review process experience
- Production compliance requirements
- Public-facing deployed application

---

## Appendix: Quick Reference

### GitHub API Commands

```bash
# Fetch file
curl -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github.v3.raw" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx"

# Get SHA for update
SHA=$(curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx" \
  | grep '"sha"' | head -1 | cut -d'"' -f4)

# Push update
CONTENT=$(base64 -w 0 /home/claude/workspace/file.tsx)
curl -X PUT -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/artmusuem/commerce-hub/contents/path/to/file.tsx" \
  -d "{\"message\": \"feat: description\", \"content\": \"$CONTENT\", \"sha\": \"$SHA\"}"
```

### Supabase REST API

```bash
# Query products
curl "https://owfyxfeaialumomzsejd.supabase.co/rest/v1/products?select=*" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY"

# Update product
curl -X PATCH "https://owfyxfeaialumomzsejd.supabase.co/rest/v1/products?id=eq.UUID" \
  -H "apikey: $SUPABASE_KEY" \
  -H "Authorization: Bearer $SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"field": "value"}'
```

### Common SQL Queries

```sql
-- Check product sync status
SELECT title, external_id, product_type, 
       jsonb_array_length(variants) as variant_count,
       jsonb_array_length(options) as option_count
FROM products
WHERE vendor = 'Commerce Hub';

-- Find products missing external_id
SELECT id, title, store_id 
FROM products 
WHERE external_id IS NULL;

-- Check store credentials
SELECT platform, store_url, 
       api_credentials->>'access_token' IS NOT NULL as has_token
FROM stores;
```

---

*This document captures institutional knowledge. Update it when discovering new patterns or resolving significant issues.*
