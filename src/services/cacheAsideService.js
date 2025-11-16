import { connectRedis } from "../config/redisClient.js";
import {
  getProductById,
  updateProductPrice,
} from "../repositories/productRepository.js";
import { startTimer } from "../utils/timer.js";

const CACHE_TTL_SECONDS = Number(
  process.env.CACHE_ASIDE_TTL_SECONDS || 60
);

const buildCacheKey = (id) => `cache-aside:product:${id}`;

export const getProductCacheAside = async (id) => {
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
      strategy: "cache-aside",
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
      strategy: "cache-aside",
    };
  }

  await redis.set(cacheKey, JSON.stringify(product), {
    EX: CACHE_TTL_SECONDS,
  });

  const durationMs = stopTimer();
  return {
    product,
    cacheHit: false,
    cacheKey,
    durationMs,
    strategy: "cache-aside",
  };
};

export const updateProductCacheAside = async (id, nextPrice) => {
  const stopTimer = startTimer();
  const product = await updateProductPrice(id, nextPrice);
  const durationMs = stopTimer();

  const redis = await connectRedis();
  const cacheKey = buildCacheKey(id);
  await redis.del(cacheKey);

  return {
    product,
    cacheInvalidated: true,
    cacheKey,
    durationMs,
    strategy: "cache-aside",
  };
};
