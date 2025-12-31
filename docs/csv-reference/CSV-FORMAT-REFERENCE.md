# Commerce Hub - CSV Format Reference

This document provides official references and field mappings for product CSV imports/exports between WooCommerce and Shopify.

---

## Official Sources

### WooCommerce

| Resource | URL |
|----------|-----|
| **Sample Products CSV** | https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/sample-data/sample_products.csv |
| **CSV Import Schema (Wiki)** | https://github.com/woocommerce/woocommerce/wiki/Product-CSV-Import-Schema |
| **Importer/Exporter Guide** | https://github.com/woocommerce/woocommerce/wiki/Product-CSV-Importer-&-Exporter |
| **Main Repository** | https://github.com/woocommerce/woocommerce |

### Shopify

| Resource | URL |
|----------|-----|
| **Sample Products (Apparel, Home, Jewelry)** | https://github.com/shopifypartners/product-csvs |
| **CSV Format Documentation** | https://help.shopify.com/en/manual/products/import-export/using-csv |
| **Import Guide** | https://help.shopify.com/en/manual/products/import-export/import-products |
| **Generated Test Data** | https://shopify.dev/docs/apps/tools/development-stores/generated-data |

---

## Field Mapping: WooCommerce ↔ Shopify

### Core Product Fields

| Field | WooCommerce Column | Shopify Column | Notes |
|-------|-------------------|----------------|-------|
| **Identifier** | `ID` (numeric) | `Handle` (slug) | WooCommerce uses numeric IDs, Shopify uses URL-friendly handles |
| **SKU** | `SKU` | `Variant SKU` | Same concept, different column name |
| **Name** | `Name` | `Title` | Direct mapping |
| **Description** | `Description` | `Body (HTML)` | Both support HTML |
| **Short Description** | `Short description` | *(none)* | Shopify doesn't have short description |
| **Vendor** | *(none)* | `Vendor` | WooCommerce doesn't track vendor by default |
| **Product Type** | `Type` | `Type` | Different values - see Product Types below |

### Pricing

| Field | WooCommerce Column | Shopify Column | Notes |
|-------|-------------------|----------------|-------|
| **Regular Price** | `Regular price` | `Variant Price` | |
| **Sale Price** | `Sale price` | `Variant Compare At Price` | Shopify inverts the logic |
| **Cost** | *(meta)* | `Cost per item` | |

### Inventory

| Field | WooCommerce Column | Shopify Column | Notes |
|-------|-------------------|----------------|-------|
| **Stock Quantity** | `Stock` | `Variant Inventory Qty` | |
| **In Stock** | `In stock?` (1/0) | *(derived)* | Shopify derives from quantity |
| **Track Inventory** | `Variant Inventory Tracker` | `Variant Inventory Tracker` | WooCommerce: empty or "shopify" |
| **Backorders** | `Backorders allowed?` | `Variant Inventory Policy` | WooCommerce: 1/0, Shopify: "deny"/"continue" |

### Categorization

| Field | WooCommerce Column | Shopify Column | Notes |
|-------|-------------------|----------------|-------|
| **Categories** | `Categories` | `Product Category` | WooCommerce: "Parent > Child", Shopify: flat |
| **Tags** | `Tags` | `Tags` | Both comma-separated |
| **Product Type** | `Type` | `Type` | Custom type field |

### Images

| Field | WooCommerce Column | Shopify Column | Notes |
|-------|-------------------|----------------|-------|
| **Images** | `Images` | `Image Src` | WooCommerce: comma-separated, Shopify: one per row |
| **Image Alt** | *(none)* | `Image Alt Text` | |
| **Image Position** | *(order in list)* | `Image Position` | |
| **Variant Image** | *(none)* | `Variant Image` | Shopify has separate variant images |

### Variants/Variations

| Field | WooCommerce Column | Shopify Column | Notes |
|-------|-------------------|----------------|-------|
| **Variant Type** | `Type` = "variation" | *(same Handle)* | Different approach |
| **Parent Reference** | `Parent` (SKU) | `Handle` (same as parent) | |
| **Option 1 Name** | `Attribute 1 name` | `Option1 Name` | |
| **Option 1 Value** | `Attribute 1 value(s)` | `Option1 Value` | WooCommerce can have multiple values |
| **Option 2 Name** | `Attribute 2 name` | `Option2 Name` | |
| **Option 2 Value** | `Attribute 2 value(s)` | `Option2 Value` | |

### Physical Properties

| Field | WooCommerce Column | Shopify Column | Notes |
|-------|-------------------|----------------|-------|
| **Weight** | `Weight (lbs)` | `Variant Grams` | Different units! |
| **Length** | `Length (in)` | *(none)* | Shopify doesn't have dimensions in CSV |
| **Width** | `Width (in)` | *(none)* | |
| **Height** | `Height (in)` | *(none)* | |
| **Weight Unit** | *(store setting)* | `Variant Weight Unit` | |

