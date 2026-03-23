import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { verifyAdminPassword } from '../utils/adminAuth';

export async function clearHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { type, adminPassword } = req.body;
    await verifyAdminPassword(adminPassword);

    if (!['campaigns', 'contacts', 'all'].includes(type)) {
      throw new AppError('type must be one of: campaigns, contacts, all', 400);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (type === 'campaigns' || type === 'all') {
        // email_events and campaign_recipients cascade from campaigns
        await client.query('DELETE FROM email_events');
        await client.query('DELETE FROM campaign_recipients');
        await client.query('DELETE FROM unsubscribes');
        await client.query('DELETE FROM campaigns');
      }

      if (type === 'contacts' || type === 'all') {
        // Nullify contact references in campaign_recipients first
        await client.query('UPDATE campaign_recipients SET contact_id = NULL WHERE contact_id IS NOT NULL');
        // contact_list_members cascade from contacts
        await client.query('DELETE FROM contacts');
        // Reset list counts
        await client.query('UPDATE contact_lists SET contact_count = 0, updated_at = NOW()');
      }

      await client.query('COMMIT');
      res.json({ message: `Successfully cleared ${type} history` });
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}
