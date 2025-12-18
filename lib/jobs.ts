import crypto from "crypto";

type Job = {
  id: string;
  type: string;
  payload: Record<string, any>;
  attempts: number;
  maxAttempts: number;
  runAt: number;
};

const queue: Job[] = [];

export function enqueueJob(type: string, payload: Record<string, any>, delayMs = 0, maxAttempts = 3) {
  queue.push({
    id: crypto.randomUUID(),
    type,
    payload,
    attempts: 0,
    maxAttempts,
    runAt: Date.now() + delayMs,
  });
}

async function processJob(job: Job) {
  job.attempts += 1;
  // Placeholder handlers; extend as needed
  if (job.type === "send-notification") {
    // handled by notification system
  }
}

export async function runJobLoop() {
  const now = Date.now();
  const ready = queue.filter((job) => job.runAt <= now);
  for (const job of ready) {
    try {
      await processJob(job);
      queue.splice(queue.indexOf(job), 1);
    } catch (err) {
      if (job.attempts >= job.maxAttempts) {
        queue.splice(queue.indexOf(job), 1);
      } else {
        job.runAt = Date.now() + 30_000; // retry later
      }
    }
  }
}
