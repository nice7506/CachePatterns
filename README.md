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
