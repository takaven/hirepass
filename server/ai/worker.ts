import { getAiConfig } from "./config";
import { processPendingAiReviews } from "./review";

let workerRunning = false;
let wakeTimer: NodeJS.Timeout | null = null;

export function wakeAiReviewWorker(delayMs = 0) {
  const config = getAiConfig();
  if (!config.configured) return;
  if (wakeTimer) return;
  wakeTimer = setTimeout(() => {
    wakeTimer = null;
    drainAiReviewQueue().catch(() => undefined);
  }, delayMs);
  wakeTimer.unref?.();
}

export async function drainAiReviewQueue() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    for (;;) {
      const result = await processPendingAiReviews();
      if (result.processed === 0) break;
    }
  } finally {
    workerRunning = false;
  }
}

export function startAiReviewWorker() {
  const config = getAiConfig();
  if (!config.configured) return;
  wakeAiReviewWorker(500);
  const interval = setInterval(() => wakeAiReviewWorker(), 30_000);
  interval.unref?.();
}
