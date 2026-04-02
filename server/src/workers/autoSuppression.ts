import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { updateEngagementScore } from '../utils/engagementScore';

/**
 * Auto-Suppression Worker
 * Runs every 10 minutes. Finds bounced/complained emails not yet in the suppression list
 * and auto-adds them. Also updates engagement scores for newly suppressed contacts.
 */
export async function runAutoSuppression(): Promise<void> {
  try {
    // 1. Find permanently bounced emails not in suppression list
    const bouncedResult = await pool.query(
      `SELECT DISTINCT cr.email
       FROM campaign_recipients cr
       WHERE cr.status = 'bounced'
       AND LOWER(cr.email) NOT IN (SELECT LOWER(email) FROM suppression_list)
       LIMIT 500`
    );

    // 2. Find complained emails not in suppression list
    const complainedResult = await pool.query(
      `SELECT DISTINCT cr.email
       FROM campaign_recipients cr
       WHERE cr.status = 'complained'
       AND LOWER(cr.email) NOT IN (SELECT LOWER(email) FROM suppression_list)
       LIMIT 500`
    );

    // 3. Find contacts marked as bounced/complained not in suppression list
    const contactResult = await pool.query(
      `SELECT DISTINCT c.email
       FROM contacts c
       WHERE c.status IN ('bounced', 'complained')
       AND LOWER(c.email) NOT IN (SELECT LOWER(email) FROM suppression_list)
       LIMIT 500`
    );

    // Merge all unique emails
    const emailSet = new Set<string>();
    const reasonMap = new Map<string, string>();

    for (const row of bouncedResult.rows) {
      emailSet.add(row.email.toLowerCase());
      reasonMap.set(row.email.toLowerCase(), 'auto_bounce');
    }
    for (const row of complainedResult.rows) {
      emailSet.add(row.email.toLowerCase());
      reasonMap.set(row.email.toLowerCase(), 'auto_complaint');
    }
    for (const row of contactResult.rows) {
      emailSet.add(row.email.toLowerCase());
      if (!reasonMap.has(row.email.toLowerCase())) {
        reasonMap.set(row.email.toLowerCase(), 'auto_contact_status');
      }
    }

    if (emailSet.size === 0) return;

    // 4. Bulk insert into suppression list
    const emails = Array.from(emailSet);
    let suppressedCount = 0;

    // Batch insert in groups of 100
    for (let i = 0; i < emails.length; i += 100) {
      const batch = emails.slice(i, i + 100);
      const values: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      for (const email of batch) {
        values.push(`($${idx}, $${idx + 1}, 'auto')`);
        params.push(email, reasonMap.get(email) || 'auto_bounce');
        idx += 2;
      }

      const result = await pool.query(
        `INSERT INTO suppression_list (email, reason, added_by)
         VALUES ${values.join(', ')}
         ON CONFLICT DO NOTHING`,
        params
      );

      suppressedCount += result.rowCount || 0;
    }

    // 5. Update engagement scores for newly suppressed contacts
    for (const email of emails) {
      const reason = reasonMap.get(email);
      if (reason === 'auto_complaint') {
        updateEngagementScore(email, 'complained').catch(() => {});
      } else {
        updateEngagementScore(email, 'bounced').catch(() => {});
      }
    }

    // 6. Also mark contacts as bounced if they aren't already
    await pool.query(
      `UPDATE contacts SET status = 'bounced', updated_at = NOW()
       WHERE LOWER(email) = ANY($1)
       AND status = 'active'`,
      [emails]
    );

    if (suppressedCount > 0) {
      logger.info(`Auto-suppression: added ${suppressedCount} emails to suppression list`, {
        total: emails.length,
        newlySuppressed: suppressedCount,
      });
    }
  } catch (err) {
    logger.error('Auto-suppression error', { error: (err as Error).message });
  }
}
