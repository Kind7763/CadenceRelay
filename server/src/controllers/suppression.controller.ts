import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AppError } from '../middleware/errorHandler';

/**
 * Check if an email is on the suppression list.
 * Exported as a utility for use in the email send worker.
 */
export async function isEmailSuppressed(email: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM suppression_list WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return result.rows.length > 0;
}

export async function listSuppressed(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 25));
    const search = (req.query.search as string) || '';
    const offset = (page - 1) * limit;

    let whereClause = '';
    const params: unknown[] = [];

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      whereClause = ` WHERE LOWER(email) LIKE $${params.length}`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM suppression_list${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const offsetParam = params.length;

    const result = await pool.query(
      `SELECT id, email, reason, added_by, created_at FROM suppression_list${whereClause} ORDER BY created_at DESC LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );

    res.json({
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

export async function addToSuppression(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, reason } = req.body;
    if (!email) throw new AppError('Email is required', 400);

    await pool.query(
      "INSERT INTO suppression_list (email, reason, added_by) VALUES ($1, $2, 'manual') ON CONFLICT (LOWER(email)) DO NOTHING",
      [email.trim().toLowerCase(), reason || 'manual']
    );

    res.json({ message: `${email} added to suppression list` });
  } catch (err) {
    next(err);
  }
}

export async function bulkAddToSuppression(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { emails, reason } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) {
      throw new AppError('emails array is required', 400);
    }

    let added = 0;
    for (const rawEmail of emails) {
      const email = String(rawEmail).trim().toLowerCase();
      if (!email || !email.includes('@')) continue;
      const result = await pool.query(
        "INSERT INTO suppression_list (email, reason, added_by) VALUES ($1, $2, 'manual') ON CONFLICT (LOWER(email)) DO NOTHING RETURNING id",
        [email, reason || 'manual']
      );
      if (result.rows.length > 0) added++;
    }

    res.json({ message: `${added} emails added to suppression list`, added });
  } catch (err) {
    next(err);
  }
}

export async function removeFromSuppression(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM suppression_list WHERE id = $1 RETURNING email', [id]);
    if (result.rows.length === 0) {
      throw new AppError('Suppression entry not found', 404);
    }
    res.json({ message: `${result.rows[0].email} removed from suppression list` });
  } catch (err) {
    next(err);
  }
}

export async function getSuppressionCount(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM suppression_list');
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    next(err);
  }
}
