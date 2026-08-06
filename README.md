# Family Shop

A clean, mobile-first **Progressive Web App** for shared family shopping lists.

**The key idea:** checking items off only removes them from *this week’s* list.  
Your permanent **Master List** stays forever so re-adding next shop is one tap.

## Features

- **Two-tier lists** — Master library + current shopping list
- **One-tap re-add** from Master / frequent quick-add chips
- **Shopping Mode** — large checkboxes, category groups, bought section
- **Barcode scanner** + [Open Food Facts](https://world.openfoodfacts.org) lookup (with local cache)
- **Family codes & invite links** (`?join=CODE`)
- **Offline-first PWA** (IndexedDB) with optional Cloudflare real-time sync
- **Dark / light / system** theme
- **iPhone-ready** — safe-area insets, Add to Home Screen, `playsInline` camera, 16px inputs

## Quick start (local)

```bash
cd family-shop
npm install
npm run dev
```

Open the URL on your phone (same Wi‑Fi) or use Chrome device mode.

### iPhone install

1. Open the site in **Safari**
2. Share → **Add to Home Screen**
3. Use the app icon (standalone, full-screen)

## Architecture

| Layer | Tech |
|--------|------|
| Frontend | Vite + React + TypeScript + Tailwind v4 |
| Local store | Zustand + IndexedDB (`idb`) |
| PWA | `vite-plugin-pwa` (service worker + manifest) |
| Barcodes | `@zxing/browser` + Open Food Facts API v2 |
| Backend (optional) | Cloudflare Worker + D1 + Durable Objects (WebSocket rooms) |
| Hosting | Cloudflare Pages (static) + Workers (API) |

Without `VITE_API_URL`, the app is fully usable on one device (and multi-tab via `BroadcastChannel`).  
With the Worker configured, families sync in real time across devices.

## Cloudflare deploy

### 1. Pages (frontend)

```bash
npm run build
# Connect this repo to Cloudflare Pages
# Build command: npm run build
# Output directory: dist
# Env var: VITE_API_URL=https://family-shop-api.<you>.workers.dev
```

Or:

```bash
npx wrangler pages deploy dist --project-name=family-shop
```

### 2. Worker API + D1 + Durable Objects

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create family-shop
# paste database_id into wrangler.toml
npm run db:migrate
npm run deploy
```

Set the frontend `VITE_API_URL` to the Worker URL and rebuild Pages.

### API surface

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/families` | Create family `{ name }` |
| POST | `/api/families/join` | Join `{ code }` → snapshot |
| GET | `/api/families/:id` | Pull snapshot |
| PUT | `/api/families/:id/sync` | Push full snapshot (LWW) |
| WS | `/api/ws/:familyId` | Real-time snapshot broadcasts |

## Open Food Facts

- Endpoint: `https://world.openfoodfacts.org/api/v2/product/{barcode}.json`
- Fields: `product_name,brands,quantity,image_front_url,categories_tags`
- User-Agent: `FamilyShop/1.0 (...)`
- Successful lookups are cached in IndexedDB to stay under rate limits

## Project layout

```
family-shop/
  src/                 # React PWA
  public/              # Icons, redirects
  worker/              # Cloudflare API + Durable Object room
  wrangler / Pages     # See worker/wrangler.toml
```

## Priority roadmap

1. ✅ Core data model + two-tier list
2. ✅ Real-time sharing (DO WebSockets + D1; local multi-tab without API)
3. ✅ Barcode + Open Food Facts
4. ✅ iPhone PWA polish
5. ⬜ Web Push when members edit (VAPID keys + Worker)
6. ✅ Deploy docs for GitHub + Cloudflare Pages

## License

MIT — use freely for your family.
