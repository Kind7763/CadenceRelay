import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { loadScoringConfig } from '../utils/engagementScore';

export async function runEngagementDecay(): Promise<void> {
  try {
    const config = await loadScoringConfig();
    const decayValue = config.decay_per_week ?? -5;

    const result = await pool.query(
      `UPDATE contacts
       SET engagement_score = GREATEST(0, COALESCE(engagement_score, 50) + $1), updated_at = NOW()
       WHERE status = 'active'
         AND last_sent_at < NOW() - INTERVAL '30 days'
         AND COALESCE(engagement_score, 50) > 0`,
      [decayValue]
    );

    const decayed = result.rowCount ?? 0;
    if (decayed > 0) {
      logger.info(`Engagement decay: ${decayed} contacts decayed by ${decayValue}`);
    } else {
      logger.debug('Engagement decay: no contacts to decay');
    }
  } catch (err) {
    logger.error('Engagement decay error', { error: (err as Error).message });
  }
}
