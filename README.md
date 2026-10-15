# Pastebox

A small Pastebin-style application for saving text and sharing it with a link. Pastebox is built with React and Express, with PostgreSQL for durable storage. New share links use a compact, eight-letter ID. A paste can expire after a chosen time or after a maximum number of views; pastes are deleted from PostgreSQL after serving their final permitted view. Pastes are private (unlisted) by default; owners may opt into the public Explore page when creating one.

[Full project report (PDF)](output/pdf/Pastebox_Project_Report.pdf) - architecture, features, security controls, performance checklist, deployment notes, and verified tests.

## Features

- Create a text paste with an optional title (up to 500 KB).
- Share a unique, URL-safe link; opening it records a view.
- Set an expiry of 1 hour, 1 day, 7 days, or 30 days, or leave it unlimited.
- Set a maximum view count; the final allowed view is returned and later visits get a not-found response.
- Search and paginate explicitly discoverable pastes. Search is debounced in the browser.
- Responsive UI, loading skeletons, copy actions, validation, and useful error states.
- Optional Redis-backed shared caching, with a bounded in-process fallback.

## Project structure

```text
.
├── client/
│   ├── index.html                 # App shell and metadata
│   ├── vite.config.js             # Dev API proxy, chunking, production minification
│   └── src/
│       ├── main.jsx               # React entry, routes, lazy page loading, query cache
│       ├── styles.css             # Responsive UI and skeleton animation
│       ├── components/            # Shared header and loading skeleton
│       ├── lib/api.js             # Typed-by-convention API helpers
│       └── pages/                 # Pages and React user-flow tests
├── server/
│   ├── src/
│   │   ├── index.js               # Startup, schema initialization, graceful shutdown
│   │   ├── app.js                 # Express middleware and REST endpoints
│   │   ├── db.js                  # PostgreSQL pool and schema loader
│   │   ├── schema.sql             # Tables and indexes
│   │   └── cache.js               # Optional Redis plus bounded memory cache
│   ├── test/app.test.js           # API and PostgreSQL integration tests
│   └── package.json
├── docker-compose.yml             # Local PostgreSQL and Redis
├── .env.example
└── package.json                   # npm workspaces and root commands
```

## Run locally

Requirements: Node.js 20+, npm, and Docker Desktop (or your own PostgreSQL instance).

1. Copy `.env.example` to `.env`.
2. Start the local services with `docker compose up -d`.
3. Install packages with `npm install`.
4. Start the API and Vite development server with `npm run dev`.
5. Open the Vite URL printed in the terminal (usually `http://localhost:5173`).

Run API integration tests and React user-flow tests with `npm test`. The API suite uses PGlite, an in-process PostgreSQL engine, so Docker or a hosted database is not needed to run the suite.

The first API start creates the table and indexes using idempotent SQL in `server/src/schema.sql`. Redis is optional. To use it locally, set `REDIS_URL=redis://localhost:6379` in `.env`. PostgreSQL can also be provided by a hosted service via `DATABASE_URL`; set `DATABASE_SSL=true` if its connection requires TLS.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check including database connectivity |
| `POST` | `/api/pastes` | Create a paste |
| `GET` | `/api/pastes/:id` | Retrieve a paste and consume one view |
| `GET` | `/api/pastes?page=1&limit=8&q=term` | Paginated, searchable discoverable pastes |

Create request example:

```json
{
  "title": "Meeting notes",
  "content": "Remember to send the agenda.",
  "expiresIn": "7d",
  "maxViews": 10,
  "discoverable": false
}
```

`expiresIn` accepts `never`, `1h`, `1d`, `7d`, or `30d`. `maxViews` accepts `unlimited` or a positive integer. Invalid input receives a 400 response. Expired or exhausted pastes receive a 404 response.

## Implementation notes

