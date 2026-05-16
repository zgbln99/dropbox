import { getDb } from './db';

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets (only meaningful when blocked). */
  retryAfter: number;
}

interface CountRow {
  count: number;
}

/**
 * Fixed-window per-key rate limiter backed by SQLite.
 *
 * There is exactly one row per key: each new window resets that row in place,
 * so storage is bounded by the number of distinct clients seen recently. The
 * counter update and read happen in a single atomic statement.
 */
export function rateLimit(key: string, limit: number, windowSec: number): RateLimitResult {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSec);

  const row = db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count)
       VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start = excluded.window_start THEN count + 1 ELSE 1 END,
         window_start = excluded.window_start
       RETURNING count`,
    )
    .get(key, windowStart) as CountRow;

  // Occasionally prune rows from past windows so the table cannot grow without
  // bound as new IPs appear over time.
  if (Math.random() < 0.02) {
    db.prepare('DELETE FROM rate_limits WHERE window_start < ?').run(windowStart);
  }

  if (row.count > limit) {
    return { allowed: false, retryAfter: windowStart + windowSec - now };
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * Extract the client IP, honouring the reverse proxy's forwarding headers.
 * Falls back to a constant when no IP can be determined (all such clients
 * then share a single rate-limit bucket).
 */
export function getClientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return headers.get('x-real-ip') || 'unknown';
}
