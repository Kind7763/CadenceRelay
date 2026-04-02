import { redis } from '../config/redis';
import { pool } from '../config/database';
import { SESClient, GetSendQuotaCommand } from '@aws-sdk/client-ses';
import { decryptCredential, isEncrypted } from './crypto';
import { logger } from './logger';

function getRedisKey(provider: string): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
  return `daily-send:${provider}:${dateStr}`;
}

function maybeDecryptValue(value: string): string {
  if (!value) return value;
  let current = value;
  for (let i = 0; i < 5; i++) {
    if (!isEncrypted(current)) break;
    const decrypted = decryptCredential(current);
    if (decrypted === null) break;
    current = decrypted;
  }
  return current;
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

// ─── SES Quota Auto-Sync ──────────────────────────────────────────────────────

let lastSesQuotaSyncMs = 0;
const SES_QUOTA_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour cache

/**
 * Sync SES sending quota to the ses_daily_limit setting.
 * Caches for 1 hour — safe to call every 60 seconds from the worker.
 */
export async function syncSesQuotaToSettings(): Promise<void> {
  const now = Date.now();
  if (now - lastSesQuotaSyncMs < SES_QUOTA_SYNC_INTERVAL_MS) return;

  try {
    const sesResult = await pool.query("SELECT value FROM settings WHERE key = 'ses_config'");
    const sesConfig = sesResult.rows[0]?.value;
    if (!sesConfig) return; // SES not configured, skip

    const parsed = typeof sesConfig === 'string' ? JSON.parse(sesConfig) : sesConfig;
    if (!parsed.region || !parsed.accessKeyId || !parsed.secretAccessKey) return;

    const client = new SESClient({
      region: parsed.region,
      credentials: {
        accessKeyId: maybeDecryptValue(parsed.accessKeyId),
        secretAccessKey: maybeDecryptValue(parsed.secretAccessKey),
      },
    });

    const quotaResp = await client.send(new GetSendQuotaCommand({}));
    const max24HourSend = quotaResp.Max24HourSend || 0;
    if (max24HourSend <= 0) return;

    // Set daily limit to 95% of SES quota (safety buffer)
    const newLimit = Math.floor(max24HourSend * 0.95);

    const exists = await pool.query("SELECT 1 FROM settings WHERE key = 'ses_daily_limit'");
    if (exists.rows.length > 0) {
      await pool.query("UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'ses_daily_limit'", [JSON.stringify(newLimit)]);
    } else {
      await pool.query("INSERT INTO settings (key, value) VALUES ('ses_daily_limit', $1)", [JSON.stringify(newLimit)]);
    }

    lastSesQuotaSyncMs = now;
    logger.info('SES quota synced to daily limit', { max24HourSend, newLimit });
  } catch (err) {
    // Don't crash the worker — just log and try again later
    logger.warn('Failed to sync SES quota', { error: (err as Error).message });
    // Still update the timestamp so we don't spam the API on errors
    lastSesQuotaSyncMs = now;
  }
}
