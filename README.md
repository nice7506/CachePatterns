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

Each response includes metadata (`cacheHit`, `durationMs`, `cacheKey`, etc.) so you can see whether Redis served the request or Postgres did.

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
