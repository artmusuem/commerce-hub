export interface Product {
  id: string
  user_id: string
  title: string
  description: string | null
  price: number
  artist: string | null
  category: string | null
  tags: string[] | null
  image_url: string | null
  thumbnail_url: string | null
  images: string[] | null
  sku: string | null
  quantity: number
  track_inventory: boolean
  status: 'draft' | 'active' | 'archived'
  smithsonian_id: string | null
  etsy_listing_id: string | null
  shopify_product_id: string | null
  printful_product_id: string | null
  created_at: string
  updated_at: string
}
