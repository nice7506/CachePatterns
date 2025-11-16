# Cache pattern walkthrough

This document complements the README with a closer look at how each caching strategy is implemented and how to experiment with them.

## Cache-aside (a.k.a. lazy loading)
- **Read path**
  1. Express handler calls `getProductCacheAside` (see `src/services/cacheAsideService.js`).
  2. The service checks Redis for `cache-aside:product:<id>`.
  3. On a miss it hits Postgres via `productRepository`, writes the fresh payload back to Redis with a TTL (`CACHE_ASIDE_TTL_SECONDS`, default 30s), and returns the DB payload.
  4. Subsequent requests within the TTL are served from Redis.
- **Write path**
  - Updates go to Postgres first (`UPDATE products ...`).
  - The service immediately invalidates the relevant Redis entry so the next read reloads from Postgres.

This mirrors classic production cache-aside flows where caches are only populated on demand and invalidated on change.

## Write-through
- **Read path**
  - The service looks up `write-through:product:<id>` in Redis.
  - Misses fall back to Postgres, but the result is written straight back to Redis so the next request hits the cache.
- **Write path**
  - The service updates Postgres and writes the new value into Redis in the same call. The cache is always hot once data exists.

Because writes always update Redis, write-through guarantees cache and DB consistency at the cost of slightly slower writes.

## Write-back (a.k.a. write-behind)
- **Read path**
  - Identical to write-through: the service (`getProductWriteBack`, `src/services/writeBackService.js`) first checks Redis for `write-back:product:<id>` and lazily loads Postgres when needed.
  - Cache responses include a `pendingWrite` flag so you can see if the value waiting in Redis is newer than Postgres.
- **Write path**
  - The service updates Redis immediately, marks the key as dirty, and enqueues the change (`write-back:queue`).
  - A background worker (`src/workers/writeBackFlusher.js`) drains the queue every `WRITE_BACK_FLUSH_INTERVAL_MS` milliseconds (5s by default), persists the update to Postgres, and clears the dirty flag while refreshing the cache with the canonical DB row.

This mirrors production write-back setups where the cache absorbs write latency and the database is updated asynchronously. It demonstrates the trade-off: faster writes and instant cached reads, but a window where Postgres is stale.

## `/api/compare/products/:id`
The comparison endpoint runs all three strategies repeatedly so you can see hit/miss counts and timings in one response. Useful query parameters:

- `iterations` (default `5`, max `25`): how many sequential reads to run per strategy.
- `coldStart=true|false` (default `false`): whether to flush the Redis keys before each strategy run to simulate cache-cold access.

Example response:

```json
{
  "productId": 1,
  "iterations": 5,
  "coldStart": true,
  "cacheAside": {
    "summary": {
      "hits": 4,
      "misses": 1,
      "avgDurationMs": 1.24,
      "fastestMs": 0.33,
      "slowestMs": 4.91
    },
    "runs": [
      {"iteration": 1, "cacheHit": false, "durationMs": 4.91},
      {"iteration": 2, "cacheHit": true,  "durationMs": 0.41},
      ...
    ]
  },
  "writeThrough": {
    "summary": {
      "hits": 5,
      "misses": 0,
      "avgDurationMs": 0.67,
      "fastestMs": 0.28,
      "slowestMs": 1.72
    },
    ...
  },
  "writeBack": {
    "summary": {
      "hits": 5,
      "misses": 0,
      "avgDurationMs": 0.61,
      "fastestMs": 0.25,
      "slowestMs": 1.34
    },
    "runs": [
      {"iteration": 1, "cacheHit": false, "pendingWrite": false, "durationMs": 1.34},
      {"iteration": 2, "cacheHit": true,  "pendingWrite": false, "durationMs": 0.29},
      ...
    ]
  }
}
```

Use this endpoint for quick experiments or to baseline latency between the three approaches under cold/warm cache conditions. When running with `coldStart=true` the API clears Redis keys and drains the write-back queue before each strategy to simulate a cold cache.

## Modifying the dataset
Update `db/init.sql` to tweak products or add more test data. Rebuilding the stack wipes the Postgres volume and reruns the script, so your changes appear automatically the next time you execute `docker compose up --build`.