- **View limits are concurrency-safe:** paste reads run in a PostgreSQL transaction, lock the row, check expiry and the limit, then increment the count before returning the content. Thus concurrent requests cannot overrun the configured view count. The view endpoint sends `Cache-Control: no-store` because serving it from a cache would bypass the view counter.
- **PostgreSQL access:** all values are parameterized. A bounded `pg.Pool` is created once per Node process; the conservative default is five connections per instance, with `DB_POOL_MAX` tunable from 1 to 20. The pool also uses short connection/idle timeouts, a 30-minute connection lifetime, and a 10-second statement timeout. The deployment's total connection budget should account for the number of app instances.
- **Indexes:** a partial ordered index supports the Explore feed, a partial `lower(title)` pattern index supports prefix search, and a partial expiry index supports expiry-related scans. The primary key indexes paste lookup. Prefix search is intentionally used so search does not scan paste bodies or require a database extension.
- **No N+1 path:** Explore retrieves a page and the preview fields in one SQL query. Paste reads retrieve a single row; there are no follow-up per-row database calls.
- **Caching:** TanStack Query caches list responses in each browser. The Express list endpoint has short browser/CDN cache headers and an application cache. If `REDIS_URL` is configured, app instances share cached list results; otherwise each process has a size-bounded, TTL-based in-memory cache. New pastes invalidate Explore cache keys. Paste content reads are deliberately uncached.
- **Pagination:** Explore requests a bounded page (`limit` is capped at 50), with a stable `created_at, id` order. The UI provides next/previous controls.
- **Abuse controls:** Paste creation is limited to 20 requests per client IP every 15 minutes. CORS is disabled by default and can be enabled for one trusted frontend origin with `CLIENT_ORIGIN`. Generated links are relative paths, so an untrusted `Host` header cannot be copied into a share link. The limiter is in-process; use a shared rate-limit store or edge rules before scaling across multiple app instances.
- **Debouncing and loading states:** search waits 300 ms after typing before fetching. Route-level skeletons and list skeletons keep layout stable during loading.
- **Code delivery:** React pages load through dynamic imports; Vite separates React and query dependencies into chunks and minifies JavaScript and CSS for production. Compression middleware compresses API and server-served responses.
- **Load balancing:** the Express service is stateless and can run as multiple instances behind a platform's HTTP load balancer. Use shared PostgreSQL and Redis for multi-instance deployments; the in-memory cache fallback is local to one instance.
- **CDN:** serve the built static client through a CDN or deploy the full app behind a provider that offers CDN caching. Static assets are fingerprinted by Vite and can be cached as immutable. The list API's public cache headers permit short edge caching.
- **Images:** this product accepts text only and has no image upload or raster assets to compress. If image uploads are added, resize and transcode them to WebP/AVIF at ingestion and deliver them through object storage plus a CDN.
- **Non-critical scripts:** the app does not load third-party analytics or other non-critical scripts. Its only entry script is a module, which the browser defers by default. Fonts are loaded from Google Fonts by CSS; remove that import or self-host fonts if you want to eliminate that external request.

## Deployment

The server serves the production Vite build and the API from one origin. A straightforward free-tier layout is a Node web service (for example Render) plus hosted PostgreSQL (for example Neon). A database URL that points to `localhost` only works on the computer running PostgreSQL and cannot be used by a public host. This repository includes `render.yaml` with the Node build/start commands and `/api/health` health check; Render will prompt for the `DATABASE_URL` secret when creating the Blueprint. Set `DATABASE_SSL` according to the hosted provider's instructions and optionally set `REDIS_URL`. A provider such as Vercel can also host the React client and Express API as functions, but requires adapting the Express entrypoint to its function routing model; the included server is intended to run as a Node web service.

For production, use a managed/shared Redis service when running multiple instances, configure TLS and secret environment variables in the hosting dashboard, and check the database provider's connection limit before scaling the web service.

## Performance checklist mapping

| Requested item | Implementation |
| --- | --- |
| Cache API response | TanStack Query for client list data; short HTTP cache headers for Explore |
| Load balancer | Stateless Express instances; deploy behind provider load balancer |
| Index database | Primary key plus partial Explore and expiry indexes |
| Compress images | No image assets/uploads in this text-only product; see implementation note above |
| Loading skeletons | Route and Explore list skeletons |
| Cache expensive queries | Short-lived Explore query cache, optionally shared through Redis |
| Avoid N+1 queries | Explore page uses one bounded SQL query, no per-row lookups |
| Debounce input | 300 ms Explore search debounce |
| Split code into chunks | Lazy-loaded pages and Vite vendor chunks |
| Add CDN | CDN-ready fingerprinted assets and cache headers; configure provider at deployment |
| Server-side caching | Express app cache with Redis or bounded memory fallback |
| Paginate large lists | Bounded page size and stable ordering |
| Compress API payloads | Express `compression` middleware |
| Minify JS and CSS | Vite production build minifies both |
| Lazy loading | React Router page components use `React.lazy` |
| Defer non-critical scripts | No third-party script; module entry is deferred by browser |
| Database connection tooling | Shared `pg.Pool`, configurable pool size, Docker Compose local services |

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `DATABASE_SSL` | Enable TLS for PostgreSQL | `false` |
| `DB_POOL_MAX` | Maximum database connections per app process (1–20) | `5` |
| `REDIS_URL` | Optional shared Redis cache | Empty (memory fallback) |
| `PORT` | HTTP port | `3000` |
| `CLIENT_ORIGIN` | Optional allowed frontend origin for cross-origin API calls | Disabled |

