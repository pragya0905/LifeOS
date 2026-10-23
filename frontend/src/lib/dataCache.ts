// Stale-while-revalidate persistence for Today's data: write the last successful response
// for a resource to localStorage, keyed by user id, so a reload can paint something real
// instantly instead of a skeleton — then the caller always still fires a background refetch.
// Never call writeCache with a failed or partial response; the whole point is that whatever
// is on disk is the last *known-good* snapshot.
const CACHE_PREFIX = "lifeos_cache_v1";
const OWNER_KEY = "lifeos_cache_owner";

function cacheKey(userId: string, resourceKey: string): string {
  return `${CACHE_PREFIX}:${userId}:${resourceKey}`;
}

export function readCache<T>(userId: string, resourceKey: string): T | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId, resourceKey));
    if (!raw) return null;
    return (JSON.parse(raw) as { data: T }).data;
  } catch {
    return null;
  }
}

export function writeCache<T>(userId: string, resourceKey: string, data: T): void {
  try {
    localStorage.setItem(cacheKey(userId, resourceKey), JSON.stringify({ data, savedAt: Date.now() }));
  } catch {
    // Storage full or unavailable (private browsing, quota) — best-effort only, the app
    // still works from the network, it just won't paint instantly next load.
  }
}

export function clearUserCache(userId: string): void {
  const prefix = `${CACHE_PREFIX}:${userId}:`;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) localStorage.removeItem(k);
  }
}

// The service worker's offline copy of API reads (see sw.ts). Keyed by URL, not user, so it is
// cleared with the rest on sign-out and when another user takes the device.
const API_READS_CACHE = "lifeos-api-reads";
function clearApiReadsCache(): void {
  if (typeof caches === "undefined") return;
  caches.delete(API_READS_CACHE).catch(() => {});
}

export function clearAllCache(): void {
  clearApiReadsCache();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
  }
  try {
    localStorage.removeItem(OWNER_KEY);
  } catch {
    // best-effort
  }
}

// Call whenever a confirmed-current user id becomes known (app boot, sign-in). This cache
// holds health, cycle and money data — if the id on disk belongs to a different user than
// the one now signed in (a device shared between accounts, or a stale leftover from a
// previous session), wipe everything before any page reads from it.
export function ensureCacheOwner(userId: string): void {
  try {
    const owner = localStorage.getItem(OWNER_KEY);
    if (owner === userId) return;
    if (owner) clearUserCache(owner);
    clearApiReadsCache();
    localStorage.setItem(OWNER_KEY, userId);
  } catch {
    // best-effort
  }
}
