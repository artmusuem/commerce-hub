// Simple WooCommerce API wrapper - NO TYPESCRIPT

// Fetch products from WooCommerce
export async function fetchWooProducts(credentials) {
  const res = await fetch('/api/woocommerce/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentials, endpoint: 'products' })
  })
  
  if (!res.ok) throw new Error('Failed to fetch products')
  
  const json = await res.json()
  return json.data || json
}

// Fetch categories from WooCommerce
export async function fetchWooCategories(credentials) {
  const res = await fetch('/api/woocommerce/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentials })
  })
  
  if (!res.ok) return []
  return res.json()
}

// Push product to WooCommerce (create or update)
export async function pushToWoo(credentials, product, existingId) {
  const res = await fetch('/api/woocommerce/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      credentials,
      product,
      existingProductId: existingId
    })
  })
  
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Push failed')
  }
  
  return res.json()
}

// Convert Commerce Hub product to WooCommerce format
export function toWooFormat(product) {
  const woo = {
    name: product.title,
    type: 'simple',
    regular_price: String(product.price),
    description: product.description || '',
    sku: product.sku || '',
    status: product.status === 'active' ? 'publish' : 'draft'
  }
  
  if (product.image_url) {
    woo.images = [{ src: product.image_url }]
  }
  
  if (product.categoryId) {
    woo.categories = [{ id: product.categoryId }]
  }
  
  return woo
}
