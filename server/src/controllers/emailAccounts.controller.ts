import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { encryptCredential } from '../utils/crypto';
import { createProvider } from '../services/email/providerFactory';

const SENSITIVE_KEYS = ['pass', 'password', 'secretAccessKey', 'accessKeyId'];

/** Mask sensitive values in config for API responses */
function maskConfig(config: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...config };
  for (const key of SENSITIVE_KEYS) {
    if (masked[key] && typeof masked[key] === 'string' && (masked[key] as string).length > 0) {
      const val = masked[key] as string;
      masked[key] = val.length > 4 ? `****${val.slice(-4)}` : '****';
    }
  }
  return masked;
}

/** Check if a string looks like a masked value from the frontend */
function isMasked(val: unknown): boolean {
  return typeof val === 'string' && val.startsWith('****');
}

/** Encrypt sensitive fields in config, preserving masked (unchanged) values */
function encryptConfig(
  newConfig: Record<string, unknown>,
  existingConfig: Record<string, unknown> = {}
): Record<string, unknown> {
  const result = { ...newConfig };
  for (const key of SENSITIVE_KEYS) {
    const val = result[key];
    if (!val || isMasked(val)) {
      // Keep existing encrypted value
      result[key] = existingConfig[key] || '';
    } else if (typeof val === 'string' && val.length > 0) {
      result[key] = encryptCredential(val);
    }
  }
  return result;
}

export async function listEmailAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT id, label, provider_type, config, daily_limit, is_active, created_at, updated_at FROM email_accounts ORDER BY created_at'
    );
    const accounts = result.rows.map((row) => ({
      ...row,
      config: maskConfig(typeof row.config === 'string' ? JSON.parse(row.config) : row.config),
    }));
    res.json({ accounts });
  } catch (err) {
    next(err);
  }
}

export async function getEmailAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM email_accounts WHERE id = $1', [id]);
    if (result.rows.length === 0) throw new AppError('Email account not found', 404);
    const row = result.rows[0];
    res.json({
      account: { ...row, config: maskConfig(typeof row.config === 'string' ? JSON.parse(row.config) : row.config) },
    });
  } catch (err) {
    next(err);
  }
}

export async function createEmailAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { label, providerType, config, dailyLimit } = req.body;
    if (!label || !providerType || !config) {
      throw new AppError('label, providerType, and config are required', 400);
    }
    if (!['gmail', 'ses'].includes(providerType)) {
      throw new AppError('providerType must be gmail or ses', 400);
    }

    const encryptedConfig = encryptConfig(config);

    const result = await pool.query(
      `INSERT INTO email_accounts (label, provider_type, config, daily_limit)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [label.trim(), providerType, JSON.stringify(encryptedConfig), dailyLimit || (providerType === 'gmail' ? 500 : 50000)]
    );

    const row = result.rows[0];
    res.status(201).json({
      account: { ...row, config: maskConfig(typeof row.config === 'string' ? JSON.parse(row.config) : row.config) },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateEmailAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { label, config, dailyLimit, isActive } = req.body;

    const existing = await pool.query('SELECT * FROM email_accounts WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError('Email account not found', 404);

    const existingConfig = typeof existing.rows[0].config === 'string'
      ? JSON.parse(existing.rows[0].config) : existing.rows[0].config;

    // Encrypt only the new fields, then merge into existing config (partial update support)
    const encryptedNewFields = config ? encryptConfig(config, existingConfig) : {};
    const finalConfig = config ? { ...existingConfig, ...encryptedNewFields } : existingConfig;

    const result = await pool.query(
      `UPDATE email_accounts SET
        label = COALESCE($1, label),
        config = $2,
        daily_limit = COALESCE($3, daily_limit),
        is_active = COALESCE($4, is_active),
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [label?.trim(), JSON.stringify(finalConfig), dailyLimit, isActive, id]
    );

    const row = result.rows[0];
    res.json({
      account: { ...row, config: maskConfig(typeof row.config === 'string' ? JSON.parse(row.config) : row.config) },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteEmailAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;

    // Refuse if campaigns are actively using this account
    const activeCampaigns = await pool.query(
      "SELECT id, name FROM campaigns WHERE email_account_id = $1 AND status IN ('sending', 'scheduled', 'paused')",
      [id]
    );
    if (activeCampaigns.rows.length > 0) {
      throw new AppError(
        `Cannot delete: ${activeCampaigns.rows.length} active campaign(s) use this account`,
        409
      );
    }

    const result = await pool.query('DELETE FROM email_accounts WHERE id = $1 RETURNING label', [id]);
    if (result.rows.length === 0) throw new AppError('Email account not found', 404);

    res.json({ message: `Account "${result.rows[0].label}" deleted` });
  } catch (err) {
    next(err);
  }
}

export async function testEmailAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const { to } = req.body;

    const result = await pool.query('SELECT * FROM email_accounts WHERE id = $1', [id]);
    if (result.rows.length === 0) throw new AppError('Email account not found', 404);

    const account = result.rows[0];
    const config = typeof account.config === 'string' ? JSON.parse(account.config) : account.config;

    const provider = createProvider(account.provider_type, config);
    const connected = await provider.verifyConnection();
    if (!connected) {
      throw new AppError('Connection failed — check credentials', 400);
    }

    if (to) {
      await provider.send({
        to,
        subject: `Test from CadenceRelay — ${account.label}`,
        html: `<p>This is a test email from your CadenceRelay email account <strong>"${account.label}"</strong>.</p><p>If you received this, the account is configured correctly.</p>`,
      });
    }

    res.json({ message: 'Connection successful', connected: true });
  } catch (err) {
    next(err);
  }
}
