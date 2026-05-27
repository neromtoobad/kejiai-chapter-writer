/**
 * KejiAI — minimal in-process rate limiter.
 *
 * Token-bucket per `key` with a fixed window. Defaults are tuned for a
 * public free deploy where each /api/generate call burns Claude tokens.
 *
 * ⚠ Caveat: this is in-memory only. On Vercel each cold serverless instance
 *   has its own counter, so the effective ceiling is roughly
 *   `limit × concurrent_instances`. For low-to-moderate traffic that's
 *   acceptable for v1. For higher traffic, swap the buckets Map for an
 *   Upstash Redis / Vercel KV-backed store — the `rateLimit()` signature
 *   stays the same.
 */

import { RATE_LIMITS } from "./constants";

interface Bucket {
  count: number;
  /** Epoch ms when this bucket's window expires and resets. */
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitConfig {
  /** Maximum requests in the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  /** How many requests remain in the current window after this check. */
  remaining: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
  /** The cap that was applied. */
  limit: number;
}

/**
 * Returns the rate limit decision for `key`. Counts the current call against
 * the bucket when `ok` is true; rejected calls do not consume budget.
 */
export function rateLimit(
  key: string,
  config: RateLimitConfig = RATE_LIMITS.generate,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + config.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      ok: true,
      remaining: Math.max(0, config.limit - 1),
      resetAt,
      limit: config.limit,
    };
  }
  if (existing.count >= config.limit) {
    return {
      ok: false,
      remaining: 0,
      resetAt: existing.resetAt,
      limit: config.limit,
    };
  }
  existing.count += 1;
  return {
    ok: true,
    remaining: config.limit - existing.count,
    resetAt: existing.resetAt,
    limit: config.limit,
  };
}

/**
 * Best-effort client IP from the headers reverse proxies set. Vercel and
 * most CDNs populate `x-forwarded-for` with the original client first.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/** "47 minutes" / "12 seconds" — for the user-facing 429 body. */
export function formatRetryAfter(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} second${s === 1 ? "" : "s"}`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.ceil(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

// -- internal cleanup --------------------------------------------------------

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    buckets.forEach((v, k) => {
      if (v.resetAt <= now) buckets.delete(k);
    });
  }, 60_000);
  // Don't keep the Node process alive just for our cleanup tick.
  (cleanupTimer as { unref?: () => void }).unref?.();
}
startCleanup();

// -- test hook ---------------------------------------------------------------

/** Reset all buckets. Test-only — do not call from app code. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}
