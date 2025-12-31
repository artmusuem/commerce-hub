# CSV Reference Files

This folder contains official sample CSV files and documentation for product import/export between WooCommerce and Shopify.

## Sample Files

| File | Source | Products | Description |
|------|--------|----------|-------------|
| `woocommerce-sample-products.csv` | WooCommerce Official | 27 | Apparel with variants (hoodies, t-shirts, accessories) |
| `shopify-apparel-sample.csv` | Shopify Partners | 21 | Clothing (shirts, jackets, tops) |
| `shopify-home-garden-sample.csv` | Shopify Partners | 20 | Home & garden products |
| `shopify-jewelry-sample.csv` | Shopify Partners | 53 | Jewelry with variants (rings, necklaces, earrings) |

## Official Source Repositories

### WooCommerce (Automattic)

| Resource | URL |
|----------|-----|
| **Main Repository** | https://github.com/woocommerce/woocommerce |
| **Sample Data Folder** | https://github.com/woocommerce/woocommerce/tree/trunk/plugins/woocommerce/sample-data |
| **sample_products.csv** | https://github.com/woocommerce/woocommerce/blob/trunk/plugins/woocommerce/sample-data/sample_products.csv |
| **CSV Import Schema (Wiki)** | https://github.com/woocommerce/woocommerce/wiki/Product-CSV-Import-Schema |
| **Importer/Exporter Guide** | https://github.com/woocommerce/woocommerce/wiki/Product-CSV-Importer-&-Exporter |

### Shopify

| Resource | URL |
|----------|-----|
| **Sample CSVs Repository** | https://github.com/shopifypartners/product-csvs |
| **apparel.csv** | https://raw.githubusercontent.com/shopifypartners/product-csvs/master/apparel.csv |
| **home-and-garden.csv** | https://raw.githubusercontent.com/shopifypartners/product-csvs/master/home-and-garden.csv |
| **jewelery.csv** | https://raw.githubusercontent.com/shopifypartners/product-csvs/master/jewelery.csv |
| **CSV Format Documentation** | https://help.shopify.com/en/manual/products/import-export/using-csv |
| **Official Template** | https://help.shopify.com/csv/product_template.csv |
| **Generated Test Data** | https://shopify.dev/docs/apps/tools/development-stores/generated-data |

## Documentation Files

| File | Description |
|------|-------------|
| `CSV-FORMAT-REFERENCE.md` | Complete field mapping between WooCommerce and Shopify |

## Quick Clone Commands

```bash
# Clone WooCommerce for sample data
git clone --depth 1 --filter=blob:none --sparse https://github.com/woocommerce/woocommerce.git
cd woocommerce
git sparse-checkout set plugins/woocommerce/sample-data

# Clone Shopify sample CSVs
git clone https://github.com/shopifypartners/product-csvs.git
```

## Key Field Differences Summary

| Concept | WooCommerce | Shopify |
|---------|-------------|---------|
| Product ID | Numeric `ID` | URL `Handle` |
| Price logic | `Regular price`, `Sale price` | `Variant Price`, `Compare At Price` |
| Weight | Pounds (lbs) | Grams |
| Categories | Hierarchical `Parent > Child` | Flat (use Tags) |
| Booleans | `1` / `0` | `true` / `false` |
| Variations | `Type=variation` with `Parent` | Same `Handle`, different options |
| Images | Comma-separated in one field | One URL per row |

See `CSV-FORMAT-REFERENCE.md` for complete field mapping and transformation rules.

## Usage in Commerce Hub

These files serve as the canonical reference for:
- `src/lib/transforms.ts` - Product format converters
- Testing import/export functionality  
- Building bi-directional sync (WooCommerce ↔ Shopify)

---

*Last Updated: December 2024*
