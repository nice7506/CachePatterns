import { connectRedis } from "../config/redisClient.js";
import {
  getProductById,
  updateProductPrice,
} from "../repositories/productRepository.js";
import { startTimer } from "../utils/timer.js";

const buildCacheKey = (id) => `write-through:product:${id}`;

export const getProductWriteThrough = async (id) => {
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
      strategy: "write-through",
    };
  }

  const product = await getProductById(id);

  // if (product) {
  //   await redis.set(cacheKey, JSON.stringify(product));
  // }

  const durationMs = stopTimer();
  return {
    product,
    cacheHit: Boolean(cached),
    cacheKey,
    durationMs,
    strategy: "write-through",
    note: product
      ? "Cache miss handled by writing to cache for next request."
      : "Product not found.",
  };
};

export const updateProductWriteThrough = async (id, nextPrice) => {
  const stopTimer = startTimer();
  const product = await updateProductPrice(id, nextPrice);
  const durationMs = stopTimer();

  if (!product) {
    return {
      product: null,
      cacheKey: buildCacheKey(id),
      cacheUpdated: false,
      durationMs,
      strategy: "write-through",
    };
  }

  const redis = await connectRedis();
  const cacheKey = buildCacheKey(id);
  await redis.set(cacheKey, JSON.stringify(product));

  return {
    product,
    cacheKey,
    cacheUpdated: true,
    durationMs,
    strategy: "write-through",
  };
};
