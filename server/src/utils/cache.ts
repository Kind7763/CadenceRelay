import { redis } from '../config/redis';
import { logger } from './logger';

const DEFAULT_TTL = 60; // 60 seconds

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const cached = await redis.get(`cr:${key}`);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    logger.warn('Cache get error', { key, error: (err as Error).message });
  }
  return null;
}

export async function cacheSet(key: string, value: unknown, ttl = DEFAULT_TTL): Promise<void> {
  try {
    await redis.set(`cr:${key}`, JSON.stringify(value), 'EX', ttl);
  } catch (err) {
    logger.warn('Cache set error', { key, error: (err as Error).message });
  }
}

export async function cacheDel(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(`cr:${pattern}`);
    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    logger.warn('Cache del error', { pattern, error: (err as Error).message });
  }
}

/**
 * Cache-through helper: returns cached value or calls fn() and caches the result
 */
export async function cacheThrough<T>(key: string, fn: () => Promise<T>, ttl = DEFAULT_TTL): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;
  const result = await fn();
  await cacheSet(key, result, ttl);
  return result;
}
