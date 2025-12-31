# CSV Reference Files

This folder contains official sample CSV files and documentation for product import/export between WooCommerce and Shopify.

## Files

| File | Description |
|------|-------------|
| `CSV-FORMAT-REFERENCE.md` | Complete field mapping documentation |
| `woocommerce-sample-products.csv` | Official WooCommerce sample products |
| `shopify-sample-products.csv` | Clean Shopify export (add manually) |

## Official Sources

### WooCommerce
- **Sample Data**: https://github.com/woocommerce/woocommerce/tree/trunk/plugins/woocommerce/sample-data
- **CSV Schema Wiki**: https://github.com/woocommerce/woocommerce/wiki/Product-CSV-Import-Schema
- **Importer Guide**: https://github.com/woocommerce/woocommerce/wiki/Product-CSV-Importer-&-Exporter

### Shopify
- **Sample CSVs**: https://github.com/shopifypartners/product-csvs
- **CSV Documentation**: https://help.shopify.com/en/manual/products/import-export/using-csv
- **Generated Test Data**: https://shopify.dev/docs/apps/tools/development-stores/generated-data

## How to Get Clean Sample Files

### WooCommerce Sample
The `woocommerce-sample-products.csv` file is from the official WooCommerce repository:
```
plugins/woocommerce/sample-data/sample_products.csv
```

You can also download directly:
1. Go to https://github.com/woocommerce/woocommerce
2. Navigate to `plugins/woocommerce/sample-data/`
3. Download `sample_products.csv`

### Shopify Sample
To get a clean Shopify sample with proper tags, metafields, and variants:

**Option 1: Export Generated Test Data**
1. Create a new dev store in Partner Dashboard
2. Enable "Generated test data" when creating
3. Go to Products > All products
4. Filter by Vendor = "Snowboard Vendor" or "Dev Store"
5. Export selected products

**Option 2: Use Shopify Partners CSVs**
1. Clone: `git clone https://github.com/shopifypartners/product-csvs`
2. Use `apparel.csv`, `home-and-garden.csv`, or `jewelery.csv`

## Usage in Commerce Hub

These files serve as reference for:
- `src/lib/transforms.ts` - Product format converters
- Testing import/export functionality
- Understanding field mappings between platforms

## Quick Reference

### Key Field Differences

| Concept | WooCommerce | Shopify |
|---------|-------------|---------|
| Product ID | Numeric `ID` | URL `Handle` |
| Price logic | `Regular price`, `Sale price` | `Variant Price`, `Compare At Price` |
| Weight | Pounds (lbs) | Grams |
| Categories | Hierarchical `Parent > Child` | Flat tags |
| Booleans | `1` / `0` | `true` / `false` |
| Variations | `Type=variation` with `Parent` | Same `Handle`, different options |

See `CSV-FORMAT-REFERENCE.md` for complete documentation.