### Publishing & Visibility

| Field | WooCommerce Column | Shopify Column | Notes |
|-------|-------------------|----------------|-------|
| **Published** | `Published` (1/0) | `Published` (true/false) | |
| **Visibility** | `Visibility in catalog` | *(derived)* | WooCommerce: visible/hidden/search/catalog |
| **Status** | *(derived)* | `Status` | Shopify: active/draft/archived |
| **Featured** | `Is featured?` | *(none)* | |

### SEO

| Field | WooCommerce Column | Shopify Column | Notes |
|-------|-------------------|----------------|-------|
| **SEO Title** | *(meta: _yoast_wpseo_title)* | `SEO Title` | |
| **SEO Description** | *(meta: _yoast_wpseo_metadesc)* | `SEO Description` | |

### Shipping

| Field | WooCommerce Column | Shopify Column | Notes |
|-------|-------------------|----------------|-------|
| **Requires Shipping** | *(derived from type)* | `Variant Requires Shipping` | |
| **Shipping Class** | `Shipping class` | *(none)* | |
| **Taxable** | `Tax status` | `Variant Taxable` | WooCommerce: taxable/shipping/none |
| **Tax Class** | `Tax class` | `Variant Tax Code` | |

---

## Product Types

### WooCommerce Types
- `simple` - Single product, no variations
- `variable` - Product with variations
- `variation` - A specific variation of a variable product
- `grouped` - Collection of related products
- `external` - Product sold elsewhere (affiliate)

### Shopify Approach
Shopify doesn't use a "type" column for product structure. Instead:
- **Simple products**: One row with `Option1 Name` = "Title", `Option1 Value` = "Default Title"
- **Products with variants**: Multiple rows sharing the same `Handle`, each with different option values
- **External products**: Not supported natively

---

## Transformation Rules

### WooCommerce → Shopify

```javascript
// Price handling
shopify.variant_price = woo.regular_price
shopify.variant_compare_at_price = woo.sale_price ? woo.regular_price : null
// Note: If WooCommerce has sale_price, Shopify needs compare_at_price

// Weight conversion (lbs to grams)
shopify.variant_grams = woo.weight_lbs * 453.592

// Categories (flatten hierarchy)
// WooCommerce: "Clothing > Hoodies"
// Shopify: Use Tags or Product Category (no hierarchy)
shopify.tags = woo.categories.split(' > ').join(', ')

// Boolean conversion
shopify.published = woo.published === 1 ? 'true' : 'false'
shopify.variant_taxable = woo.tax_status === 'taxable' ? 'true' : 'false'

// Inventory policy
shopify.variant_inventory_policy = woo.backorders_allowed === 1 ? 'continue' : 'deny'

// Handle generation (from name)
shopify.handle = woo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
```

### Shopify → WooCommerce

```javascript
// Price handling (inverse)
woo.regular_price = shopify.variant_compare_at_price || shopify.variant_price
woo.sale_price = shopify.variant_compare_at_price ? shopify.variant_price : ''

// Weight conversion (grams to lbs)
woo.weight_lbs = shopify.variant_grams / 453.592

// Boolean conversion
woo.published = shopify.published === 'true' ? 1 : 0
woo.in_stock = shopify.variant_inventory_qty > 0 ? 1 : 0

// Inventory policy
woo.backorders_allowed = shopify.variant_inventory_policy === 'continue' ? 1 : 0

// Type determination
woo.type = isFirstVariant ? 'variable' : 'variation'
// If only one variant with "Default Title", type = 'simple'
```

---

## Sample Files in This Project

| File | Source | Description |
|------|--------|-------------|
| `woocommerce-sample-products.csv` | WooCommerce Official | Official sample from WooCommerce repo |
| `shopify-sample-products.csv` | Shopify Dev Store | Clean export from Shopify generated test data |

---

## Key Differences Summary

| Aspect | WooCommerce | Shopify |
|--------|-------------|---------|
| **ID System** | Numeric IDs | URL handles (slugs) |
| **Variations** | Separate rows with `Type=variation` | Same handle, different option values |
| **Categories** | Hierarchical (`Parent > Child`) | Flat (use Tags for hierarchy) |
| **Weight** | Pounds (lbs) | Grams |
| **Sale Price** | `Sale price` column | Inverted: `Compare At Price` is original |
| **Images** | Comma-separated URLs | One URL per row |
| **Booleans** | 1/0 | true/false |
| **Short Description** | Supported | Not supported |
| **Dimensions** | Length/Width/Height | Not in CSV |

---

## Related Commerce Hub Files

- `src/lib/transforms.ts` - Product format converters
- `src/lib/woocommerce.ts` - WooCommerce API wrapper
- `src/lib/shopify.ts` - Shopify API wrapper
- `api/woocommerce/push.js` - Serverless push endpoint

---

*Last Updated: December 2024*
*Commerce Hub - Multi-Channel E-Commerce Management*
