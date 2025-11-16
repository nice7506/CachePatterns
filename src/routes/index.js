import { Router } from "express";
import cacheAsideRouter from "./cacheAside.js";
import writeThroughRouter from "./writeThrough.js";
import writeBackRouter from "./writeBack.js";
import { getAllProducts } from "../repositories/productRepository.js";
import { connectRedis } from "../config/redisClient.js";
import { getProductCacheAside } from "../services/cacheAsideService.js";
import { getProductWriteThrough } from "../services/writeThroughService.js";
import {
  buildWriteBackCacheKey,
  buildWriteBackDirtyKey,
  getProductWriteBack,
  flushWriteBackQueueOnce,
} from "../services/writeBackService.js";

const router = Router();

const parseId = (rawId) => {
  const id = Number.parseInt(rawId, 10);
  return Number.isNaN(id) ? null : id;
};

const clampIterations = (value) => {
  if (Number.isNaN(value) || value < 1) return 1;
  if (value > 25) return 25;
  return value;
};

const formatMs = (value = 0) =>
  Math.round(Number(value || 0) * 1000) / 1000;

const summariseRuns = (runs) => {
  if (!runs.length) {
    return {
      hits: 0,
      misses: 0,
      avgDurationMs: 0,
      fastestMs: 0,
      slowestMs: 0,
    };
  }

  const durations = runs.map((run) => Number(run.durationMs || 0));
  const hits = runs.filter((run) => run.cacheHit).length;
  const total = durations.reduce((sum, value) => sum + value, 0);

  return {
    hits,
    misses: runs.length - hits,
    avgDurationMs: formatMs(total / runs.length),
    fastestMs: formatMs(Math.min(...durations)),
    slowestMs: formatMs(Math.max(...durations)),
  };
};

router.get("/docs", (req, res) => {
  res.json({
    endpoints: {
      cacheAside: {
        read: "GET /api/cache-aside/products/:id",
        update: "PUT /api/cache-aside/products/:id",
      },
      writeThrough: {
        read: "GET /api/write-through/products/:id",
        update: "PUT /api/write-through/products/:id",
      },
      writeBack: {
        read: "GET /api/write-back/products/:id",
        update: "PUT /api/write-back/products/:id",
      },
      comparison: {
        read:
          "GET /api/compare/products/:id?iterations=5&coldStart=true|false",
      },
    },
  });
});

router.get("/products", async (req, res, next) => {
  try {
    const products = await getAllProducts();
    res.json({ products });
  } catch (error) {
    next(error);
  }
});

router.get("/compare/products/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null || id < 1) {
      return res.status(400).json({ error: "Invalid product id" });
    }

    const iterations = clampIterations(
      Number.parseInt(req.query.iterations, 10)
    );
    const coldStart = req.query.coldStart === "true";

    const redis = await connectRedis();
    const cacheAsideKey = `cache-aside:product:${id}`;
    const writeThroughKey = `write-through:product:${id}`;
    const writeBackKey = buildWriteBackCacheKey(id);
    const writeBackDirtyKey = buildWriteBackDirtyKey(id);

    if (coldStart) {
      await flushWriteBackQueueOnce();
      await redis.del(
        cacheAsideKey,
        writeThroughKey,
        writeBackKey,
        writeBackDirtyKey
      );
    }

    const cacheAsideRuns = [];
    for (let i = 0; i < iterations; i += 1) {
      if (coldStart && i > 0) {
        await redis.del(cacheAsideKey);
      }
      cacheAsideRuns.push(await getProductCacheAside(id));
    }

    const lastCacheAside = cacheAsideRuns.at(-1);
    if (!lastCacheAside?.product) {
      return res.status(404).json({ error: "Product not found", id });
    }

    if (coldStart) {
      await flushWriteBackQueueOnce();
      await redis.del(
        cacheAsideKey,
        writeThroughKey,
        writeBackKey,
        writeBackDirtyKey
      );
    }

    const writeThroughRuns = [];
    for (let i = 0; i < iterations; i += 1) {
      if (coldStart && i > 0) {
        await redis.del(writeThroughKey);
      }
      writeThroughRuns.push(await getProductWriteThrough(id));
    }

    const lastWriteThrough = writeThroughRuns.at(-1);
    if (!lastWriteThrough?.product) {
      return res.status(404).json({ error: "Product not found", id });
    }

    const writeBackRuns = [];
    for (let i = 0; i < iterations; i += 1) {
      if (coldStart && i > 0) {
        await redis.del(writeBackKey, writeBackDirtyKey);
      }
      writeBackRuns.push(await getProductWriteBack(id));
    }

    const lastWriteBack = writeBackRuns.at(-1);
    if (!lastWriteBack?.product) {
      return res.status(404).json({ error: "Product not found", id });
    }

    return res.json({
      productId: id,
      iterations,
      coldStart,
      cacheAside: {
        summary: summariseRuns(cacheAsideRuns),
        runs: cacheAsideRuns.map((run, index) => ({
          iteration: index + 1,
          cacheHit: run.cacheHit,
          durationMs: formatMs(run.durationMs),
          cacheKey: run.cacheKey,
          strategy: run.strategy,
        })),
      },
      writeThrough: {
        summary: summariseRuns(writeThroughRuns),
        runs: writeThroughRuns.map((run, index) => ({
          iteration: index + 1,
          cacheHit: run.cacheHit,
          durationMs: formatMs(run.durationMs),
          cacheKey: run.cacheKey,
          strategy: run.strategy,
          note: run.note ?? null,
        })),
      },
      writeBack: {
        summary: summariseRuns(writeBackRuns),
        runs: writeBackRuns.map((run, index) => ({
          iteration: index + 1,
          cacheHit: run.cacheHit,
          durationMs: formatMs(run.durationMs),
          cacheKey: run.cacheKey,
          strategy: run.strategy,
          pendingWrite: run.pendingWrite,
          note: run.note ?? null,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.use("/cache-aside", cacheAsideRouter);
router.use("/write-through", writeThroughRouter);
router.use("/write-back", writeBackRouter);

export default router;
