# WooCommerce to Shopify Product Sync Guide

Technical guide for achieving A-grade product synchronization from WooCommerce to Shopify.

**Based on:** Real sync attempts (DNK Black Shoes D+ → Anchor Bracelet A)

---

## Table of Contents

1. [Field Mapping Reference](#field-mapping-reference)
2. [Order of Operations](#order-of-operations)
3. [Common Pitfalls](#common-pitfalls)
4. [Working GraphQL Mutations](#working-graphql-mutations)
5. [Image Handling](#image-handling)
6. [Inventory Setup](#inventory-setup)
7. [Sync Checklist](#sync-checklist)

---

## Field Mapping Reference

### Product-Level Fields

| WooCommerce Field | Shopify Field | Notes |
|-------------------|---------------|-------|
| `name` | `title` | Direct mapping |
| `status` (publish) | `status` (ACTIVE) | Map: publish→ACTIVE, draft→DRAFT |
| `description` | `descriptionHtml` | Preserve HTML structure |
| `short_description` | `seo.description` | Use for SEO meta description |
| `slug` | `handle` | URL-friendly identifier |
| `sku` | `variants[].sku` | SKU lives on variants in Shopify |
| `categories[0].name` | `productType` | Primary category → product type |
| `categories[].name` | `tags[]` | All categories as tags |
| `images[].src` | `media[]` | Requires separate upload step |
| `attributes[].name` | `options[].name` | e.g., "Color", "Size" |
| `attributes[].options` | `options[].values` | e.g., ["Black", "Red"] |

### Variation-Level Fields

| WooCommerce Field | Shopify Field | Notes |
|-------------------|---------------|-------|
| `variations[].price` | `variants[].price` | String format: "150.00" |
| `variations[].regular_price` | `variants[].price` | Use regular_price if no sale |
| `variations[].sale_price` | `variants[].compareAtPrice` | Original price for sale display |
| `variations[].sku` | `variants[].sku` | Per-variant SKU |
| `variations[].image.src` | `variants[].mediaId` | Requires image upload first |
| `variations[].attributes[].option` | `variants[].optionValues` | e.g., "Black" |
| `variations[].stock_status` | Inventory API | Separate inventory mutation |
| `variations[].stock_quantity` | `inventoryQuantity` | Via inventorySetQuantities |

### SEO Fields

| WooCommerce Field | Shopify Field | Notes |
|-------------------|---------------|-------|
| `name` + enhancement | `seo.title` | e.g., "Product Name - Brand Tagline" |
| `short_description` | `seo.description` | First 155 chars, no HTML |
| `slug` | `handle` | Already URL-optimized |

---

## Order of Operations

**Critical:** Operations must happen in this exact order. Each step depends on the previous.

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Create Product with Options                            │
│ - Title, description, vendor, productType, tags                │
│ - productOptions with ALL option names and values              │
│ - Status: DRAFT (activate at the end)                          │
│ Result: Product ID + first variant ID                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Upload ALL Product Images                              │
│ - Use productCreateMedia mutation                              │
│ - Include variant-specific images                              │
│ - Wait for READY status (async upload)                         │
│ Result: Media IDs for each image                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Create Additional Variants                             │
│ - Use productVariantsBulkCreate                                │
│ - Include optionValues and prices                              │
│ - First variant already exists from Step 1                     │
│ Result: All variant IDs + inventory item IDs                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Update Variant Prices & Images                         │
│ - Use productVariantsBulkUpdate                                │
│ - Set correct price on first variant                           │
│ - Assign mediaId to each variant                               │
│ Result: Variants with images assigned                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: Set Inventory Quantities                               │
│ - Query location ID first                                      │
│ - Use inventorySetQuantities mutation                          │
│ - Set quantity > 0 for purchasability                          │
│ Result: Variants are purchasable                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: Update SEO & Description                               │
│ - Use productUpdate mutation                                   │
│ - Full HTML description                                        │
│ - SEO title and description                                    │
│ Result: Complete product data                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7: Activate Product                                       │
│ - Set status: ACTIVE                                           │
│ - Product is now live and purchasable                          │
│ Result: A-grade sync complete                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Common Pitfalls

### Pitfall 1: Creating Product Without Options

**Wrong:**
```javascript
// This creates a product but options must be added separately
productCreate(input: {
  title: "My Product",
  variants: [{ price: "100.00" }]  // ERROR: variants field not supported
})
```

**Right:**
```javascript
// Include productOptions in initial creation
productCreate(input: {
  title: "My Product",
  productOptions: [{
    name: "Color",
    values: [{ name: "Black" }, { name: "Brown" }, { name: "Red" }]
  }]
})
```

**Note:** Even with productOptions, only the FIRST value creates a variant. You must create additional variants separately.

---

### Pitfall 2: Wrong Image URLs

**Wrong:**
```javascript
// Guessing the URL path
originalSource: "https://store.com/wp-content/uploads/2017/12/image-b.jpg"
// Result: FAILED status
```

**Right:**
```javascript
// Use exact URL from WooCommerce variation.image.src
originalSource: "https://store.com/wp-content/uploads/2022/08/image-b.jpg"
// Result: READY status
```

**Fix:** Always fetch variation data and use the exact `image.src` URL. Different variations may have images in different upload date folders.

---

### Pitfall 3: Setting Inventory Without ignoreCompareQuantity

**Wrong:**
```javascript
inventorySetQuantities(input: {
  reason: "correction",
  name: "available",
  quantities: [{ inventoryItemId: "...", locationId: "...", quantity: 10 }]
})
// ERROR: compareQuantity argument must be given or ignored
```

**Right:**
```javascript
inventorySetQuantities(input: {
  reason: "correction",
  name: "available",
  ignoreCompareQuantity: true,  // Required!
  quantities: [{ inventoryItemId: "...", locationId: "...", quantity: 10 }]
})
```

---

### Pitfall 4: Querying Location Name Without Permission

**Wrong:**
```graphql
query {
  inventoryItem(id: "...") {
    inventoryLevels(first: 5) {
      edges {
        node {
          location {
            id
            name  # ERROR: Access denied without read_locations scope
          }
        }
      }
    }
  }
}
```

**Right:**
```graphql
query {
  inventoryItem(id: "...") {
    inventoryLevels(first: 5) {
      edges {
        node {
          location {
            id  # Only query the ID
          }
        }
      }
    }
  }
}
```

---

### Pitfall 5: Truncated Descriptions

**Wrong:**
```javascript
// Only syncing short_description
descriptionHtml: product.short_description
```

**Right:**
```javascript
// Preserve full HTML description with structure
descriptionHtml: product.description  // Includes h3, h5, p, img tags
```

---

### Pitfall 6: Zero Inventory = Unpurchasable

**Problem:** Variants with 0 inventory show as "Sold out" or unavailable.

**Solution:** Always set inventory > 0 for each variant:
```javascript
// Set at least 1 (or sync actual stock from WooCommerce)
quantity: wcVariation.stock_quantity || 10
```

---

### Pitfall 7: Variants Without Images

**Problem:** Variants show generic product image instead of variant-specific image.

**Solution:** After uploading images, assign to variants:
```javascript
productVariantsBulkUpdate(productId: "...", variants: [
  { id: "variant1", mediaId: "blackImageId" },
  { id: "variant2", mediaId: "brownImageId" },
  { id: "variant3", mediaId: "redImageId" }
])
```

---

## Working GraphQL Mutations

### Step 1: Create Product with Options

```graphql
mutation productCreate($input: ProductInput!) {
  productCreate(input: $input) {
    product {
      id
      title
      handle
      options {
        id
        name
        values
      }
      variants(first: 10) {
        edges {
          node {
            id
            title
            price
            inventoryItem {
              id
            }
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "title": "Anchor Bracelet",
    "descriptionHtml": "<p>Initial description</p>",
    "vendor": "StoreName",
    "productType": "Accessories",
    "tags": ["accessories", "women", "bracelet"],
    "status": "DRAFT",
    "productOptions": [{
      "name": "Color",
      "values": [
        { "name": "Black" },
        { "name": "Brown" },
        { "name": "Red" }
      ]
    }]
  }
}
```

---

### Step 2: Upload Images

```graphql
mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
  productCreateMedia(productId: $productId, media: $media) {
    media {
      ... on MediaImage {
        id
        status
        alt
        image {
          url
        }
      }
    }
    mediaUserErrors {
      field
      message
    }
  }
}
```

**Variables:**
```json
{
  "productId": "gid://shopify/Product/123",
  "media": [
    {
      "originalSource": "https://store.com/wp-content/uploads/2017/12/product-black.jpg",
      "alt": "Product - Black",
      "mediaContentType": "IMAGE"
    },
    {
      "originalSource": "https://store.com/wp-content/uploads/2022/08/product-brown.jpg",
      "alt": "Product - Brown",
      "mediaContentType": "IMAGE"
    }
  ]
}
```

**Check Status (images upload async):**
```graphql
query getProductMedia($id: ID!) {
  product(id: $id) {
    media(first: 10) {
      edges {
        node {
          ... on MediaImage {
            id
            status  # UPLOADED → READY or FAILED
            alt
            image {
              id
              url
            }
          }
        }
      }
    }
  }
}
```

---

### Step 3: Create Additional Variants

```graphql
mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId: $productId, variants: $variants) {
    productVariants {
      id
      title
      price
      selectedOptions {
        name
        value
      }
      inventoryItem {
        id
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables:**
```json
{
  "productId": "gid://shopify/Product/123",
  "variants": [
    {
      "optionValues": [{ "optionName": "Color", "name": "Brown" }],
      "price": "170.00"
    },
    {
      "optionValues": [{ "optionName": "Color", "name": "Red" }],
      "price": "180.00"
    }
  ]
}
```

---

### Step 4: Update First Variant Price & Assign Images

```graphql
mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    productVariants {
      id
      title
      price
      media(first: 1) {
        edges {
          node {
            ... on MediaImage {
              id
              alt
            }
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables:**
```json
{
  "productId": "gid://shopify/Product/123",
  "variants": [
    {
      "id": "gid://shopify/ProductVariant/111",
      "price": "150.00",
      "mediaId": "gid://shopify/MediaImage/aaa"
    },
    {
      "id": "gid://shopify/ProductVariant/222",
      "mediaId": "gid://shopify/MediaImage/bbb"
    },
    {
      "id": "gid://shopify/ProductVariant/333",
      "mediaId": "gid://shopify/MediaImage/ccc"
    }
  ]
}
```

---

### Step 5: Get Location and Set Inventory

**Get Location ID:**
```graphql
query getInventoryItem($id: ID!) {
  inventoryItem(id: $id) {
    id
    inventoryLevels(first: 5) {
      edges {
        node {
          id
          location {
            id  # Don't query 'name' - requires extra permissions
          }
          quantities(names: ["available"]) {
            name
            quantity
          }
        }
      }
    }
  }
}
```

**Set Inventory:**
```graphql
mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup {
      createdAt
      reason
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "reason": "correction",
    "name": "available",
    "ignoreCompareQuantity": true,
    "quantities": [
      {
        "inventoryItemId": "gid://shopify/InventoryItem/111",
        "locationId": "gid://shopify/Location/999",
        "quantity": 10
      },
      {
        "inventoryItemId": "gid://shopify/InventoryItem/222",
        "locationId": "gid://shopify/Location/999",
        "quantity": 10
      },
      {
        "inventoryItemId": "gid://shopify/InventoryItem/333",
        "locationId": "gid://shopify/Location/999",
        "quantity": 10
      }
    ]
  }
}
```

---

### Step 6: Update Description and SEO

```graphql
mutation productUpdate($input: ProductInput!) {
  productUpdate(input: $input) {
    product {
      id
      title
      descriptionHtml
      seo {
        title
        description
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "id": "gid://shopify/Product/123",
    "descriptionHtml": "<h3>Product description</h3>\n<p>Full HTML content...</p>\n<h5>Features</h5>\n<p>More content...</p>",
    "seo": {
      "title": "Product Name - Brand Tagline",
      "description": "Short description for search engines, max 155 characters."
    }
  }
}
```

---

### Step 7: Activate Product

```graphql
mutation productUpdate($input: ProductInput!) {
  productUpdate(input: $input) {
    product {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "id": "gid://shopify/Product/123",
    "status": "ACTIVE"
  }
}
```

---

## Image Handling

### Three Types of Images

| Type | WooCommerce Location | Shopify Handling |
|------|---------------------|------------------|
| **Product Images** | `product.images[]` | Upload via `productCreateMedia` |
| **Variant Images** | `variation.image` | Upload, then assign via `mediaId` on variant |
| **Description Images** | Embedded in `description` HTML | Keep as external URLs or upload to Shopify CDN |

### Image Upload Workflow

```
1. Collect all unique image URLs
   ├── product.images[].src
   └── variations[].image.src

2. Upload all images in one batch
   └── productCreateMedia (array of media)

3. Wait for processing
   └── Poll product.media until all status = "READY"

4. Map images to variants
   └── Match by alt text or filename

5. Assign via productVariantsBulkUpdate
   └── { id: variantId, mediaId: imageId }
```

### Image URL Gotchas

```javascript
// WooCommerce images may be in different folders by upload date
// Product image:  /uploads/2017/12/product.jpg
// Variant image:  /uploads/2022/08/product-b.jpg

// ALWAYS use the exact URL from the API response
const imageUrl = variation.image.src;  // Use this exactly
```

### Failed Image Uploads

If an image fails (`status: "FAILED"`):
1. Check the source URL is accessible (try in browser)
2. Verify CORS/hotlink protection isn't blocking
3. Try re-uploading with the exact URL from WooCommerce API
4. Some images may be in different date folders than expected

---

## Inventory Setup

### Why Inventory Matters

| Inventory | Result |
|-----------|--------|
| 0 | "Sold out" - cannot add to cart |
| null/unset | May show unavailable |
| > 0 | Purchasable |

### Inventory Data Flow

```
WooCommerce variation
├── stock_status: "instock" | "outofstock" | "onbackorder"
├── manage_stock: true | false
└── stock_quantity: number | null

        ↓ Transform

Shopify inventory
├── inventoryItemId (from variant creation)
├── locationId (query from store)
└── quantity: number
```

### Mapping Logic

```javascript
function getShopifyQuantity(wcVariation) {
  if (wcVariation.stock_status === 'outofstock') {
    return 0;
  }

  if (wcVariation.manage_stock && wcVariation.stock_quantity !== null) {
    return wcVariation.stock_quantity;
  }

  // Default for "instock" without managed quantity
  return 10;  // Or your preferred default
}
```

### Batch Inventory Update

Always update all variants in a single mutation:

```javascript
const quantities = variants.map(v => ({
  inventoryItemId: v.inventoryItemId,
  locationId: storeLocationId,
  quantity: getShopifyQuantity(wcVariations[v.color])
}));

// Single mutation for all variants
inventorySetQuantities({
  reason: "correction",
  name: "available",
  ignoreCompareQuantity: true,
  quantities
});
```

---

## Sync Checklist

Use this checklist for every product sync:

### Pre-Sync
- [ ] Fetch complete WooCommerce product data
- [ ] Fetch all variations with `wc_get_product_variations`
- [ ] Verify all image URLs are accessible
- [ ] Identify primary category for productType

### Product Creation
- [ ] Create product with `productOptions` defined
- [ ] Set status to DRAFT initially
- [ ] Capture product ID and first variant ID

### Images
- [ ] Upload ALL images (product + variant-specific)
- [ ] Wait for all images to reach READY status
- [ ] Note any FAILED uploads and retry with correct URLs
- [ ] Map media IDs to variants by alt text

### Variants
- [ ] Create additional variants with `productVariantsBulkCreate`
- [ ] Update first variant price (defaults to $0)
- [ ] Assign media IDs to all variants
- [ ] Verify all prices match WooCommerce

### Inventory
- [ ] Query location ID from any inventory item
- [ ] Set quantity > 0 for all variants
- [ ] Use `ignoreCompareQuantity: true`

### Content
- [ ] Update with full HTML description
- [ ] Set SEO title (product name + brand/tagline)
- [ ] Set SEO description (from short_description)

### Activation
- [ ] Set status to ACTIVE
- [ ] Verify product is visible and purchasable

### Validation
- [ ] Query final product state
- [ ] Verify all variants show correct price
- [ ] Verify all variants have images
- [ ] Verify inventory > 0
- [ ] Check SEO fields are populated

---

## Grade Calculation

| Criteria | Weight | Passing Condition |
|----------|--------|-------------------|
| Title match | 10% | Exact match |
| Description | 15% | Full HTML preserved |
| Variant count | 10% | All variations synced |
| Variant prices | 15% | All prices correct |
| Product images | 10% | All images uploaded |
| Variant images | 10% | Each variant has image |
| Inventory | 10% | All variants purchasable |
| SEO data | 10% | Title + description set |
| Options | 5% | Attributes mapped |
| Status | 5% | Product is ACTIVE |

**Target: 100% (A grade)**

---

## Quick Reference

### WooCommerce API Endpoints

```
GET /wp-json/wc/v3/products/{id}           # Product details
GET /wp-json/wc/v3/products/{id}/variations # All variations
```

### Key Shopify Mutations

```graphql
productCreate          # Create product with options
productCreateMedia     # Upload images
productVariantsBulkCreate  # Add variants
productVariantsBulkUpdate  # Update prices, assign images
inventorySetQuantities     # Set stock levels
productUpdate          # Description, SEO, activate
```

### ID Formats

```
Shopify Product:   gid://shopify/Product/7568535978097
Shopify Variant:   gid://shopify/ProductVariant/42932788920433
Shopify Media:     gid://shopify/MediaImage/26243404595313
Shopify Inventory: gid://shopify/InventoryItem/45064045330545
Shopify Location:  gid://shopify/Location/74791387249
```

---

*Document created from real sync experience: DNK Black Shoes (D+ 51%) → Anchor Bracelet (A 100%)*
