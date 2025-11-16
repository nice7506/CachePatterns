# Cache Patterns Demo

Node.js backend that demonstrates cache-aside, write-through, and write-back patterns backed by Redis and PostgreSQL. The project ships with a Docker Compose stack so you can launch the API, cache, and database in one command and inspect how each strategy behaves under cold and warm cache scenarios.

## Stack
- Node.js 20 + Express
- PostgreSQL 15 (seeded with sample catalog data)
- Redis 7
- Docker Compose for orchestration

## One-command startup
```bash
docker compose up --build
```

The compose file builds the API image, starts Redis and Postgres, and loads `db/init.sql` into the database automatically. Once the stack is healthy you can hit the API at `http://localhost:3000`.

Stop everything with `docker compose down`.

## Dockerfile and Docker Compose

- `Dockerfile` – builds a slim production image:
  - Uses `node:20-alpine`, installs `node_modules` with `npm ci --omit=dev`, copies `src` and `db`, sets `NODE_ENV=production` and `PORT=3000`, and runs `node src/server.js`.
  - This image is what the `app` service in `docker-compose.yml` uses when you run `docker compose up --build`.
- `docker-compose.yml` – orchestrates the whole stack:
  - `app`: builds from the Dockerfile, exposes port `3000`, and injects environment variables to point at the Postgres (`database`) and Redis (`cache`) containers plus tuning options like `CACHE_ASIDE_TTL_SECONDS` and `WRITE_BACK_FLUSH_INTERVAL_MS`.
  - `cache`: runs `redis:7-alpine`, exposes `6379`, and has a health check so the app waits for Redis to be ready.
  - `database`: runs `postgres:15-alpine`, exposes `5432`, and mounts `db/init.sql` into `/docker-entrypoint-initdb.d` so the schema and seed data are loaded automatically on first start, with a health check used by `depends_on`.

## Useful endpoints
- `GET /` – quick sanity check that the API container is running.
- `GET /api/docs` – list of helper endpoints.
- `GET /api/products` – raw view of the seeded products from Postgres.
- `GET /api/cache-aside/products/:id` – fetch product using cache-aside pattern (misses warm Redis, subsequent calls hit cache).
- `PUT /api/cache-aside/products/:id` – update price via cache-aside (DB first, then cache invalidation).
- `GET /api/write-through/products/:id` – fetch product using write-through strategy (writes-through on misses).
- `PUT /api/write-through/products/:id` – update via write-through (DB + cache in one transaction boundary).
- `GET /api/write-back/products/:id` – fetch product backed by a write-back cache, including dirty-state metadata.
- `PUT /api/write-back/products/:id` – queue a write-back update (cache updates immediately, DB flushes asynchronously).
- `GET /api/compare/products/:id?iterations=5&coldStart=true` – run repeated reads against all patterns to compare hit rates and timing. Set `coldStart=false` to observe steady-state cache hits.
- `GET /api/hybrid/products/:id` – hybrid endpoint that uses cache-aside-style reads and write-through-style writes.
- `PUT /api/hybrid/products/:id` – update via hybrid strategy (DB + cached value with TTL).

Each response includes metadata (`cacheHit`, `durationMs`, `cacheKey`, etc.) so you can see whether Redis served the request or Postgres did.

## Route dry runs (flow explanation)

High-level, every route goes: `Express route` → `service` → `Postgres + Redis` → JSON response with timing + cache metadata. Below is what happens for each key endpoint when things go well.

- `GET /api/products`
  - Express handler calls `getAllProducts` in `src/repositories/productRepository.js`.
  - A single SQL query runs against Postgres and returns all rows.
  - Response is a plain array of products (no Redis or extra metadata).

- `GET /api/cache-aside/products/:id`
  - Route parses `:id` and calls `getProductCacheAside(id)`.
  - Service builds key `cache-aside:product:<id>` and checks Redis.
  - On cache hit: returns cached product with `cacheHit: true` and `durationMs` based on how fast Redis responded.
  - On cache miss: reads from Postgres; if found, writes that product into Redis with a TTL, then returns it with `cacheHit: false`.

