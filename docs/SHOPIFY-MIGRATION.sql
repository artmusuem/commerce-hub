-- Commerce Hub - Shopify State of the Art Migration
-- Run this in Supabase SQL Editor
-- https://supabase.com/dashboard/project/owfyxfeaialumomzsejd/sql/new

-- ============================================
-- STEP 1: Add Variant Support
-- ============================================

-- Variants array - stores all Shopify variants
ALTER TABLE products ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]'::jsonb;

-- Options array - product options like Size, Color
ALTER TABLE products ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '[]'::jsonb;

-- ============================================
-- STEP 2: Add Sync Tracking
-- ============================================

-- Sync status: 'synced', 'pending', 'modified', 'conflict', 'error'
ALTER TABLE products ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced';

-- Last synced timestamp
ALTER TABLE products ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

-- Remote updated_at (from Shopify) for conflict detection
ALTER TABLE products ADD COLUMN IF NOT EXISTS remote_updated_at TIMESTAMP WITH TIME ZONE;

-- ============================================
-- STEP 3: Add Vendor (separate from artist)
-- ============================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS vendor TEXT;

-- ============================================
-- STEP 4: Add SEO Fields
-- ============================================

-- URL handle/slug
ALTER TABLE products ADD COLUMN IF NOT EXISTS url_handle TEXT;

-- Meta title for SEO
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_title TEXT;

-- Meta description for SEO  
ALTER TABLE products ADD COLUMN IF NOT EXISTS meta_description TEXT;

-- ============================================
-- STEP 5: Indexes for Performance
-- ============================================

-- Index for sync status filtering
CREATE INDEX IF NOT EXISTS idx_products_sync_status ON products(sync_status);

-- Index for store + platform queries
CREATE INDEX IF NOT EXISTS idx_products_store_platform ON products(store_id, product_type);

-- ============================================
-- VERIFICATION
-- ============================================

-- Run this to verify columns were added:
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'products' 
AND column_name IN ('variants', 'options', 'sync_status', 'last_synced_at', 'vendor', 'url_handle')
ORDER BY column_name;
