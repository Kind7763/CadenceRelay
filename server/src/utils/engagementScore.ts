import { pool } from '../config/database';
import { logger } from './logger';

interface ScoringConfig {
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  unsubscribed: number;
  decay_per_week: number;
}

let cachedConfig: ScoringConfig | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 60 seconds

async function loadScoringConfig(): Promise<ScoringConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTime < CACHE_TTL) {
    return cachedConfig;
  }
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'engagement_scoring'");
    if (result.rows.length > 0) {
      const raw = result.rows[0].value;
      cachedConfig = typeof raw === 'string' ? JSON.parse(raw) : raw;
      cacheTime = now;
      return cachedConfig!;
    }
  } catch (err) {
    logger.error('Failed to load engagement scoring config', { error: (err as Error).message });
  }
  // Default fallback
  cachedConfig = { opened: 3, clicked: 5, bounced: -15, complained: -30, unsubscribed: -50, decay_per_week: -5 };
  cacheTime = now;
  return cachedConfig;
}

export async function updateEngagementScore(email: string, event: string): Promise<void> {
  try {
    const config = await loadScoringConfig();

    if (event === 'unsubscribed') {
      await pool.query(
        "UPDATE contacts SET engagement_score = 0, updated_at = NOW() WHERE email = $1",
        [email]
      );
      return;
    }

    const delta = (config as unknown as Record<string, number>)[event];
    if (delta == null) {
      logger.warn('Unknown engagement event', { event });
      return;
    }

    await pool.query(
      "UPDATE contacts SET engagement_score = GREATEST(0, LEAST(100, COALESCE(engagement_score, 50) + $1)), updated_at = NOW() WHERE email = $2",
      [delta, email]
    );
  } catch (err) {
    // Non-critical: log and continue, don't break the tracking flow
    logger.error('Failed to update engagement score', { email, event, error: (err as Error).message });
  }
}

export { loadScoringConfig, ScoringConfig };
