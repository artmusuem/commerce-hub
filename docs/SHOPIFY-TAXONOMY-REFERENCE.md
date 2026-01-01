# Shopify Product Taxonomy Reference

**Source:** https://github.com/Shopify/product-taxonomy  
**Explorer:** https://shopify.github.io/product-taxonomy/  
**Total Categories:** 11,767+ (as of 2026-02)

---

## Art & Artwork Categories (Most Relevant)

| GID | Full Path |
|-----|-----------|
| `gid://shopify/TaxonomyCategory/hg-3-4` | Home & Garden > Decor > Artwork |
| `gid://shopify/TaxonomyCategory/hg-3-4-1` | Home & Garden > Decor > Artwork > Decorative Tapestries |
| `gid://shopify/TaxonomyCategory/hg-3-4-2` | Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork |
| `gid://shopify/TaxonomyCategory/hg-3-4-2-4` | Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork > **Paintings** |
| `gid://shopify/TaxonomyCategory/hg-3-4-2-1` | Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork > **Posters** |
| `gid://shopify/TaxonomyCategory/hg-3-4-2-2` | Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork > **Prints** |
| `gid://shopify/TaxonomyCategory/hg-3-4-2-3` | Home & Garden > Decor > Artwork > Posters, Prints, & Visual Artwork > **Visual Artwork** |
| `gid://shopify/TaxonomyCategory/hg-3-4-3` | Home & Garden > Decor > Artwork > **Sculptures & Statues** |

### Garden Art
| GID | Full Path |
|-----|-----------|
| `gid://shopify/TaxonomyCategory/hg-3-43` | Home & Garden > Decor > Lawn Ornaments & Garden Sculptures |
| `gid://shopify/TaxonomyCategory/hg-3-43-1` | Home & Garden > Decor > Lawn Ornaments & Garden Sculptures > Garden Sculptures |

---

## Category ID Format

```
gid://shopify/TaxonomyCategory/{category-code}

Examples:
- hg-3-4-2-4  = Home & Garden (hg) > Decor (3) > Artwork (4) > Posters/Prints (2) > Paintings (4)
- aa-1-13     = Apparel & Accessories (aa) > Clothing (1) > Shirts (13)
```

---

## Top-Level Categories (26 total)

| Code | Category |
|------|----------|
| `aa` | Apparel & Accessories |
| `ae` | Arts & Entertainment |
| `ap` | Animals & Pet Supplies |
| `bi` | Business & Industrial |
| `cs` | Cameras & Optics |
| `el` | Electronics |
| `fb` | Food, Beverages & Tobacco |
| `fu` | Furniture |
| `hc` | Hardware |
| `hg` | **Home & Garden** |
| `hb` | Health & Beauty |
| `lg` | Luggage & Bags |
| `ma` | Mature |
| `me` | Media |
| `of` | Office Supplies |
| `re` | Religious & Ceremonial |
| `sf` | Software |
| `sg` | Sporting Goods |
| `tg` | Toys & Games |
| `vc` | Vehicles & Parts |

---

## GraphQL Usage

### Set Category on Product
```graphql
mutation productUpdate($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product {
      id
      category { id name fullName }
    }
    userErrors { field message }
  }
}

# Variables:
{
  "product": {
    "id": "gid://shopify/Product/123456789",
    "category": "gid://shopify/TaxonomyCategory/hg-3-4-2-4"
  }
}
```

### Query All Categories (only returns root level!)
```graphql
query {
  taxonomy {
    categories(first: 250) {
      nodes { id name fullName isLeaf }
    }
  }
}
```

**Note:** The GraphQL query only returns ~26 root categories, not nested ones. For full taxonomy, download from GitHub.

---

## Full Taxonomy Download

```bash
# Download complete taxonomy (11,767 categories)
curl -s "https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/categories.txt" -o shopify_categories.txt

# JSON format
curl -s "https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/categories.json" -o shopify_categories.json
```

---

## Common Mappings for Gallery Store

| Product Type | Shopify Category GID |
|--------------|---------------------|
| Paintings | `gid://shopify/TaxonomyCategory/hg-3-4-2-4` |
| Prints | `gid://shopify/TaxonomyCategory/hg-3-4-2-2` |
| Posters | `gid://shopify/TaxonomyCategory/hg-3-4-2-1` |
| Photographs | `gid://shopify/TaxonomyCategory/hg-3-4-2-3` (Visual Artwork) |
| Sculptures | `gid://shopify/TaxonomyCategory/hg-3-4-3` |
| Art (generic) | `gid://shopify/TaxonomyCategory/hg-3-4-2` |

---

*Last Updated: January 1, 2026*
