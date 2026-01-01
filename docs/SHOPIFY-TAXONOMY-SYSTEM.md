# Shopify Taxonomy System - Complete Reference

## Overview

Shopify's Standard Product Taxonomy consists of:
- **11,767 Categories** (hierarchical)
- **5,000+ Attributes** (metafields)
- **50,000+ Values** (attribute options)

## Data Files in This Repo

| File | Size | Purpose |
|------|------|---------|
| `docs/shopify-categories-full.txt` | 1.6MB | All 11,767 categories (GID : Full Path) |
| `docs/shopify-categories.json` | 30MB | Full category tree with attributes (download separately) |
| `docs/shopify-attributes.json` | 5MB | All attributes with values (download separately) |
| `src/lib/shopify-taxonomy.ts` | ~10KB | Runtime lookup service |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    PRODUCT PUSH FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Commerce Hub Product                                           │
│  ┌─────────────────────┐                                       │
│  │ title: "Sunset..."  │                                       │
│  │ category: "Paintings"│──┐                                    │
│  │ description: "oil..." │  │                                   │
│  │ artist: "Thomas Cole" │  │                                   │
│  └─────────────────────┘  │                                    │
│                           ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              TAXONOMY LOOKUP SERVICE                     │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │  Category   │  │  Attribute  │  │  Value Matcher  │  │   │
│  │  │   Mapper    │  │   Lookup    │  │  (parse desc)   │  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │   │
│  │         │                │                   │           │   │
│  │         ▼                ▼                   ▼           │   │
│  │  "Paintings" →    [painting-medium,    "oil on canvas"  │   │
│  │  hg-3-4-2-4      artwork-authenticity,  → "Oil"         │   │
│  │                  frame-style, ...]                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│  Shopify GraphQL Mutation                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ productUpdate:                                           │   │
│  │   category: "gid://shopify/TaxonomyCategory/hg-3-4-2-4" │   │
│  │   metafields: [                                         │   │
│  │     { namespace: "shopify", key: "painting-medium",     │   │
│  │       value: "gid://shopify/TaxonomyValue/26262" }      │   │
│  │     { namespace: "shopify", key: "artwork-authenticity",│   │
│  │       value: "gid://shopify/TaxonomyValue/26299" }      │   │
│  │   ]                                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Art Categories - Quick Reference

### Categories
| Our Category | Shopify GID | Full Path |
|--------------|-------------|-----------|
| Paintings | `hg-3-4-2-4` | Home & Garden > Decor > Artwork > Posters, Prints & Visual Artwork > Paintings |
| Prints | `hg-3-4-2-2` | ... > Prints |
| Posters | `hg-3-4-2-1` | ... > Posters |
| Visual Artwork | `hg-3-4-2-3` | ... > Visual Artwork |
| Sculptures | `hg-3-4-3` | Home & Garden > Decor > Artwork > Sculptures & Statues |

### Paintings Attributes (8 total)
| Attribute | Handle | Auto-Fill From |
|-----------|--------|----------------|
| Art movement | `art-movement` | Parse title/description for "Impressionism", etc. |
| Artwork authenticity | `artwork-authenticity` | Default: "Reproduction" for museum prints |
| Artwork frame material | `artwork-frame-material` | Default: null (unframed) |
| Color | `color` | Default: "Multicolor" |
| Frame style | `frame-style` | Default: "Unframed" |
| Painting medium | `painting-medium` | Parse description for "oil", "watercolor", etc. |
| Pattern | `pattern` | Usually null for fine art |
| Theme | `theme` | Parse for "Nature", "Portrait", "Landscape", etc. |

### Painting Medium Values
| Value | GID | Keywords to Match |
|-------|-----|-------------------|
| Oil | 26262 | "oil on canvas", "oil painting" |
| Acrylic | 26244 | "acrylic" |
| Watercolor | 26270 | "watercolor", "water color" |
| Gouache | 26256 | "gouache" |
| Tempera | 26252 | "tempera" |
| Pastel | 26263 | "pastel" |
| Ink | 26258 | "ink" |
| Digital | 26250 | "digital" |

### Artwork Authenticity Values
| Value | GID | When to Use |
|-------|-----|-------------|
| Original | 26298 | Never (we sell reproductions) |
| Reproduction | 26299 | Always for museum prints |
| Other | 28089 | Rare cases |

### Theme Values (Common)
| Value | GID | Keywords |
|-------|-----|----------|
| Nature | 7911 | "landscape", "nature", "trees", "mountains" |
| Animals | 17404 | "animal", "bird", "horse" |
| Portrait | 7916 | "portrait" |
| Architecture | 7896 | "building", "architecture" |
| Religious | 7917 | "religious", "biblical" |
| Historical | 7906 | "historical", "battle" |
| Maritime | 7909 | "sea", "ship", "ocean", "maritime" |
| Floral | 17407 | "flower", "floral", "botanical" |

---

## Implementation Plan

### Phase 1: Core Lookup (Current)
- [x] Hardcoded art category mappings
- [x] Category set on product push
- [ ] Parse medium from description

### Phase 2: Metafield Auto-Fill
- [ ] Create `parseProductMetafields()` function
- [ ] Match description keywords to attribute values
- [ ] Send metafields with product update

### Phase 3: Full Taxonomy Support
- [ ] Load full taxonomy JSON at build time
- [ ] Create category search/autocomplete
- [ ] Dynamic attribute lookup per category

### Phase 4: Multi-Platform Mapping
- [ ] Map WooCommerce categories → Shopify taxonomy
- [ ] Map Etsy categories → Shopify taxonomy
- [ ] Unified category picker in Commerce Hub UI

---

## GraphQL Examples

### Set Category + Metafields
```graphql
mutation productUpdate($product: ProductUpdateInput!) {
  productUpdate(product: $product) {
    product {
      id
      category { id name fullName }
      metafields(first: 10) {
        nodes { namespace key value }
      }
    }
    userErrors { field message }
  }
}

# Variables
{
  "product": {
    "id": "gid://shopify/Product/123",
    "category": "gid://shopify/TaxonomyCategory/hg-3-4-2-4",
    "metafields": [
      {
        "namespace": "shopify--discovery--product_taxonomy",
        "key": "painting-medium",
        "value": "gid://shopify/TaxonomyValue/26262",
        "type": "single_line_text_field"
      }
    ]
  }
}
```

---

## Download Full Taxonomy

```bash
# Categories with attributes (30MB)
curl -s "https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/categories.json" \
  -o shopify-categories.json

# Attributes with all values (5MB)
curl -s "https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/attributes.json" \
  -o shopify-attributes.json

# Categories text format (1.6MB)
curl -s "https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/categories.txt" \
  -o shopify-categories.txt
```

---

*Last Updated: January 1, 2026*
