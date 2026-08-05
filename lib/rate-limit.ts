interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const inflight = new Map<string, number>();

function numericEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : fallback;
}

export function clientKey(request: Request): string {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function beginRequest(key: string): () => void {
  const now = Date.now();
  const limit = numericEnv("CHAT_RATE_LIMIT", 20, 1, 200);
  const windowMs = numericEnv("CHAT_RATE_WINDOW_MS", 300_000, 10_000, 3_600_000);
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count > limit) {
    throw Object.assign(new Error("Too many requests. Try again after the rate-limit window resets."), {
      statusCode: 429,
      code: "rate_limited",
    });
  }

  const active = inflight.get(key) ?? 0;
  if (active >= 2) {
    throw Object.assign(new Error("Too many concurrent requests from this client."), {
      statusCode: 429,
      code: "concurrency_limited",
    });
  }
  inflight.set(key, active + 1);

  return () => {
    const remaining = (inflight.get(key) ?? 1) - 1;
    if (remaining <= 0) inflight.delete(key);
    else inflight.set(key, remaining);
    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) if (value.resetAt <= Date.now()) buckets.delete(bucketKey);
    }
  };
}
