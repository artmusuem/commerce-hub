# Commerce Hub - Project Handoff Document

**Date:** December 18, 2025  
**Status:** Phase 1 Complete, Phase 2 In Progress  
**Last Action:** Store-product linking code pushed, pending SQL migration

---

## 🏗️ Architecture Overview

```
Commerce Hub (Admin Panel)
├── Supabase Backend (Auth + Postgres)
├── Products CRUD
├── Store Connections
│   ├── Gallery Store (JSON import) ✅
│   ├── WooCommerce (REST API) ✅
│   ├── Etsy (OAuth) ⏳ Pending API approval
│   └── Shopify (future)
└── Deployed: https://commerce-hub-iota.vercel.app

Gallery Store (Customer Storefront)
├── React 18 + Vite + Tailwind
├── Cloudinary CDN for images
├── Stripe checkout
├── JSON-based products
└── Deployed: https://ecommerce-react-beta-woad.vercel.app

Data Flow:
Commerce Hub (Supabase) → Export JSON → Gallery Store → Vercel auto-deploys
```

---

## 📂 Repositories & Local Paths

| Project | GitHub | Local Path | Vercel URL |
|---------|--------|------------|------------|
| Commerce Hub | https://github.com/artmusuem/commerce-hub | `C:\xampp\htdocs\commerce-hub-v2` | https://commerce-hub-iota.vercel.app |
| Gallery Store | https://github.com/artmusuem/ecommerce-react | `C:\xampp\htdocs\ecommerce-react` | https://ecommerce-react-beta-woad.vercel.app |

---

## 🔑 Credentials (See .env.local or secrets manager)

- **Supabase:** Project ID `owfyxfeaialumomzsejd`
- **GitHub:** Account `artmusuem`
- **Etsy:** App name `commerce-hub` (Pending approval)
- **WooCommerce:** Site `https://rapidwoo.com/commerce`
- **Cloudinary:** Cloud name `dh4qwuvuo`

---

## ⏳ PENDING ACTIONS (Resume Here)

### 1. Run Store-Product Linking Migration
```sql
-- Run in Supabase SQL Editor:
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
```

### 2. Pull Latest Code
```cmd
cd C:\xampp\htdocs\commerce-hub-v2
git pull origin main
```

### 3. Clear Old Products & Re-import
After migration, delete existing products (they lack store_id), then:
- Go to /stores → Import Gallery Store
- Go to /stores → Connect WooCommerce

### 4. Check Etsy API Approval
- Visit: https://www.etsy.com/developers/your-apps

---

## 🔄 Workflow

```cmd
# Pull Claude's changes
cd C:\xampp\htdocs\commerce-hub-v2
git pull origin main

# Run local dev server
npm run dev

# Force Vercel deploy
git commit --allow-empty -m "trigger deploy"
git push origin main
```

---

## ✅ Completed Features

- [x] Supabase project setup
- [x] User authentication (register/login)
- [x] Products CRUD
- [x] Admin dashboard
- [x] Vercel deployment
- [x] Gallery Store JSON import
- [x] WooCommerce REST API connection
- [x] Image thumbnail optimization
- [ ] Store-product linking (code pushed, migration pending)
- [ ] Etsy OAuth (pending API approval)

---

## 🎯 Roadmap

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | Foundation | ✅ Complete |
| Phase 2 | Store Connections | 🔄 In Progress |
| Phase 3 | Orders & Sync | ⏳ Planned |
| Phase 4 | Multi-Platform | ⏳ Planned |

---

## 🛠️ Tech Stack

- React 18 + TypeScript + Vite 5
- Tailwind CSS 4
- React Router 6
- Supabase (Postgres + Auth)
- Vercel

---

## 📞 User Preferences

- Move fast, no explanations
- Claude pushes code, user pulls
- Senior developer style, no fluff
- Copy-paste commands

---

*Last Updated: December 18, 2025*
