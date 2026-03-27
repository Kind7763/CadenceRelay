import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AppError } from '../middleware/errorHandler';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id: string, label = 'ID'): void {
  if (!UUID_RE.test(id)) {
    throw new AppError(`Invalid ${label} format`, 400);
  }
}

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function getDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to } = req.query;
    let dateFilter = '';
    const params: unknown[] = [];

    // FIX: Validate date params
    if (from) {
      const fromDate = new Date(from as string);
      if (isNaN(fromDate.getTime())) {
        throw new AppError('Invalid "from" date parameter', 400);
      }
      params.push(from);
      dateFilter += ` AND c.created_at >= $${params.length}`;
    }
    if (to) {
      const toDate = new Date(to as string);
      if (isNaN(toDate.getTime())) {
        throw new AppError('Invalid "to" date parameter', 400);
      }
      params.push(to);
      dateFilter += ` AND c.created_at <= $${params.length}`;
    }

    // Aggregate stats
    const statsResult = await pool.query(
      `SELECT
        COALESCE(SUM(c.sent_count), 0) as total_sent,
        COALESCE(SUM(c.bounce_count), 0) as total_bounced,
        COALESCE(SUM(c.open_count), 0) as total_opens,
        COALESCE(SUM(c.click_count), 0) as total_clicks,
        COALESCE(SUM(c.complaint_count), 0) as total_complaints,
        COALESCE(SUM(c.failed_count), 0) as total_failed,
        COALESCE(SUM(c.unsubscribe_count), 0) as total_unsubscribes,
        COUNT(*) as total_campaigns
       FROM campaigns c
       WHERE 1=1 ${dateFilter}`,
      params
    );

    const rawStats = statsResult.rows[0];

    // FIX: Parse string values from postgres SUM/COALESCE to numbers
    const stats = {
      total_sent: Number(rawStats.total_sent),
      total_bounced: Number(rawStats.total_bounced),
      total_opens: Number(rawStats.total_opens),
      total_clicks: Number(rawStats.total_clicks),
      total_complaints: Number(rawStats.total_complaints),
      total_failed: Number(rawStats.total_failed),
      total_unsubscribes: Number(rawStats.total_unsubscribes),
      total_campaigns: Number(rawStats.total_campaigns),
    };

    const openRate = stats.total_sent > 0 ? ((stats.total_opens / stats.total_sent) * 100).toFixed(1) : '0';
    const clickRate = stats.total_sent > 0 ? ((stats.total_clicks / stats.total_sent) * 100).toFixed(1) : '0';
    const bounceRate = stats.total_sent > 0 ? ((stats.total_bounced / stats.total_sent) * 100).toFixed(1) : '0';

    // Send volume per day (last 30 days)
    const volumeResult = await pool.query(
      `SELECT
        DATE(ee.created_at) as date,
        COUNT(*) FILTER (WHERE ee.event_type = 'sent') as sent,
        COUNT(*) FILTER (WHERE ee.event_type = 'opened') as opened,
        COUNT(*) FILTER (WHERE ee.event_type = 'clicked') as clicked,
        COUNT(*) FILTER (WHERE ee.event_type = 'bounced') as bounced
       FROM email_events ee
       WHERE ee.created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(ee.created_at)
       ORDER BY date`
    );

    // Recent campaigns
    const recentResult = await pool.query(
      `SELECT c.id, c.name, c.status, c.sent_count, c.open_count, c.click_count, c.bounce_count, c.total_recipients, c.created_at
       FROM campaigns c
       ORDER BY c.created_at DESC
       LIMIT 10`
    );

    // Contact stats
    const contactStats = await pool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'bounced') as bounced,
        COUNT(*) FILTER (WHERE status = 'complained') as complained,
        COUNT(*) FILTER (WHERE status = 'unsubscribed') as unsubscribed
       FROM contacts`
    );

    res.json({
      stats: {
        ...stats,
        open_rate: openRate,
        click_rate: clickRate,
        bounce_rate: bounceRate,
      },
      volume: volumeResult.rows,
      recentCampaigns: recentResult.rows,
      contactStats: contactStats.rows[0],
    });
  } catch (err) {
    next(err);
  }
}

export async function getCampaignAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');

    // Time series events for this campaign
    const events = await pool.query(
      `SELECT
        DATE_TRUNC('hour', created_at) as time_bucket,
        event_type,
        COUNT(*) as count
       FROM email_events
       WHERE campaign_id = $1
       GROUP BY time_bucket, event_type
       ORDER BY time_bucket`,
      [id]
    );

    // Status breakdown
    const statusBreakdown = await pool.query(
      `SELECT status, COUNT(*) as count
       FROM campaign_recipients
       WHERE campaign_id = $1
       GROUP BY status`,
      [id]
    );

    res.json({
      timeSeries: events.rows,
      statusBreakdown: statusBreakdown.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get detailed event history for a specific campaign recipient
 * Shows every open/click with timestamp, IP, user agent
 */
export async function getRecipientEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { recipientId } = req.params;
    validateUUID(recipientId, 'recipient ID');

    const events = await pool.query(
      `SELECT id, event_type, metadata, ip_address, user_agent, created_at
       FROM email_events
       WHERE campaign_recipient_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [recipientId]
    );

    // Also get the recipient summary
    const recipient = await pool.query(
      `SELECT cr.*, c.name as contact_name, c.email as contact_email
       FROM campaign_recipients cr
       LEFT JOIN contacts c ON c.id = cr.contact_id
       WHERE cr.id = $1`,
      [recipientId]
    );

    res.json({
      recipient: recipient.rows[0] || null,
      events: events.rows,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get detailed engagement analytics for a specific contact across all campaigns
 */
export async function getContactAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { contactId } = req.params;
    validateUUID(contactId, 'contact ID');

    // Per-campaign breakdown with open/click counts
    const campaigns = await pool.query(
      `SELECT cr.id as recipient_id, cr.campaign_id, cam.name as campaign_name,
        cr.status, cr.sent_at, cr.opened_at, cr.clicked_at, cr.bounced_at,
        COALESCE(cr.open_count, 0) as open_count, COALESCE(cr.click_count, 0) as click_count,
        cr.last_opened_at, cr.last_clicked_at, cr.error_message
       FROM campaign_recipients cr
       JOIN campaigns cam ON cam.id = cr.campaign_id
       WHERE cr.contact_id = $1
       ORDER BY cr.sent_at DESC NULLS LAST`,
      [contactId]
    );

    // Aggregate stats
    const stats = await pool.query(
      `SELECT
        COUNT(*) as total_campaigns,
        COUNT(*) FILTER (WHERE cr.status = 'sent' OR cr.status = 'delivered' OR cr.status = 'opened' OR cr.status = 'clicked') as delivered,
        COUNT(*) FILTER (WHERE cr.opened_at IS NOT NULL) as opened,
        COUNT(*) FILTER (WHERE cr.clicked_at IS NOT NULL) as clicked,
        COUNT(*) FILTER (WHERE cr.status = 'bounced') as bounced,
        COUNT(*) FILTER (WHERE cr.status = 'failed') as failed,
        SUM(COALESCE(cr.open_count, 0)) as total_opens,
        SUM(COALESCE(cr.click_count, 0)) as total_clicks
       FROM campaign_recipients cr
       WHERE cr.contact_id = $1`,
      [contactId]
    );

    // Recent events timeline
    const events = await pool.query(
      `SELECT ee.event_type, ee.metadata, ee.ip_address, ee.user_agent, ee.created_at,
        cam.name as campaign_name
       FROM email_events ee
       JOIN campaign_recipients cr ON cr.id = ee.campaign_recipient_id
       JOIN campaigns cam ON cam.id = ee.campaign_id
       WHERE cr.contact_id = $1
       ORDER BY ee.created_at DESC
       LIMIT 100`,
      [contactId]
    );

    res.json({
      campaigns: campaigns.rows,
      stats: stats.rows[0],
      events: events.rows,
    });
  } catch (err) {
    next(err);
  }
}

