// Shopify Standard Product Taxonomy - Lookup Service
// Source: https://github.com/Shopify/product-taxonomy

// =============================================================================
// CATEGORY MAPPINGS
// =============================================================================

export const CATEGORY_MAP: Record<string, string> = {
  // Art categories (Home & Garden > Decor > Artwork)
  'paintings': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4',
  'painting': 'gid://shopify/TaxonomyCategory/hg-3-4-2-4',
  'prints': 'gid://shopify/TaxonomyCategory/hg-3-4-2-2',
  'print': 'gid://shopify/TaxonomyCategory/hg-3-4-2-2',
  'posters': 'gid://shopify/TaxonomyCategory/hg-3-4-2-1',
  'poster': 'gid://shopify/TaxonomyCategory/hg-3-4-2-1',
  'visual artwork': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
  'artwork': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
  'photographs': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
  'photography': 'gid://shopify/TaxonomyCategory/hg-3-4-2-3',
  'sculptures': 'gid://shopify/TaxonomyCategory/hg-3-4-3',
  'sculpture': 'gid://shopify/TaxonomyCategory/hg-3-4-3',
  'tapestries': 'gid://shopify/TaxonomyCategory/hg-3-4-1',
  'tapestry': 'gid://shopify/TaxonomyCategory/hg-3-4-1',
  
  // Add more categories as needed...
}

// =============================================================================
// ATTRIBUTE DEFINITIONS
// =============================================================================

