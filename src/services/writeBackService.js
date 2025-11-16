import { connectRedis } from "../config/redisClient.js";
import {
  getProductById,
  updateProductPrice,
} from "../repositories/productRepository.js";
import { startTimer } from "../utils/timer.js";

export const WRITE_BACK_QUEUE_KEY = "write-back:queue";
const CACHE_PREFIX = "write-back:product";
const DIRTY_PREFIX = "write-back:dirty";

const buildCacheKey = (id) => `${CACHE_PREFIX}:${id}`;
const buildDirtyKey = (id) => `${DIRTY_PREFIX}:${id}`;

export const buildWriteBackCacheKey = buildCacheKey;
export const buildWriteBackDirtyKey = buildDirtyKey;

const readDirtyFlag = async (redis, id) => {
  const dirtyKey = buildDirtyKey(id);
  const dirty = await redis.get(dirtyKey);
  return { dirty: Boolean(dirty), dirtyKey };
};

const writeDirtyFlag = async (redis, id) => {
  const dirtyKey = buildDirtyKey(id);
  await redis.set(dirtyKey, "1");
  return dirtyKey;
};

export const clearDirtyFlag = async (redis, id) => {
  const dirtyKey = buildDirtyKey(id);
  await redis.del(dirtyKey);
};

export const getProductWriteBack = async (id) => {
  const stopTimer = startTimer();
  const redis = await connectRedis();
  const cacheKey = buildCacheKey(id);
  const cached = await redis.get(cacheKey);
  const { dirty } = await readDirtyFlag(redis, id);

  if (cached) {
    const durationMs = stopTimer();
    return {
      product: JSON.parse(cached),
      cacheHit: true,
      pendingWrite: dirty,
      cacheKey,
      dirtyKey: buildDirtyKey(id),
      durationMs,
      strategy: "write-back",
      note: dirty
        ? "Value is pending flush to the database."
        : "Cache entry is in sync with database.",
    };
  }

  const product = await getProductById(id);
  if (!product) {
    const durationMs = stopTimer();
    return {
      product: null,
      cacheHit: false,
      pendingWrite: false,
      cacheKey,
      dirtyKey: buildDirtyKey(id),
      durationMs,
      strategy: "write-back",
    };
  }

  await redis.set(cacheKey, JSON.stringify(product));

  const durationMs = stopTimer();
  return {
    product,
    cacheHit: false,
    pendingWrite: false,
    cacheKey,
    dirtyKey: buildDirtyKey(id),
    durationMs,
    strategy: "write-back",
    note: "Loaded from database and primed cache.",
  };
};

export const updateProductWriteBack = async (id, nextPrice) => {
  const stopTimer = startTimer();
  const redis = await connectRedis();
  const cacheKey = buildCacheKey(id);

  const cached = await redis.get(cacheKey);
  let product = cached ? JSON.parse(cached) : null;

  if (!product) {
    product = await getProductById(id);
    if (!product) {
      const durationMs = stopTimer();
      return {
        product: null,
        cacheKey,
        pendingWrite: false,
        queued: false,
        durationMs,
        strategy: "write-back",
      };
    }
  }

  const updatedProduct = {
    ...product,
    price: Number(nextPrice),
  };

  await redis.set(cacheKey, JSON.stringify(updatedProduct));
  await writeDirtyFlag(redis, id);
  await redis.rPush(
    WRITE_BACK_QUEUE_KEY,
    JSON.stringify({ id, price: Number(nextPrice) })
  );

  const durationMs = stopTimer();
  return {
    product: updatedProduct,
    cacheKey,
    pendingWrite: true,
    queued: true,
    durationMs,
    strategy: "write-back",
    note: "Update queued for asynchronous flush to the database.",
  };
};

export const flushWriteBackQueueOnce = async () => {
  const redis = await connectRedis();
  const flushed = [];

  let payload = await redis.lPop(WRITE_BACK_QUEUE_KEY);

  while (payload) {

    try {
      const parsed = JSON.parse(payload);
      const id = Number(parsed.id);
      const price = Number(parsed.price);

      if (!Number.isInteger(id) || Number.isNaN(price)) {
        // eslint-disable-next-line no-console
        console.warn(
          "write-back worker: ignoring malformed payload",
          payload
        );
        continue;
      }

      const updated = await updateProductPrice(id, price);
      if (updated) {
        await redis.set(buildCacheKey(id), JSON.stringify(updated));
        await clearDirtyFlag(redis, id);
        flushed.push({ id, price, persisted: true });
      } else {
        await redis.del(buildCacheKey(id));
        await clearDirtyFlag(redis, id);
        flushed.push({ id, price, persisted: false });
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("write-back worker: failed to process payload", error);
    }
    payload = await redis.lPop(WRITE_BACK_QUEUE_KEY);
  }

  return flushed;
};