export async function exportAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to } = req.query;
    let dateFilter = '';
    const params: unknown[] = [];

    if (from) {
      params.push(from);
      dateFilter += ` AND c.created_at >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      dateFilter += ` AND c.created_at <= $${params.length}`;
    }

    const result = await pool.query(
      `SELECT c.name, c.status, c.provider, c.total_recipients, c.sent_count, c.failed_count,
        c.bounce_count, c.open_count, c.click_count, c.complaint_count, c.unsubscribe_count,
        c.started_at, c.completed_at, c.created_at
       FROM campaigns c
       WHERE 1=1 ${dateFilter}
       ORDER BY c.created_at DESC`,
      params
    );

    const header = 'name,status,provider,total_recipients,sent,failed,bounced,opens,clicks,complaints,unsubscribes,started_at,completed_at,created_at\n';
    const rows = result.rows.map((r) =>
      `${escapeCSV(r.name)},${escapeCSV(r.status)},${escapeCSV(r.provider)},${r.total_recipients},${r.sent_count},${r.failed_count},${r.bounce_count},${r.open_count},${r.click_count},${r.complaint_count},${r.unsubscribe_count},${r.started_at || ''},${r.completed_at || ''},${r.created_at}`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
    res.send(header + rows);
  } catch (err) {
    next(err);
  }
}