export const ATTRIBUTES = {
  // Painting-specific
  'painting-medium': {
    id: 'gid://shopify/TaxonomyAttribute/3428',
    values: {
      'oil': 'gid://shopify/TaxonomyValue/26262',
      'acrylic': 'gid://shopify/TaxonomyValue/26244',
      'watercolor': 'gid://shopify/TaxonomyValue/26270',
      'gouache': 'gid://shopify/TaxonomyValue/26256',
      'tempera': 'gid://shopify/TaxonomyValue/26252',
      'pastel': 'gid://shopify/TaxonomyValue/26263',
      'ink': 'gid://shopify/TaxonomyValue/26258',
      'charcoal': 'gid://shopify/TaxonomyValue/26248',
      'digital': 'gid://shopify/TaxonomyValue/26250',
      'mixed media': 'gid://shopify/TaxonomyValue/26260',
      'other': 'gid://shopify/TaxonomyValue/26271',
    }
  },
  
  'artwork-authenticity': {
    id: 'gid://shopify/TaxonomyAttribute/3430',
    values: {
      'original': 'gid://shopify/TaxonomyValue/26298',
      'reproduction': 'gid://shopify/TaxonomyValue/26299',
      'other': 'gid://shopify/TaxonomyValue/28089',
    }
  },
  
  'frame-style': {
    id: 'gid://shopify/TaxonomyAttribute/3137',
    values: {
      'framed': 'gid://shopify/TaxonomyValue/24017',
      'unframed': 'gid://shopify/TaxonomyValue/7893',
      'canvas': 'gid://shopify/TaxonomyValue/24015',
      'gallery wrapped': 'gid://shopify/TaxonomyValue/7887',
      'matted': 'gid://shopify/TaxonomyValue/7888',
      'floater': 'gid://shopify/TaxonomyValue/7885',
      'shadow box': 'gid://shopify/TaxonomyValue/7892',
      'poster': 'gid://shopify/TaxonomyValue/24019',
      'modern': 'gid://shopify/TaxonomyValue/24018',
      'rustic': 'gid://shopify/TaxonomyValue/24020',
      'ornate': 'gid://shopify/TaxonomyValue/7889',
      'other': 'gid://shopify/TaxonomyValue/27843',
    }
  },
  
  'theme': {
    id: 'gid://shopify/TaxonomyAttribute/134',
    values: {
      'nature': 'gid://shopify/TaxonomyValue/7911',
      'animals': 'gid://shopify/TaxonomyValue/17404',
      'portrait': 'gid://shopify/TaxonomyValue/7916',
      'landscape': 'gid://shopify/TaxonomyValue/7908',
      'architecture': 'gid://shopify/TaxonomyValue/7896',
      'religious': 'gid://shopify/TaxonomyValue/7917',
      'historical': 'gid://shopify/TaxonomyValue/7906',
      'maritime': 'gid://shopify/TaxonomyValue/7909',
      'floral': 'gid://shopify/TaxonomyValue/17407',
      'abstract': 'gid://shopify/TaxonomyValue/7894',
      'food': 'gid://shopify/TaxonomyValue/7903',
      'music': 'gid://shopify/TaxonomyValue/7910',
      'sports': 'gid://shopify/TaxonomyValue/7919',
      'travel': 'gid://shopify/TaxonomyValue/7921',
      'mythology': 'gid://shopify/TaxonomyValue/17412',
      'spirituality': 'gid://shopify/TaxonomyValue/7920',
      'other': 'gid://shopify/TaxonomyValue/7912',
    }
  },
  
  'color': {
    id: 'gid://shopify/TaxonomyAttribute/1',
    values: {
      'black': 'gid://shopify/TaxonomyValue/1',
      'blue': 'gid://shopify/TaxonomyValue/2',
      'brown': 'gid://shopify/TaxonomyValue/7',
      'gold': 'gid://shopify/TaxonomyValue/4',
      'green': 'gid://shopify/TaxonomyValue/9',
      'gray': 'gid://shopify/TaxonomyValue/8',
      'multicolor': 'gid://shopify/TaxonomyValue/2865',
      'orange': 'gid://shopify/TaxonomyValue/10',
      'pink': 'gid://shopify/TaxonomyValue/11',
      'purple': 'gid://shopify/TaxonomyValue/12',
      'red': 'gid://shopify/TaxonomyValue/13',
      'white': 'gid://shopify/TaxonomyValue/5',
      'yellow': 'gid://shopify/TaxonomyValue/16',
      'beige': 'gid://shopify/TaxonomyValue/6',
      'silver': 'gid://shopify/TaxonomyValue/14',
    }
  },
  
  'art-movement': {
    id: 'gid://shopify/TaxonomyAttribute/3429',
    values: {
      'abstract': 'gid://shopify/TaxonomyValue/26272',
      'baroque': 'gid://shopify/TaxonomyValue/26275',
      'classicism': 'gid://shopify/TaxonomyValue/26277',
      'expressionism': 'gid://shopify/TaxonomyValue/26280',
      'impressionism': 'gid://shopify/TaxonomyValue/26284',
      'minimalism': 'gid://shopify/TaxonomyValue/26285',
      'modernism': 'gid://shopify/TaxonomyValue/26286',
      'realism': 'gid://shopify/TaxonomyValue/26289',
      'renaissance': 'gid://shopify/TaxonomyValue/26290',
      'romanticism': 'gid://shopify/TaxonomyValue/26291',
      'surrealism': 'gid://shopify/TaxonomyValue/26293',
      'pop art': 'gid://shopify/TaxonomyValue/26288',
      'other': 'gid://shopify/TaxonomyValue/26297',
    }
  },
}

// =============================================================================
// CATEGORY → ATTRIBUTES MAPPING
// =============================================================================

