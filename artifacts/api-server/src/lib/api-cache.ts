import { apiCacheTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getCachedResponse(key: string): Promise<unknown | null> {
  const [row] = await db
    .select()
    .from(apiCacheTable)
    .where(eq(apiCacheTable.cacheKey, key));

  if (!row || Date.now() - row.cachedAt.getTime() > CACHE_TTL_MS) {
    return null;
  }

  return row.responseData;
}

export async function setCachedResponse(
  key: string,
  response: unknown,
): Promise<void> {
  await db
    .insert(apiCacheTable)
    .values({ cacheKey: key, responseData: response, cachedAt: new Date() })
    .onConflictDoUpdate({
      target: apiCacheTable.cacheKey,
      set: { responseData: response, cachedAt: new Date() },
    });
}
