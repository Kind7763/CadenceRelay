import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, buildPaginatedResult } from '../utils/pagination';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id: string, label = 'ID'): void {
  if (!UUID_RE.test(id)) {
    throw new AppError(`Invalid ${label} format`, 400);
  }
}

export async function listLists(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      'SELECT * FROM contact_lists ORDER BY created_at DESC'
    );
    res.json({ lists: result.rows });
  } catch (err) {
    next(err);
  }
}

export async function getList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'list ID');
    const { page, limit, offset } = parsePagination(req.query as { page?: string; limit?: string });

    const listResult = await pool.query('SELECT * FROM contact_lists WHERE id = $1', [id]);
    if (listResult.rows.length === 0) {
      throw new AppError('List not found', 404);
    }

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM contact_list_members WHERE list_id = $1',
      [id]
    );
    const total = parseInt(countResult.rows[0].count);

    const contactsResult = await pool.query(
      `SELECT c.* FROM contacts c
       JOIN contact_list_members clm ON clm.contact_id = c.id
       WHERE clm.list_id = $1
       ORDER BY c.created_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    res.json({
      list: listResult.rows[0],
      contacts: buildPaginatedResult(contactsResult.rows, total, { page, limit, offset }),
    });
  } catch (err) {
    next(err);
  }
}

export async function createList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'INSERT INTO contact_lists (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || null]
    );
    res.status(201).json({ list: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function updateList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'list ID');
    const { name, description } = req.body;

    const result = await pool.query(
      'UPDATE contact_lists SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, description, id]
    );

    if (result.rows.length === 0) {
      throw new AppError('List not found', 404);
    }

    res.json({ list: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function deleteList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'list ID');

    // Use a transaction to handle FK constraints from campaigns.list_id
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await client.query('SELECT id FROM contact_lists WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new AppError('List not found', 404);
      }

      // Check if any non-draft campaigns reference this list
      const activeCampaigns = await client.query(
        "SELECT id, name, status FROM campaigns WHERE list_id = $1 AND status NOT IN ('draft')",
        [id]
      );
      if (activeCampaigns.rows.length > 0) {
        await client.query('ROLLBACK');
        throw new AppError(
          `Cannot delete list: ${activeCampaigns.rows.length} campaign(s) are using this list (${activeCampaigns.rows.map((c: { name: string }) => c.name).join(', ')})`,
          409
        );
      }

      // Nullify list_id in draft campaigns so the FK doesn't block deletion
      await client.query(
        "UPDATE campaigns SET list_id = NULL, updated_at = NOW() WHERE list_id = $1 AND status = 'draft'",
        [id]
      );

      // contact_list_members has ON DELETE CASCADE, so no manual cleanup needed
      await client.query('DELETE FROM contact_lists WHERE id = $1', [id]);

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ message: 'List deleted' });
  } catch (err) {
    next(err);
  }
}

export async function addContactsToList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'list ID');
    const { contactIds } = req.body;

    if (!contactIds || contactIds.length === 0) {
      throw new AppError('contactIds required', 400);
    }

    // FIX: Properly build parameterized VALUES for multiple contactIds
    // Each row needs its own pair of params: (contact_id, list_id)
    const valuesPlaceholders: string[] = [];
    const queryParams: unknown[] = [];
    let paramIdx = 1;

    for (const contactId of contactIds) {
      valuesPlaceholders.push(`($${paramIdx}, $${paramIdx + 1})`);
      queryParams.push(contactId, id);
      paramIdx += 2;
    }

    await pool.query(
      `INSERT INTO contact_list_members (contact_id, list_id) VALUES ${valuesPlaceholders.join(', ')} ON CONFLICT DO NOTHING`,
      queryParams
    );

    await pool.query(
      'UPDATE contact_lists SET contact_count = (SELECT COUNT(*) FROM contact_list_members WHERE list_id = $1), updated_at = NOW() WHERE id = $1',
      [id]
    );

    res.json({ message: `Added ${contactIds.length} contacts to list` });
  } catch (err) {
    next(err);
  }
}

export async function removeContactsFromList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'list ID');
    const { contactIds } = req.body;

    if (!contactIds || contactIds.length === 0) {
      throw new AppError('contactIds required', 400);
    }

    await pool.query(
      'DELETE FROM contact_list_members WHERE list_id = $1 AND contact_id = ANY($2)',
      [id, contactIds]
    );

    await pool.query(
      'UPDATE contact_lists SET contact_count = (SELECT COUNT(*) FROM contact_list_members WHERE list_id = $1), updated_at = NOW() WHERE id = $1',
      [id]
    );

    res.json({ message: `Removed ${contactIds.length} contacts from list` });
  } catch (err) {
    next(err);
  }
}