export const CATEGORY_ATTRIBUTES: Record<string, string[]> = {
  'hg-3-4-2-4': ['painting-medium', 'artwork-authenticity', 'frame-style', 'theme', 'color', 'art-movement'],
  'hg-3-4-2-2': ['frame-style', 'theme', 'color'],  // Prints
  'hg-3-4-2-1': ['frame-style', 'theme', 'color'],  // Posters
  'hg-3-4-2-3': ['artwork-authenticity', 'frame-style', 'theme', 'color'],  // Visual Artwork
  'hg-3-4-3': ['theme', 'color'],  // Sculptures
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Look up a category GID from a category name
 */
export function getCategoryGid(categoryName: string): string | null {
  const normalized = categoryName.toLowerCase().trim()
  return CATEGORY_MAP[normalized] || null
}

/**
 * Get the short category code from a full GID
 */
export function getCategoryCode(gid: string): string {
  return gid.replace('gid://shopify/TaxonomyCategory/', '')
}

/**
 * Get available attributes for a category
 */
export function getAttributesForCategory(categoryGid: string): string[] {
  const code = getCategoryCode(categoryGid)
  return CATEGORY_ATTRIBUTES[code] || []
}

/**
 * Parse product description to extract painting medium
 */
export function parseMedium(description: string): string | null {
  const desc = description.toLowerCase()
  
  const mediumPatterns: [RegExp, string][] = [
    [/oil\s*(on\s*canvas|painting)?/i, 'oil'],
    [/watercolor|water\s*color/i, 'watercolor'],
    [/acrylic/i, 'acrylic'],
    [/gouache/i, 'gouache'],
    [/tempera/i, 'tempera'],
    [/pastel/i, 'pastel'],
    [/ink\s*(drawing|wash)?/i, 'ink'],
    [/charcoal/i, 'charcoal'],
    [/digital/i, 'digital'],
    [/mixed\s*media/i, 'mixed media'],
  ]
  
  for (const [pattern, medium] of mediumPatterns) {
    if (pattern.test(desc)) {
      const values = ATTRIBUTES['painting-medium'].values as Record<string, string>
      return values[medium] || null
    }
  }
  
  return null
}

/**
 * Parse description to extract theme
 */
export function parseTheme(title: string, description: string): string | null {
  const text = `${title} ${description}`.toLowerCase()
  
  const themePatterns: [RegExp, string][] = [
    [/landscape|scenery|vista/i, 'landscape'],
    [/portrait/i, 'portrait'],
    [/maritime|sea|ship|ocean|naval/i, 'maritime'],
    [/religious|biblical|christian|church/i, 'religious'],
    [/animal|bird|horse|dog|cat/i, 'animals'],
    [/flower|floral|botanical/i, 'floral'],
    [/nature|tree|forest|mountain/i, 'nature'],
    [/architecture|building|city/i, 'architecture'],
    [/abstract/i, 'abstract'],
    [/historical|battle|war/i, 'historical'],
    [/mythology|mythological|greek|roman/i, 'mythology'],
    [/spiritual|meditation/i, 'spirituality'],
  ]
  
  for (const [pattern, theme] of themePatterns) {
    if (pattern.test(text)) {
      const values = ATTRIBUTES['theme'].values as Record<string, string>
      return values[theme] || null
    }
  }
  
  return null
}

/**
 * Build metafields array for a product
 */
export function buildArtworkMetafields(product: {
  title: string
  description: string
  category?: string
}): Array<{ namespace: string; key: string; value: string; type: string }> {
  const metafields: Array<{ namespace: string; key: string; value: string; type: string }> = []
  
  // Always set as reproduction (museum prints)
  metafields.push({
    namespace: 'shopify--discovery--product_taxonomy',
    key: 'artwork-authenticity',
    value: ATTRIBUTES['artwork-authenticity'].values['reproduction'],
    type: 'single_line_text_field'
  })
  
  // Default to unframed
  metafields.push({
    namespace: 'shopify--discovery--product_taxonomy',
    key: 'frame-style',
    value: ATTRIBUTES['frame-style'].values['unframed'],
    type: 'single_line_text_field'
  })
  
  // Default to multicolor
  metafields.push({
    namespace: 'shopify--discovery--product_taxonomy',
    key: 'color',
    value: ATTRIBUTES['color'].values['multicolor'],
    type: 'single_line_text_field'
  })
  
  // Try to parse medium from description
  const medium = parseMedium(product.description)
  if (medium) {
    metafields.push({
      namespace: 'shopify--discovery--product_taxonomy',
      key: 'painting-medium',
      value: medium,
      type: 'single_line_text_field'
    })
  }
  
  // Try to parse theme
  const theme = parseTheme(product.title, product.description)
  if (theme) {
    metafields.push({
      namespace: 'shopify--discovery--product_taxonomy',
      key: 'theme',
      value: theme,
      type: 'single_line_text_field'
    })
  }
  
  return metafields
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  CATEGORY_MAP,
  ATTRIBUTES,
  CATEGORY_ATTRIBUTES,
  getCategoryGid,
  getCategoryCode,
  getAttributesForCategory,
  parseMedium,
  parseTheme,
  buildArtworkMetafields,
}
