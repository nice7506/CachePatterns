import { flushWriteBackQueueOnce } from "../services/writeBackService.js";

const FLUSH_INTERVAL_MS = Number(
  process.env.WRITE_BACK_FLUSH_INTERVAL_MS || 5000
);

let intervalId = null;
let flushing = false;

const flushSafely = async () => {
  if (flushing) {
    return;
  }

  flushing = true;
  try {
    await flushWriteBackQueueOnce();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("write-back worker: flush failure", error);
  } finally {
    flushing = false;
  }
};

export const startWriteBackWorker = () => {
  if (intervalId || FLUSH_INTERVAL_MS <= 0) {
    return;
  }

  // Kick off an immediate flush to drain any backlog.
  flushSafely();

  intervalId = setInterval(() => {
    flushSafely();
  }, FLUSH_INTERVAL_MS);
};
