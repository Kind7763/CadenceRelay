import { redis } from '../config/redis';
import { pool } from '../config/database';

function getRedisKey(provider: string): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
  return `daily-send:${provider}:${dateStr}`;
}

export async function incrementDailySend(provider: string): Promise<number> {
  const key = getRedisKey(provider);
  const count = await redis.incr(key);
  // Expire after 48 hours so keys auto-clean
  await redis.expire(key, 172800);
  return count;
}

export async function getDailyCount(provider: string): Promise<number> {
  const key = getRedisKey(provider);
  const val = await redis.get(key);
  return val ? parseInt(val, 10) : 0;
}

export async function getDailyLimit(provider: string): Promise<number> {
  const key = `${provider}_daily_limit`;
  const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  if (result.rows.length === 0) {
    // Sensible defaults
    return provider === 'gmail' ? 500 : 50000;
  }
  const raw = result.rows[0].value;
  // pg returns jsonb — could be number or string
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    try {
      return parseInt(JSON.parse(raw), 10) || (provider === 'gmail' ? 500 : 50000);
    } catch {
      return parseInt(raw, 10) || (provider === 'gmail' ? 500 : 50000);
    }
  }
  return provider === 'gmail' ? 500 : 50000;
}

export async function checkDailyLimit(provider: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const [current, limit] = await Promise.all([getDailyCount(provider), getDailyLimit(provider)]);
  return { allowed: current < limit, current, limit };
}
