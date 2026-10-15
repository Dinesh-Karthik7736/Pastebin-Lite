import Redis from 'ioredis';

const memory = new Map();
let redis;

if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => Math.min(attempt * 250, 3000)
  });
  redis.on('error', (error) => console.warn('Redis cache unavailable; using memory cache:', error.message));
  redis.connect().catch(() => {});
}

export async function cacheGet(key) {
  if (redis?.status === 'ready') {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch { /* Use local fallback when Redis is unavailable. */ }
  }
  const item = memory.get(key);
  if (!item || item.expiresAt <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return item.value;
}

export async function cacheSet(key, value, ttlSeconds = 30) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  memory.set(key, { value, expiresAt });
  if (memory.size > 500) {
    for (const [candidate, item] of memory) if (item.expiresAt <= Date.now()) memory.delete(candidate);
    while (memory.size > 500) memory.delete(memory.keys().next().value);
  }
  if (redis?.status === 'ready') {
    try { await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds); } catch { /* Cache is best effort. */ }
  }
}

export async function cacheDeleteByPrefix(prefix) {
  for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);
  if (redis?.status === 'ready') {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = next;
        if (keys.length) await redis.del(...keys);
      } while (cursor !== '0');
    } catch { /* Cache invalidation is best effort; TTL bounds stale data. */ }
  }
}
