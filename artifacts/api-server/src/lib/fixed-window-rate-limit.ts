interface FixedWindowRateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  maxEntries?: number;
}

interface RequestWindow {
  startedAt: number;
  count: number;
}

export function createFixedWindowRateLimiter({
  windowMs,
  maxRequests,
  maxEntries = 5000,
}: FixedWindowRateLimiterOptions) {
  if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
    throw new RangeError("windowMs must be a positive integer");
  }
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1) {
    throw new RangeError("maxRequests must be a positive integer");
  }
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new RangeError("maxEntries must be a positive integer");
  }

  const windows = new Map<string, RequestWindow>();

  return {
    take(key: string, now = Date.now()): boolean {
      for (const [existingKey, window] of windows) {
        if (now - window.startedAt >= windowMs) windows.delete(existingKey);
      }

      const current = windows.get(key);
      if (current) {
        if (current.count >= maxRequests) return false;
        current.count += 1;
        return true;
      }

      // Reject new identities rather than evicting active limits under key churn.
      if (windows.size >= maxEntries) return false;
      windows.set(key, { startedAt: now, count: 1 });
      return true;
    },
  };
}

export function buildRateLimitKey(
  userId: string | null | undefined,
  ip: string | null | undefined,
): string {
  const normalizedUserId = userId?.trim();
  if (normalizedUserId) return `user:${normalizedUserId}`;

  const normalizedIp = ip?.trim();
  return `ip:${normalizedIp || "shared-preview"}`;
}
