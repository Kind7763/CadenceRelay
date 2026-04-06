import { redis } from '../config/redis';
import { pool } from '../config/database';
import { SESClient, GetSendQuotaCommand } from '@aws-sdk/client-ses';
import { decryptCredential, isEncrypted } from './crypto';
import { logger } from './logger';

function getRedisKey(provider: string, accountId?: string): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD in UTC
  if (accountId) {
    return `daily-send:account:${accountId}:${dateStr}`;
  }
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

export async function incrementDailySend(provider: string, accountId?: string): Promise<number> {
  const key = getRedisKey(provider, accountId);
  const count = await redis.incr(key);
  // Expire after 48 hours so keys auto-clean
  await redis.expire(key, 172800);
  return count;
}

export async function getDailyCount(provider: string, accountId?: string): Promise<number> {
  const key = getRedisKey(provider, accountId);
  const val = await redis.get(key);
  return val ? parseInt(val, 10) : 0;
}

export async function getDailyLimit(provider: string, accountId?: string): Promise<number> {
  // Per-account limit from email_accounts table
  if (accountId) {
    const result = await pool.query('SELECT daily_limit FROM email_accounts WHERE id = $1', [accountId]);
    if (result.rows.length > 0 && result.rows[0].daily_limit) {
      return result.rows[0].daily_limit;
    }
    // Fall through to provider defaults
  }

  // Legacy: from settings table
  const key = `${provider}_daily_limit`;
  const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  if (result.rows.length === 0) {
    return provider === 'gmail' ? 500 : 50000;
  }
  const raw = result.rows[0].value;
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

/**
 * Get real SES sent count from AWS (cached 60s in Redis to avoid hammering the API)
 */
async function getSesSentFromAWS(): Promise<number | null> {
  const cacheKey = 'ses-sent-24h-cache';
  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null) return parseInt(cached, 10);

    const sesResult = await pool.query("SELECT value FROM settings WHERE key = 'ses_config'");
    const sesConfig = sesResult.rows[0]?.value;
    if (!sesConfig) return null;

    const parsed = typeof sesConfig === 'string' ? JSON.parse(sesConfig) : sesConfig;
    if (!parsed.region || !parsed.accessKeyId || !parsed.secretAccessKey) return null;

    const client = new SESClient({
      region: parsed.region,
      credentials: {
        accessKeyId: maybeDecryptValue(parsed.accessKeyId),
        secretAccessKey: maybeDecryptValue(parsed.secretAccessKey),
      },
    });

    const quota = await client.send(new GetSendQuotaCommand({}));
    const sent = Math.floor(quota.SentLast24Hours || 0);
    await redis.set(cacheKey, String(sent), 'EX', 60);
    return sent;
  } catch {
    return null;
  }
}

export async function checkDailyLimit(provider: string, accountId?: string): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limit = await getDailyLimit(provider, accountId);

  // For SES without account: try to get real sent count from AWS first
  if (provider === 'ses' && !accountId) {
    const awsSent = await getSesSentFromAWS();
    if (awsSent !== null) {
      return { allowed: awsSent < limit, current: awsSent, limit };
    }
  }

  // Use local Redis counter (works for both legacy and per-account)
  const current = await getDailyCount(provider, accountId);
  return { allowed: current < limit, current, limit };
}

// ─── SES Quota Auto-Sync ──────────────────────────────────────────────────────

let lastSesQuotaSyncMs = 0;
const SES_QUOTA_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour cache

export async function syncSesQuotaToSettings(): Promise<void> {
  const now = Date.now();
  if (now - lastSesQuotaSyncMs < SES_QUOTA_SYNC_INTERVAL_MS) return;

  try {
    const sesResult = await pool.query("SELECT value FROM settings WHERE key = 'ses_config'");
    const sesConfig = sesResult.rows[0]?.value;
    if (!sesConfig) return;

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
    logger.warn('Failed to sync SES quota', { error: (err as Error).message });
    lastSesQuotaSyncMs = now;
  }
}
