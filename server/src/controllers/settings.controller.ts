import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export async function getSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query('SELECT key, value FROM settings ORDER BY key');
    const settings: Record<string, unknown> = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }
    res.json({ settings });
  } catch (err) {
    next(err);
  }
}

export async function updateProvider(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { provider } = req.body;
    if (!['gmail', 'ses'].includes(provider)) {
      throw new AppError('Provider must be "gmail" or "ses"', 400);
    }

    await pool.query(
      'UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2',
      [JSON.stringify(provider), 'email_provider']
    );

    res.json({ message: 'Provider updated', provider });
  } catch (err) {
    next(err);
  }
}

export async function updateGmailConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { host, port, user, pass } = req.body;
    const config = { host: host || 'smtp.gmail.com', port: port || 587, user, pass };

    await pool.query(
      'UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2',
      [JSON.stringify(config), 'gmail_config']
    );

    res.json({ message: 'Gmail config updated' });
  } catch (err) {
    next(err);
  }
}

export async function updateSesConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { region, accessKeyId, secretAccessKey, fromEmail } = req.body;
    const config = { region, accessKeyId, secretAccessKey, fromEmail };

    await pool.query(
      'UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2',
      [JSON.stringify(config), 'ses_config']
    );

    res.json({ message: 'SES config updated' });
  } catch (err) {
    next(err);
  }
}

export async function updateThrottleDefaults(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { perSecond, perHour } = req.body;
    const config = { perSecond, perHour };

    await pool.query(
      'UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2',
      [JSON.stringify(config), 'throttle_defaults']
    );

    res.json({ message: 'Throttle defaults updated' });
  } catch (err) {
    next(err);
  }
}

export async function testEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { to } = req.body;
    if (!to) {
      throw new AppError('Recipient email required', 400);
    }

    // Get current provider
    const providerResult = await pool.query("SELECT value FROM settings WHERE key = 'email_provider'");
    const provider = providerResult.rows[0]?.value || 'ses';

    // Get provider config
    const configKey = provider === 'gmail' ? 'gmail_config' : 'ses_config';
    const configResult = await pool.query('SELECT value FROM settings WHERE key = $1', [configKey]);
    const providerConfig = configResult.rows[0]?.value;

    // Import and use provider factory
    const { createProvider } = await import('../services/email/providerFactory');
    const emailProvider = createProvider(provider, providerConfig);

    await emailProvider.send({
      to,
      subject: 'Test Email from BulkMailer',
      html: '<h1>Test Email</h1><p>If you received this, your email provider is configured correctly.</p>',
      text: 'Test Email - If you received this, your email provider is configured correctly.',
    });

    res.json({ message: `Test email sent to ${to} via ${provider}` });
  } catch (err) {
    next(err);
  }
}
