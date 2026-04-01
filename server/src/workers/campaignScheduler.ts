import { pool } from '../config/database';
import { campaignDispatchQueue } from '../queues/emailQueue';
import { logger } from '../utils/logger';
import { checkDailyLimit } from '../utils/dailyLimits';

export async function checkScheduledCampaigns(): Promise<void> {
  try {
    const result = await pool.query(
      "SELECT id FROM campaigns WHERE status = 'scheduled' AND scheduled_at <= NOW()"
    );

    for (const row of result.rows) {
      logger.info(`Triggering scheduled campaign ${row.id}`);
      await pool.query(
        "UPDATE campaigns SET status = 'sending', started_at = NOW(), updated_at = NOW() WHERE id = $1",
        [row.id]
      );
      await campaignDispatchQueue.add('dispatch', { campaignId: row.id });
    }

    if (result.rows.length > 0) {
      logger.info(`Triggered ${result.rows.length} scheduled campaigns`);
    }

    // Auto-resume campaigns paused due to daily send limits (new day = new quota)
    const pausedResult = await pool.query(
      "SELECT id, provider FROM campaigns WHERE status = 'paused' AND pause_reason LIKE 'Daily%'"
    );

    for (const row of pausedResult.rows) {
      const limitCheck = await checkDailyLimit(row.provider);
      if (limitCheck.allowed) {
        logger.info(`Resuming daily-limit-paused campaign ${row.id} (${row.provider}: ${limitCheck.current}/${limitCheck.limit})`);
        await pool.query(
          "UPDATE campaigns SET status = 'sending', pause_reason = NULL, updated_at = NOW() WHERE id = $1",
          [row.id]
        );
        await campaignDispatchQueue.add('dispatch', { campaignId: row.id });
      }
    }
  } catch (error) {
    logger.error('Scheduler error', { error: (error as Error).message });
  }
}
