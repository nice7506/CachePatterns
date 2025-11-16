import { connectRedis } from "../config/redisClient.js";
import {
  getProductById,
  updateProductPrice,
} from "../repositories/productRepository.js";
import { startTimer } from "../utils/timer.js";

const HYBRID_CACHE_TTL_SECONDS = Number(
  process.env.HYBRID_CACHE_TTL_SECONDS ||
    process.env.CACHE_ASIDE_TTL_SECONDS ||
    60
);

const buildCacheKey = (id) => `hybrid:product:${id}`;

export const getProductHybrid = async (id) => {
  const stopTimer = startTimer();
  const redis = await connectRedis();
  const cacheKey = buildCacheKey(id);
  const cached = await redis.get(cacheKey);

  if (cached) {
    const durationMs = stopTimer();
    return {
      product: JSON.parse(cached),
      cacheHit: true,
      cacheKey,
      durationMs,
      strategy: "hybrid-cache-aside-write-through",
      note: "Served from Redis (hybrid cache).",
    };
  }

  const product = await getProductById(id);
  if (!product) {
    const durationMs = stopTimer();
    return {
      product: null,
      cacheHit: false,
      cacheKey,
      durationMs,
      strategy: "hybrid-cache-aside-write-through",
      note: "Product not found in database.",
    };
  }

  await redis.set(cacheKey, JSON.stringify(product), {
    EX: HYBRID_CACHE_TTL_SECONDS,
  });

  const durationMs = stopTimer();
  return {
    product,
    cacheHit: false,
    cacheKey,
    durationMs,
    strategy: "hybrid-cache-aside-write-through",
    note: "Loaded from database and cached with TTL.",
  };
};

export const updateProductHybrid = async (id, nextPrice) => {
  const stopTimer = startTimer();
  const product = await updateProductPrice(id, nextPrice);
  const durationMs = stopTimer();

  const cacheKey = buildCacheKey(id);

  if (!product) {
    return {
      product: null,
      cacheKey,
      cacheUpdated: false,
      durationMs,
      strategy: "hybrid-cache-aside-write-through",
      note: "Product not found; cache left unchanged.",
    };
  }

  const redis = await connectRedis();

  await redis.set(cacheKey, JSON.stringify(product), {
    EX: HYBRID_CACHE_TTL_SECONDS,
  });

  return {
    product,
    cacheKey,
    cacheUpdated: true,
    durationMs,
    strategy: "hybrid-cache-aside-write-through",
    note: "Database and cache updated together (write-through) with TTL.",
  };
};

