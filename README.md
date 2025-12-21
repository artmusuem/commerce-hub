# Commerce Hub

A multi-channel e-commerce admin panel for managing products across WooCommerce, Shopify, Etsy, and custom storefronts from a single dashboard.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=flat&logo=vercel&logoColor=white)

**Live Demo:** [commerce-hub-iota.vercel.app](https://commerce-hub-iota.vercel.app)

---

## Features

- **Unified Product Management** — Create, edit, and sync products across multiple platforms
- **WooCommerce Integration** — Import products, push updates, track sync status
- **Shopify OAuth** — Secure store connection with token management
- **Gallery Store** — JSON-based storefront with Smithsonian Open Access artwork
- **Real-time Sync** — Changes propagate to connected platforms automatically

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      COMMERCE HUB                           │
│                   (React + TypeScript)                      │
│                                                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │ Products  │  │  Stores   │  │ Sync Logs │               │
│  └─────┬─────┘  └─────┬─────┘  └───────────┘               │
│        │              │                                     │
│        ▼              ▼                                     │
│  ┌─────────────────────────────────────────────────┐       │
│  │         Supabase (Postgres + Auth)              │       │
│  └─────────────────────────────────────────────────┘       │
│        │              │                                     │
│        ▼              ▼                                     │
│  ┌─────────────────────────────────────────────────┐       │
│  │       Vercel Serverless (API Proxy Layer)       │       │
│  └─────────────────────────────────────────────────┘       │
└────────┼──────────────┼─────────────────────────────────────┘
         │              │
         ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                   EXTERNAL PLATFORMS                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │WooCommerce│  │ Shopify  │  │   Etsy   │  │ Gallery  │    │
│  │ REST API │  │  Admin   │  │   API    │  │  Store   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS |
| Backend | Supabase (Postgres, Auth, Row Level Security) |
| Serverless | Vercel Functions |
| Integrations | WooCommerce REST API, Shopify Admin API |

## Quick Start

```bash
# Clone the repository
git clone https://github.com/artmusuem/commerce-hub.git
cd commerce-hub

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Start development server
npm run dev
```

## Environment Variables

Create `.env.local`:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

For platform integrations, add credentials via the Stores dashboard in the app.

## Project Structure

```
commerce-hub/
├── api/                    # Vercel serverless functions
│   ├── woocommerce/        # WooCommerce API proxy
│   └── shopify/            # Shopify OAuth handlers
├── src/
│   ├── components/         # Reusable UI components
│   ├── lib/                # API clients and utilities
│   │   ├── supabase.ts     # Database client
│   │   ├── woocommerce.ts  # WooCommerce wrapper
│   │   └── transforms.ts   # Data format converters
│   └── pages/              # Route components
│       ├── products/       # Product CRUD
│       └── stores/         # Store connections
└── public/
```

## Key Patterns

### External ID Tracking

Products maintain `external_id` to link with platform records:

```typescript
// Import: Save platform's product ID
external_id: String(wooProduct.id)

// Push: Determines update vs create
if (external_id) {
  await api.put(`/products/${external_id}`, data)  // Update
} else {
  await api.post('/products', data)                // Create
}
```

### Serverless API Proxy

All platform calls route through `/api/{platform}/` to:
- Keep API secrets server-side
- Handle CORS
- Transform request/response formats

## Related Projects

- **[Gallery Store](https://github.com/artmusuem/ecommerce-react)** — Customer-facing storefront with Stripe payments

## Roadmap

- [x] WooCommerce product sync
- [x] Shopify OAuth connection
- [x] Supabase authentication
- [ ] Category mapping across platforms
- [ ] Shopify product sync
- [ ] Bulk edit operations
- [ ] Etsy integration

## License

MIT

---

Built with React, Supabase, and Vercel.