- `PUT /api/cache-aside/products/:id`
  - Route validates `id` and `price`, then calls `updateProductCacheAside(id, price)`.
  - Service updates the product row in Postgres.
  - After DB success, it deletes the Redis key `cache-aside:product:<id>` so the next read reloads fresh data.

- `GET /api/write-through/products/:id`
  - Route parses `id` and calls `getProductWriteThrough(id)`.
  - Service checks Redis key `write-through:product:<id>`.
  - If present, returns cached product with `cacheHit: true`.
  - If missing, fetches from Postgres; response includes a `note` describing that the miss was handled by the DB (code includes an example of how you’d also populate the cache here).

- `PUT /api/write-through/products/:id`
  - Route validates `id` and numeric `price`, then calls `updateProductWriteThrough(id, price)`.
  - Service updates Postgres; if the product exists, it immediately writes the updated product into Redis under `write-through:product:<id>`.
  - Response includes `cacheUpdated: true` plus `durationMs` for the whole DB+cache write.

- `GET /api/write-back/products/:id`
  - Route parses `id` and calls `getProductWriteBack(id)`.
  - Service reads value from Redis key `write-back:product:<id>` and a separate “dirty” flag key.
  - On cache hit: returns cached product with `cacheHit: true` and `pendingWrite` set from the dirty flag, plus a `note` telling you whether Redis is ahead of Postgres.
  - On cache miss: loads from Postgres (if it exists), writes it into Redis, and returns with `pendingWrite: false`.

- `PUT /api/write-back/products/:id`
  - Route validates `id` and `price`, then calls `updateProductWriteBack(id, price)`.
  - Service either uses the cached product or loads it once from Postgres.
  - It updates the product object in Redis, sets the dirty flag key, and pushes a `{ id, price }` payload onto the Redis list queue `write-back:queue`.
  - Response shows the updated product, `pendingWrite: true`, and `queued: true` to indicate the DB update will happen asynchronously.
  - Separately, `src/workers/writeBackFlusher.js` drains the queue, applies updates to Postgres, rewrites the cache with the DB row, and clears the dirty flag.

- `GET /api/hybrid/products/:id`
  - Route parses `id` and calls `getProductHybrid(id)`.
  - Service acts like cache-aside with TTL: it checks Redis key `hybrid:product:<id>`, returns from cache if present, otherwise loads from Postgres and stores the result in Redis with a TTL.
  - Response includes a `note` explaining whether it was served from Redis or primed from the database.

- `PUT /api/hybrid/products/:id`
  - Route validates `id` and `price`, then calls `updateProductHybrid(id, price)`.
  - Service updates Postgres first, then writes the updated product into Redis under `hybrid:product:<id>` with a TTL (write-through style).
  - Response indicates whether the cache was updated and includes a `note` summarising the hybrid behaviour.

## Why caching? (system design view)

At a system design level, caching means keeping a copy of data in a faster but usually smaller storage layer (like Redis or an in‑memory map) so you do not have to hit slower or more expensive backends (like Postgres, external APIs, or disk) on every request.

**Why caches are useful**
- Reduce latency: serving from RAM/Redis is often 10–100x faster than going to a database or remote service.
- Increase throughput: offloading repeated reads from the database lets a system handle many more requests with the same hardware.
- Protect dependencies: a cache can shield downstream databases or APIs from traffic spikes (thundering herd), acting as a buffer.
- Save money: fewer calls to managed databases or third‑party APIs can reduce per‑query or per‑IO costs.

**Common downsides and risks**
- Stale data: cached values can become outdated if invalidation is wrong or delayed, leading to inconsistent views of the truth.
- Complexity: you now have to think about cache keys, TTLs, invalidation rules, and “what if cache and DB disagree?”.
- Failure modes: if the cache is down, misconfigured, or too small, the database may suddenly see a surge in traffic.
- Consistency trade‑offs: write‑back / asynchronous patterns intentionally accept “eventual consistency” between cache and database.

This project exists to show how different cache strategies navigate these trade‑offs, not to say “cache everything”. You still choose what to cache, for how long, and how important fresh data is for your use case.

## Caching patterns overview

The three strategies in this repo all use the same underlying pieces (Postgres for persistence, Redis for caching) but differ in when they read/write to cache versus database.

