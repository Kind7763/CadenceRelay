import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { eventProcessingQueue } from '../queues/emailQueue';

export async function handleSnsWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const messageType = req.headers['x-amz-sns-message-type'];

    // Handle subscription confirmation
    if (messageType === 'SubscriptionConfirmation') {
      const { SubscribeURL } = req.body;
      logger.info('SNS subscription confirmation received', { url: SubscribeURL });
      // Auto-confirm by fetching the URL
      try {
        const https = await import('https');
        https.get(SubscribeURL);
        logger.info('SNS subscription confirmed');
      } catch (err) {
        logger.error('Failed to confirm SNS subscription', { error: (err as Error).message });
      }
      res.status(200).send('OK');
      return;
    }

    // Handle notification
    if (messageType === 'Notification') {
      const message = JSON.parse(req.body.Message || '{}');
      const notificationType = message.notificationType;

      logger.info('SNS notification received', { type: notificationType });

      // Enqueue for processing
      await eventProcessingQueue.add('process-sns', {
        notificationType,
        message,
      });

      res.status(200).send('OK');
      return;
    }

    res.status(200).send('OK');
  } catch (err) {
    next(err);
  }
}

// Process SNS events (called from worker)
export async function processSnsEvent(notificationType: string, message: Record<string, unknown>): Promise<void> {
  const mail = message.mail as { messageId?: string } | undefined;
  if (!mail?.messageId) {
    logger.warn('SNS event missing messageId', { type: notificationType });
    return;
  }

  const messageId = mail.messageId;

  // Find campaign recipient by provider_message_id
  const result = await pool.query(
    'SELECT id, campaign_id, email FROM campaign_recipients WHERE provider_message_id = $1',
    [messageId]
  );

  if (result.rows.length === 0) {
    logger.warn('SNS event for unknown messageId', { messageId });
    return;
  }

  const { id: recipientId, campaign_id: campaignId, email } = result.rows[0];

  switch (notificationType) {
    case 'Bounce': {
      const bounce = message.bounce as { bounceType?: string; bouncedRecipients?: Array<{ diagnosticCode?: string }> } | undefined;
      const bounceType = bounce?.bounceType || 'unknown';
      const diagnosticCode = bounce?.bouncedRecipients?.[0]?.diagnosticCode || '';

      await pool.query(
        "UPDATE campaign_recipients SET status = 'bounced', bounced_at = NOW(), error_message = $1 WHERE id = $2",
        [`${bounceType}: ${diagnosticCode}`, recipientId]
      );
      await pool.query(
        "INSERT INTO email_events (campaign_recipient_id, campaign_id, event_type, metadata) VALUES ($1, $2, 'bounced', $3)",
        [recipientId, campaignId, JSON.stringify({ bounceType, diagnosticCode })]
      );
      await pool.query(
        'UPDATE campaigns SET bounce_count = bounce_count + 1, updated_at = NOW() WHERE id = $1',
        [campaignId]
      );

      // Mark contact as bounced on hard bounce
      if (bounceType === 'Permanent') {
        await pool.query(
          "UPDATE contacts SET status = 'bounced', bounce_count = bounce_count + 1, updated_at = NOW() WHERE email = $1",
          [email]
        );
      }
      break;
    }

    case 'Complaint': {
      await pool.query(
        "UPDATE campaign_recipients SET status = 'complained' WHERE id = $1",
        [recipientId]
      );
      await pool.query(
        "INSERT INTO email_events (campaign_recipient_id, campaign_id, event_type) VALUES ($1, $2, 'complained')",
        [recipientId, campaignId]
      );
      await pool.query(
        'UPDATE campaigns SET complaint_count = complaint_count + 1, updated_at = NOW() WHERE id = $1',
        [campaignId]
      );
      await pool.query(
        "UPDATE contacts SET status = 'complained', updated_at = NOW() WHERE email = $1",
        [email]
      );
      break;
    }

    case 'Delivery': {
      await pool.query(
        "UPDATE campaign_recipients SET status = 'delivered', delivered_at = NOW() WHERE id = $1",
        [recipientId]
      );
      await pool.query(
        "INSERT INTO email_events (campaign_recipient_id, campaign_id, event_type) VALUES ($1, $2, 'delivered')",
        [recipientId, campaignId]
      );
      break;
    }

    default:
      logger.info('Unknown SNS notification type', { type: notificationType });
  }
}
