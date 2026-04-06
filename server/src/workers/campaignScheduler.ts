import { pool } from '../config/database';
import { redis } from '../config/redis';
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
      "SELECT id, provider, email_account_id FROM campaigns WHERE status = 'paused' AND pause_reason LIKE 'Daily%'"
    );

    for (const row of pausedResult.rows) {
      const limitCheck = await checkDailyLimit(row.provider, row.email_account_id || undefined);
      if (limitCheck.allowed) {
        logger.info(`Resuming daily-limit-paused campaign ${row.id} (${row.provider}: ${limitCheck.current}/${limitCheck.limit})`);
        await pool.query(
          "UPDATE campaigns SET status = 'sending', pause_reason = NULL, updated_at = NOW() WHERE id = $1",
          [row.id]
        );
        await campaignDispatchQueue.add('dispatch', { campaignId: row.id });
      }
    }

    // Auto-resume campaigns paused due to hourly throttle (new hour = counter resets)
    const hourlyPausedResult = await pool.query(
      "SELECT id FROM campaigns WHERE status = 'paused' AND pause_reason LIKE 'Hourly%'"
    );

    for (const row of hourlyPausedResult.rows) {
      // Hourly rate-limit keys use Math.floor(Date.now() / 3600000), so they reset every hour.
      // The key has a 2-hour TTL, but checking if current hour count is 0 means we're in a fresh window.
      const currentHourKey = `rate-limit-hour:${row.id}:${Math.floor(Date.now() / 3600000)}`;
      const currentCount = await redis.get(currentHourKey);
      if (!currentCount || parseInt(currentCount) === 0) {
        logger.info(`Resuming hourly-throttle-paused campaign ${row.id} (new hour window)`);
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