### Cache-aside (lazy loading)
- **Idea**: Your code talks to Redis first; on a miss it loads from Postgres and *then* fills the cache. Writes go to the database and usually just invalidate the cache.
- **Here**: Implemented in `src/services/cacheAsideService.js` and wired to `/api/cache-aside/products/:id`.
- **Read path**: Check `cache-aside:product:<id>` in Redis. If present, return it quickly. If missing, read from Postgres, store the result in Redis with a TTL, and return the DB row.
- **Write path**: Update the row in Postgres and delete the corresponding Redis key so the next read reloads fresh data.
- **Trade-offs**: Great for read-heavy workloads and data that can tolerate occasional stale reads until the next reload. Simpler mental model, but cache can briefly serve outdated values if invalidation is missed or delayed.

### Write-through
- **Idea**: Reads prefer the cache, but writes always go “through” the cache into the database so both stay in sync.
- **Here**: Implemented in `src/services/writeThroughService.js` and exposed via `/api/write-through/products/:id`.
- **Read path**: Try `write-through:product:<id>` in Redis first. On a miss, fetch from Postgres. In a typical write-through design, that result would also be written back into Redis so the next read is a hit (the service contains a commented-out example of this).
- **Write path**: Update Postgres and then write the updated product into Redis in the same request so future reads see the new value immediately.
- **Trade-offs**: Keeps cache and database tightly aligned at the cost of slightly slower writes (each write touches both systems). A good fit when read performance matters but you can’t tolerate stale cache entries.

### Write-back (write-behind)
- **Idea**: Treat Redis as the primary write target and push changes to Postgres asynchronously in the background.
- **Here**: Implemented in `src/services/writeBackService.js` with a worker in `src/workers/writeBackFlusher.js`, exposed via `/api/write-back/products/:id`.
- **Read path**: Same shape as write-through: look up `write-back:product:<id>` in Redis and lazily fetch from Postgres when missing. Responses include a `pendingWrite` flag so you can see if Redis is ahead of Postgres.
- **Write path**: Update the cached product in Redis immediately, mark it dirty, and enqueue the change in a Redis list. A background worker drains the queue on an interval, applies updates to Postgres, and clears the dirty flag.
- **Trade-offs**: Writes are very fast and reads see the latest value as soon as it hits Redis, but the database can be briefly stale until the worker flushes the queue. Best for workloads that can tolerate eventual consistency in exchange for lower write latency and better batching.

## Example comparison workflow
1. Start the stack: `docker compose up --build`.
2. Seed data is loaded automatically (look at `db/init.sql` to tweak the catalog).
3. Call `GET http://localhost:3000/api/compare/products/1?iterations=5&coldStart=true` to simulate cold cache behaviour.
4. Repeat with `coldStart=false` to observe warm cache timings and hit counts.
5. Use the specific cache-aside, write-through, or write-back endpoints to manually mutate prices and see how Redis reacts. For write-back, watch the `pendingWrite` field clear once the worker flushes to Postgres.

## Local development (optional)
If you prefer running the API without containers:
1. Copy `.env.example` to `.env` and adjust values.
2. Ensure Postgres and Redis are accessible with those settings.
3. Install dependencies `npm install` (already done if you are editing this repo).
4. Seed the database with `npm run seed`.
5. Start the API with `npm run dev`.

`npm run lint` checks code style via ESLint flat config.

## Project layout
```
├── db/init.sql            # schema + seed data executed by Postgres on first boot
├── docker-compose.yml     # one-click stack: API + Redis + Postgres
├── Dockerfile             # Node API container image
├── src/
│   ├── config/            # database + redis clients
│   ├── repositories/      # SQL queries
│   ├── routes/            # Express routers (pattern endpoints + comparator)
│   ├── services/          # cache-aside, write-through, and write-back implementations
│   ├── workers/           # background processors (write-back flush interval)
│   ├── utils/timer.js     # simple duration helper
│   └── scripts/seed.js    # optional manual seeding helper
└── README.md              # you are here
```

For deeper notes about the caching logic and response metadata, see `docs/patterns.md`.
