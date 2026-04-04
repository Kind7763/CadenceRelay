import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, buildPaginatedResult } from '../utils/pagination';
import { verifyAdminPassword } from '../utils/adminAuth';
import { cacheThrough, cacheDel } from '../utils/cache';
import { fireAutomationTrigger } from '../workers/automationProcessor';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import fs from 'fs';
import readline from 'readline';

// Validate UUID format to avoid Postgres "invalid input syntax for type uuid" 500 errors
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id: string, label = 'ID'): void {
  if (!UUID_RE.test(id)) {
    throw new AppError(`Invalid ${label} format`, 400);
  }
}

// Safe column mapping for sorting — prevents SQL injection
const SORT_COLUMN_MAP: Record<string, string> = {
  email: 'c.email',
  name: 'c.name',
  status: 'c.status',
  send_count: 'c.send_count',
  created_at: 'c.created_at',
  state: 'c.state',
  district: 'c.district',
  engagement_score: 'c.engagement_score',
  health_status: 'c.health_status',
};

/**
 * Shared WHERE clause builder — used by listContacts, bulkSuppressFiltered, bulkDeleteFiltered.
 * Accepts filter params (from req.query or req.body.filters) and returns { whereClause, params, paramIndex }.
 */
interface ContactFilterParams {
  search?: string;
  status?: string;
  listId?: string;
  minSendCount?: string;
  maxSendCount?: string;
  state?: string;
  district?: string;
  block?: string;
  category?: string;
  management?: string;
  engagement_min?: string;
  engagement_max?: string;
  health_status?: string;
}

async function buildContactWhereClause(filters: ContactFilterParams): Promise<{ whereClause: string; params: unknown[]; paramIndex: number }> {
  let whereClause = 'WHERE 1=1';
  const params: unknown[] = [];
  let paramIndex = 1;

  const { search, status, listId, minSendCount, maxSendCount, state, district, block, category, management, engagement_min, engagement_max, health_status } = filters;

  if (search) {
    whereClause += ` AND (c.email ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }
  if (status) {
    whereClause += ` AND c.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }
  if (listId) {
    const listResult = await pool.query('SELECT is_smart, filter_criteria FROM contact_lists WHERE id = $1', [listId]);
    const list = listResult.rows[0];
    if (list?.is_smart && list.filter_criteria) {
      const criteria = list.filter_criteria as Record<string, unknown>;
      if (criteria.state && Array.isArray(criteria.state) && criteria.state.length > 0) {
        whereClause += ` AND c.state = ANY($${paramIndex})`;
        params.push(criteria.state);
        paramIndex++;
      }
      if (criteria.district && Array.isArray(criteria.district) && criteria.district.length > 0) {
        whereClause += ` AND c.district = ANY($${paramIndex})`;
        params.push(criteria.district);
        paramIndex++;
      }
      if (criteria.block && Array.isArray(criteria.block) && criteria.block.length > 0) {
        whereClause += ` AND c.block = ANY($${paramIndex})`;
        params.push(criteria.block);
        paramIndex++;
      }
      if (criteria.category && Array.isArray(criteria.category) && criteria.category.length > 0) {
        whereClause += ` AND c.category = ANY($${paramIndex})`;
        params.push(criteria.category);
        paramIndex++;
      }
      if (criteria.management && Array.isArray(criteria.management) && criteria.management.length > 0) {
        whereClause += ` AND c.management = ANY($${paramIndex})`;
        params.push(criteria.management);
        paramIndex++;
      }
      if (criteria.classes_min != null) {
        whereClause += ` AND CASE WHEN c.classes ~ '^[0-9]+-[0-9]+$' THEN CAST(split_part(c.classes, '-', 2) AS integer) >= $${paramIndex} ELSE true END`;
        params.push(criteria.classes_min);
        paramIndex++;
      }
      if (criteria.classes_max != null) {
        whereClause += ` AND CASE WHEN c.classes ~ '^[0-9]+-[0-9]+$' THEN CAST(split_part(c.classes, '-', 1) AS integer) <= $${paramIndex} ELSE true END`;
        params.push(criteria.classes_max);
        paramIndex++;
      }
    } else {
      whereClause += ` AND c.id IN (SELECT contact_id FROM contact_list_members WHERE list_id = $${paramIndex})`;
      params.push(listId);
      paramIndex++;
    }
  }
  if (minSendCount) {
    whereClause += ` AND c.send_count >= $${paramIndex}`;
    params.push(parseInt(minSendCount));
    paramIndex++;
  }
  if (maxSendCount) {
    whereClause += ` AND c.send_count <= $${paramIndex}`;
    params.push(parseInt(maxSendCount));
    paramIndex++;
  }
  if (state) {
    const states = state.split(',').map(s => s.trim()).filter(Boolean);
    whereClause += ` AND c.state = ANY($${paramIndex})`;
    params.push(states);
    paramIndex++;
  }
  if (district) {
    const districts = district.split(',').map(s => s.trim()).filter(Boolean);
    whereClause += ` AND c.district = ANY($${paramIndex})`;
    params.push(districts);
    paramIndex++;
  }
  if (block) {
    const blocks = block.split(',').map(s => s.trim()).filter(Boolean);
    whereClause += ` AND c.block = ANY($${paramIndex})`;
    params.push(blocks);
    paramIndex++;
  }
  if (category) {
    const categories = category.split(',').map(s => s.trim()).filter(Boolean);
    whereClause += ` AND c.category = ANY($${paramIndex})`;
    params.push(categories);
    paramIndex++;
  }
  if (management) {
    const managements = management.split(',').map(s => s.trim()).filter(Boolean);
    whereClause += ` AND c.management = ANY($${paramIndex})`;
    params.push(managements);
    paramIndex++;
  }
  if (engagement_min) {
    whereClause += ` AND COALESCE(c.engagement_score, 50) >= $${paramIndex}`;
    params.push(parseInt(engagement_min));
    paramIndex++;
  }
  if (engagement_max) {
    whereClause += ` AND COALESCE(c.engagement_score, 50) <= $${paramIndex}`;
    params.push(parseInt(engagement_max));
    paramIndex++;
  }
  if (health_status) {
    whereClause += ` AND c.health_status = $${paramIndex}`;
    params.push(health_status);
    paramIndex++;
  }

  return { whereClause, params, paramIndex };
}

export async function listContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, offset } = parsePagination(req.query as { page?: string; limit?: string });
    const { sortBy, sortDir } = req.query;

    const { whereClause, params, paramIndex } = await buildContactWhereClause(req.query as ContactFilterParams);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM contacts c ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Determine sort order from query params with safe column whitelist
    const sortColumn = (typeof sortBy === 'string' && SORT_COLUMN_MAP[sortBy]) ? SORT_COLUMN_MAP[sortBy] : 'c.created_at';
    const sortDirection = (typeof sortDir === 'string' && sortDir.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

    const dataResult = await pool.query(
      `SELECT c.*,
        COALESCE(
          (SELECT json_agg(json_build_object('id', cl.id, 'name', cl.name))
           FROM contact_list_members clm
           JOIN contact_lists cl ON cl.id = clm.list_id
           WHERE clm.contact_id = c.id), '[]'
        ) as lists
       FROM contacts c ${whereClause}
       ORDER BY ${sortColumn} ${sortDirection}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    res.json(buildPaginatedResult(dataResult.rows, total, { page, limit, offset }));
  } catch (err) {
    next(err);
  }
}

export async function getContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'contact ID');

    const result = await pool.query(
      `SELECT c.*,
        COALESCE(
          (SELECT json_agg(json_build_object('id', cl.id, 'name', cl.name))
           FROM contact_list_members clm
           JOIN contact_lists cl ON cl.id = clm.list_id
           WHERE clm.contact_id = c.id), '[]'
        ) as lists
       FROM contacts c WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      throw new AppError('Contact not found', 404);
    }

    // Get send history
    const history = await pool.query(
      `SELECT cr.campaign_id, cam.name as campaign_name, cr.status, cr.sent_at, cr.opened_at, cr.clicked_at, cr.bounced_at
       FROM campaign_recipients cr
       JOIN campaigns cam ON cam.id = cr.campaign_id
       WHERE cr.contact_id = $1
       ORDER BY cr.sent_at DESC
       LIMIT 50`,
      [id]
    );

    res.json({ contact: result.rows[0], sendHistory: history.rows });
  } catch (err) {
    next(err);
  }
}

export async function createContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, name, state, district, block, classes, category, management, address, metadata, listIds } = req.body;

    const existing = await pool.query('SELECT id FROM contacts WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      throw new AppError('Contact with this email already exists', 409);
    }

    const result = await pool.query(
      `INSERT INTO contacts (email, name, state, district, block, classes, category, management, address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [email, name || null, state || null, district || null, block || null, classes || null, category || null, management || null, address || null, metadata || {}]
    );

    const contact = result.rows[0];

    // FIX: Properly expand parameterized VALUES for multiple listIds
    if (listIds && listIds.length > 0) {
      const valuesPlaceholders: string[] = [];
      const queryParams: unknown[] = [];
      let paramIdx = 1;

      for (const listId of listIds) {
        valuesPlaceholders.push(`($${paramIdx}, $${paramIdx + 1})`);
        queryParams.push(contact.id, listId);
        paramIdx += 2;
      }

      await pool.query(
        `INSERT INTO contact_list_members (contact_id, list_id) VALUES ${valuesPlaceholders.join(', ')} ON CONFLICT DO NOTHING`,
        queryParams
      );
      // Update list counts
      await pool.query(
        `UPDATE contact_lists SET contact_count = (SELECT COUNT(*) FROM contact_list_members WHERE list_id = contact_lists.id), updated_at = NOW() WHERE id = ANY($1)`,
        [listIds]
      );
    }

    // Fire automation triggers (fire-and-forget)
    fireAutomationTrigger('contact_added', contact.id).catch(() => {});

    res.status(201).json({ contact });
  } catch (err) {
    next(err);
  }
}

export async function updateContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'contact ID');
    const { email, name, metadata, status, state, district, block, category, management, classes, address } = req.body;

    // Build dynamic SET clause for provided fields
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (email !== undefined) { setClauses.push(`email = $${paramIdx}`); params.push(email); paramIdx++; }
    if (name !== undefined) { setClauses.push(`name = $${paramIdx}`); params.push(name); paramIdx++; }
    if (status !== undefined) { setClauses.push(`status = $${paramIdx}`); params.push(status); paramIdx++; }
    if (state !== undefined) { setClauses.push(`state = $${paramIdx}`); params.push(state); paramIdx++; }
    if (district !== undefined) { setClauses.push(`district = $${paramIdx}`); params.push(district); paramIdx++; }
    if (block !== undefined) { setClauses.push(`block = $${paramIdx}`); params.push(block); paramIdx++; }
    if (category !== undefined) { setClauses.push(`category = $${paramIdx}`); params.push(category); paramIdx++; }
    if (management !== undefined) { setClauses.push(`management = $${paramIdx}`); params.push(management); paramIdx++; }
    if (classes !== undefined) { setClauses.push(`classes = $${paramIdx}`); params.push(classes); paramIdx++; }
    if (address !== undefined) { setClauses.push(`address = $${paramIdx}`); params.push(address); paramIdx++; }
    if (metadata !== undefined) {
      setClauses.push(`metadata = COALESCE($${paramIdx}::jsonb, metadata)`);
      params.push(JSON.stringify(metadata));
      paramIdx++;
    }

    if (setClauses.length === 0) {
      throw new AppError('No fields to update', 400);
    }

    setClauses.push('updated_at = NOW()');

    params.push(id);
    const result = await pool.query(
      `UPDATE contacts SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      throw new AppError('Contact not found', 404);
    }

    res.json({ contact: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function deleteContact(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'contact ID');
    const { adminPassword } = req.body;
    await verifyAdminPassword(adminPassword);

    // Use a transaction to clean up foreign key references before deleting
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check contact exists
      const existing = await client.query('SELECT id FROM contacts WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new AppError('Contact not found', 404);
      }

      // Nullify contact_id in campaign_recipients so historical send data is preserved
      // but the FK constraint no longer blocks deletion
      await client.query(
        'UPDATE campaign_recipients SET contact_id = NULL WHERE contact_id = $1',
        [id]
      );

      // contact_list_members has ON DELETE CASCADE, so no manual cleanup needed

      // Now delete the contact
      await client.query('DELETE FROM contacts WHERE id = $1', [id]);

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ message: 'Contact deleted' });
  } catch (err) {
    next(err);
  }
}

export async function bulkUpdateContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { contactIds, updates } = req.body;

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      throw new AppError('contactIds must be a non-empty array', 400);
    }
    if (!updates || typeof updates !== 'object') {
      throw new AppError('updates must be an object', 400);
    }
    for (const id of contactIds) {
      validateUUID(id, 'contact ID');
    }

    // Build dynamic SET clause — only update fields present in `updates`
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    const allowedFields = ['status', 'state', 'district', 'block', 'category', 'management', 'name', 'classes', 'address'];
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIdx}`);
        params.push(updates[field]);
        paramIdx++;
      }
    }

    // Handle metadata merge: use jsonb concatenation to MERGE with existing
    if (updates.metadata && typeof updates.metadata === 'object' && Object.keys(updates.metadata).length > 0) {
      setClauses.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${paramIdx}::jsonb`);
      params.push(JSON.stringify(updates.metadata));
      paramIdx++;
    }

    if (setClauses.length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    setClauses.push('updated_at = NOW()');

    // Execute single efficient UPDATE with ANY array
    params.push(contactIds);
    const query = `UPDATE contacts SET ${setClauses.join(', ')} WHERE id = ANY($${paramIdx}) RETURNING id`;

    const result = await pool.query(query, params);

    // Invalidate contact filter cache since state/district/etc may have changed
    await cacheDel('contact-filters:*');

    res.json({ updated: result.rowCount });
  } catch (err) {
    next(err);
  }
}

export async function bulkDeleteContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ids, adminPassword } = req.body;
    await verifyAdminPassword(adminPassword);

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError('ids must be a non-empty array', 400);
    }
    for (const id of ids) {
      validateUUID(id, 'contact ID');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Nullify contact_id in campaign_recipients for all contacts being deleted
      await client.query(
        'UPDATE campaign_recipients SET contact_id = NULL WHERE contact_id = ANY($1)',
        [ids]
      );

      // contact_list_members has ON DELETE CASCADE
      const result = await client.query('DELETE FROM contacts WHERE id = ANY($1)', [ids]);

      await client.query('COMMIT');
      res.json({ message: `${result.rowCount} contact(s) deleted` });
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

/**
 * Delete all contacts whose email is on the suppression list.
 * Requires admin password confirmation.
 */
export async function deleteSuppressedContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { adminPassword } = req.body;
    await verifyAdminPassword(adminPassword);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Find contacts whose email is in the suppression list
      const suppressed = await client.query(
        `SELECT c.id FROM contacts c
         WHERE LOWER(c.email) IN (SELECT LOWER(email) FROM suppression_list)`
      );

      const ids = suppressed.rows.map((r: { id: string }) => r.id);

      if (ids.length === 0) {
        await client.query('COMMIT');
        res.json({ message: 'No suppressed contacts found to delete', deleted: 0 });
        return;
      }

      // Nullify contact_id in campaign_recipients so historical data is preserved
      await client.query(
        'UPDATE campaign_recipients SET contact_id = NULL WHERE contact_id = ANY($1)',
        [ids]
      );

      // contact_list_members has ON DELETE CASCADE
      const result = await client.query('DELETE FROM contacts WHERE id = ANY($1)', [ids]);

      await client.query('COMMIT');
      res.json({ message: `${result.rowCount} suppressed contact(s) deleted`, deleted: result.rowCount });
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

/**
 * Bulk suppress contacts — accepts either { contactIds: string[] } OR { filters: ContactFilterParams }.
 * When filters provided, builds the same WHERE clause as listContacts and adds all matching emails to suppression.
 */
export async function bulkSuppressContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { contactIds, filters, reason } = req.body;

    let emails: string[];

    if (filters && typeof filters === 'object') {
      // Use filter-based selection
      const { whereClause, params } = await buildContactWhereClause(filters as ContactFilterParams);
      const result = await pool.query(
        `SELECT c.email FROM contacts c ${whereClause}`,
        params
      );
      emails = result.rows.map((r: { email: string }) => r.email);
    } else if (Array.isArray(contactIds) && contactIds.length > 0) {
      // Use explicit contact IDs
      for (const id of contactIds) {
        validateUUID(id, 'contact ID');
      }
      const result = await pool.query(
        'SELECT email FROM contacts WHERE id = ANY($1)',
        [contactIds]
      );
      emails = result.rows.map((r: { email: string }) => r.email);
    } else {
      throw new AppError('Provide either contactIds or filters', 400);
    }

    if (emails.length === 0) {
      res.json({ message: 'No matching contacts found', suppressed: 0 });
      return;
    }

    // Bulk insert into suppression_list in batches
    let totalSuppressed = 0;
    const suppressReason = reason || 'Bulk suppression from contacts page';

    for (let i = 0; i < emails.length; i += 200) {
      const batch = emails.slice(i, i + 200);
      const valuesPlaceholders: string[] = [];
      const queryParams: unknown[] = [];
      let paramIdx = 1;

      for (const email of batch) {
        valuesPlaceholders.push(`($${paramIdx}, $${paramIdx + 1}, 'manual')`);
        queryParams.push(email.toLowerCase(), suppressReason);
        paramIdx += 2;
      }

      const insertResult = await pool.query(
        `INSERT INTO suppression_list (email, reason, added_by)
         VALUES ${valuesPlaceholders.join(', ')}
         ON CONFLICT DO NOTHING`,
        queryParams
      );
      totalSuppressed += insertResult.rowCount || 0;
    }

    // Also update health_status for these contacts
    await pool.query(
      `UPDATE contacts SET health_status = 'suppressed', updated_at = NOW()
       WHERE LOWER(email) = ANY($1)`,
      [emails.map(e => e.toLowerCase())]
    );

    res.json({ message: `${totalSuppressed} email(s) added to suppression list`, suppressed: totalSuppressed });
  } catch (err) {
    next(err);
  }
}

/**
 * Bulk delete contacts by filters — accepts { filters: ContactFilterParams, adminPassword: string }.
 * Builds the same WHERE clause as listContacts and deletes all matching contacts.
 */
export async function bulkDeleteFiltered(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { filters, adminPassword } = req.body;
    await verifyAdminPassword(adminPassword);

    if (!filters || typeof filters !== 'object') {
      throw new AppError('filters object is required', 400);
    }

    const { whereClause, params } = await buildContactWhereClause(filters as ContactFilterParams);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get matching contact IDs
      const idsResult = await client.query(
        `SELECT c.id FROM contacts c ${whereClause}`,
        params
      );
      const ids = idsResult.rows.map((r: { id: string }) => r.id);

      if (ids.length === 0) {
        await client.query('COMMIT');
        res.json({ message: 'No matching contacts found', deleted: 0 });
        return;
      }

      // Nullify contact_id in campaign_recipients for historical data preservation
      await client.query(
        'UPDATE campaign_recipients SET contact_id = NULL WHERE contact_id = ANY($1)',
        [ids]
      );

      // contact_list_members has ON DELETE CASCADE
      const result = await client.query('DELETE FROM contacts WHERE id = ANY($1)', [ids]);

      await client.query('COMMIT');
      res.json({ message: `${result.rowCount} contact(s) deleted`, deleted: result.rowCount });
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

// FIX: Proper CSV field parsing that handles quoted fields
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

// FIX: Proper email validation using a reasonable regex
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Column name mapping: CSV header -> DB column
const COLUMN_MAP: Record<string, string> = {
  email: 'email',
  name: 'name',
  school_name: 'name',
  state: 'state',
  district: 'district',
  block: 'block',
  classes: 'classes',
  category: 'category',
  management: 'management',
  address: 'address',
};

export async function importContactsCSV(req: Request, res: Response, next: NextFunction): Promise<void> {
  const filePath = req.file?.path;
  try {
    const file = req.file;
    if (!file || !filePath) {
      throw new AppError('CSV file required', 400);
    }

    const { listId } = req.body;
    // Parse optional column mapping overrides from the body (JSON string)
    let columnMapping: Record<string, string> | undefined;
    if (req.body.columnMapping) {
      try {
        columnMapping = JSON.parse(req.body.columnMapping);
      } catch {
        throw new AppError('Invalid columnMapping JSON', 400);
      }
    }

    // Fetch custom variable definitions to detect metadata columns
    const cvResult = await pool.query('SELECT key FROM custom_variables ORDER BY sort_order');
    const customVariableKeys = new Set(cvResult.rows.map((r: { key: string }) => r.key));

    // --- Stream-based CSV import for large files (65MB+, 280K+ rows) ---
    // Instead of loading the entire file into memory, we read line-by-line.

    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    let headers: string[] | null = null;
    const mapping: Record<string, number> = {};
    // Track which CSV column indices map to custom variable keys
    const metadataMapping: Record<string, number> = {};
    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    let totalRows = 0;
    const errors: string[] = [];

    type ContactRow = {
      email: string;
      name: string | null;
      state: string | null;
      district: string | null;
      block: string | null;
      classes: string | null;
      category: string | null;
      management: string | null;
      address: string | null;
      metadata: Record<string, string>;
    };

    const BATCH_SIZE = 500;
    let batch: ContactRow[] = [];

    // Truncate a string to fit a VARCHAR(N) column
    function truncate(val: string | null, maxLen: number): string | null {
      if (!val) return null;
      return val.length > maxLen ? val.substring(0, maxLen) : val;
    }

    // Helper: flush a batch to the database
    async function flushBatch(rows: ContactRow[]): Promise<void> {
      if (rows.length === 0) return;

      // Deduplicate within batch (PostgreSQL ON CONFLICT can't handle same email twice)
      const seenEmails = new Map<string, number>();
      for (let ri = 0; ri < rows.length; ri++) {
        seenEmails.set(rows[ri].email.toLowerCase(), ri);
      }
      const uniqueRows = [...seenEmails.values()].map(idx => rows[idx]);
      const inBatchDupes = rows.length - uniqueRows.length;
      if (inBatchDupes > 0) duplicates += inBatchDupes;

      const valuesPlaceholders: string[] = [];
      const queryParams: unknown[] = [];
      let paramIdx = 1;

      for (const row of uniqueRows) {
        valuesPlaceholders.push(
          `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6}, $${paramIdx + 7}, $${paramIdx + 8}, $${paramIdx + 9})`
        );
        queryParams.push(
          truncate(row.email, 320),
          truncate(row.name, 255),
          truncate(row.state, 100),
          truncate(row.district, 100),
          truncate(row.block, 100),
          truncate(row.classes, 255),
          truncate(row.category, 100),
          truncate(row.management, 100),
          row.address, // text — no limit
          Object.keys(row.metadata).length > 0 ? JSON.stringify(row.metadata) : '{}'
        );
        paramIdx += 10;
      }

      try {
        const insertResult = await pool.query(
          `INSERT INTO contacts (email, name, state, district, block, classes, category, management, address, metadata)
           VALUES ${valuesPlaceholders.join(', ')}
           ON CONFLICT (email) DO UPDATE SET
             name = COALESCE(EXCLUDED.name, contacts.name),
             state = COALESCE(EXCLUDED.state, contacts.state),
             district = COALESCE(EXCLUDED.district, contacts.district),
             block = COALESCE(EXCLUDED.block, contacts.block),
             classes = COALESCE(EXCLUDED.classes, contacts.classes),
             category = COALESCE(EXCLUDED.category, contacts.category),
             management = COALESCE(EXCLUDED.management, contacts.management),
             address = COALESCE(EXCLUDED.address, contacts.address),
             metadata = contacts.metadata || EXCLUDED.metadata,
             updated_at = NOW()
           RETURNING id, (xmax = 0) AS is_new`,
          queryParams
        );

        const newIds: string[] = [];
        for (const row of insertResult.rows) {
          if (row.is_new) imported++;
          else duplicates++;
          newIds.push(row.id);
        }

        if (listId && newIds.length > 0) {
          const listValues: string[] = [];
          const listParams: unknown[] = [];
          let lIdx = 1;
          for (const cId of newIds) {
            listValues.push(`($${lIdx}, $${lIdx + 1})`);
            listParams.push(cId, listId);
            lIdx += 2;
          }
          await pool.query(
            `INSERT INTO contact_list_members (contact_id, list_id) VALUES ${listValues.join(', ')} ON CONFLICT DO NOTHING`,
            listParams
          );
        }
      } catch (batchErr) {
        // Log the batch error but continue importing remaining batches
        const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
        if (errors.length < 50) {
          errors.push(`Batch error at rows ~${totalRows - rows.length + 1}-${totalRows}: ${msg}`);
        }
        skipped += uniqueRows.length;
      }
    }

    // Process the file line by line
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (!headers) {
        // First non-empty line = header row
        headers = parseCSVLine(trimmed).map((h) => h.toLowerCase().trim());
        for (let i = 0; i < headers.length; i++) {
          const header = headers[i];
          if (columnMapping && columnMapping[header]) {
            const target = columnMapping[header];
            // Check if mapped target is a custom variable key
            if (customVariableKeys.has(target)) {
              metadataMapping[target] = i;
            } else {
              mapping[target] = i;
            }
          } else if (COLUMN_MAP[header]) {
            mapping[COLUMN_MAP[header]] = i;
          } else if (customVariableKeys.has(header)) {
            // Auto-detect: CSV header matches a custom variable key
            metadataMapping[header] = i;
          }
        }
        if (mapping['email'] === undefined) {
          throw new AppError('CSV must have an "email" column (or mapped equivalent)', 400);
        }
        continue;
      }

      totalRows++;
      const cols = parseCSVLine(trimmed);
      const email = cols[mapping['email']]?.trim();

      if (!email || !isValidEmail(email)) {
        skipped++;
        if (errors.length < 50) {
          errors.push(`Row ${totalRows + 1}: Invalid email "${email || ''}"`);
        }
        continue;
      }

      const getCol = (key: string): string | null => {
        if (mapping[key] === undefined) return null;
        return cols[mapping[key]]?.trim() || null;
      };

      // Build metadata from custom variable columns
      const rowMetadata: Record<string, string> = {};
      for (const [cvKey, colIdx] of Object.entries(metadataMapping)) {
        const val = cols[colIdx]?.trim();
        if (val) rowMetadata[cvKey] = val;
      }

      batch.push({
        email,
        name: getCol('name'),
        state: getCol('state'),
        district: getCol('district'),
        block: getCol('block'),
        classes: getCol('classes'),
        category: getCol('category'),
        management: getCol('management'),
        address: getCol('address'),
        metadata: rowMetadata,
      });

      if (batch.length >= BATCH_SIZE) {
        await flushBatch(batch);
        batch = [];
      }
    }

    // Flush remaining rows
    await flushBatch(batch);

    if (!headers) {
      throw new AppError('CSV must have a header row and at least one data row', 400);
    }

    // Update list count
    if (listId) {
      await pool.query(
        'UPDATE contact_lists SET contact_count = (SELECT COUNT(*) FROM contact_list_members WHERE list_id = $1), updated_at = NOW() WHERE id = $1',
        [listId]
      );
    }

    // Invalidate contact filter cache after import
    await cacheDel('contact-filters:*');

    res.json({
      imported,
      duplicates,
      skipped,
      total: totalRows,
      errors: errors.slice(0, 20),
      detectedColumns: Object.keys(mapping),
    });
  } catch (err) {
    next(err);
  } finally {
    // Clean up the uploaded temp file
    if (filePath) {
      fs.unlink(filePath, () => {});
    }
  }
}

// Preview CSV: returns headers and first N rows for column mapping UI
export async function previewCSV(req: Request, res: Response, next: NextFunction): Promise<void> {
  const filePath = req.file?.path;
  try {
    if (!filePath) {
      throw new AppError('CSV file required', 400);
    }

    // Fetch custom variable definitions to auto-detect metadata columns
    const cvResult = await pool.query('SELECT key FROM custom_variables ORDER BY sort_order');
    const customVariableKeys = new Set(cvResult.rows.map((r: { key: string }) => r.key));

    // Read only the first 64KB for preview (works for any file size)
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);

    const csvContent = buf.slice(0, bytesRead).toString('utf-8');
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim());

    if (lines.length < 1) {
      throw new AppError('CSV file is empty', 400);
    }

    const headers = parseCSVLine(lines[0]).map((h) => h.trim());

    const autoMapping: Record<string, string> = {};
    for (const header of headers) {
      const lower = header.toLowerCase();
      if (COLUMN_MAP[lower]) {
        autoMapping[header] = COLUMN_MAP[lower];
      } else if (customVariableKeys.has(lower)) {
        autoMapping[header] = lower;
      }
    }

    const previewRows: string[][] = [];
    for (let i = 1; i < Math.min(lines.length, 11); i++) {
      previewRows.push(parseCSVLine(lines[i]));
    }

    // Estimate total rows from file size
    const stat = fs.statSync(filePath);
    let totalRows: number;
    if (stat.size <= 64 * 1024) {
      totalRows = lines.length - 1;
    } else {
      const sampleBytes = Buffer.byteLength(lines.slice(0, 11).join('\n'), 'utf-8');
      const avgBytesPerLine = sampleBytes / Math.min(lines.length, 11);
      totalRows = Math.round(stat.size / avgBytesPerLine) - 1;
    }

    res.json({ headers, autoMapping, previewRows, totalRows });
  } catch (err) {
    next(err);
  } finally {
    if (filePath) fs.unlink(filePath, () => {});
  }
}

// Legacy import (keep for backwards compatibility)
export async function importContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const file = req.file;
    if (!file) {
      throw new AppError('CSV file required', 400);
    }

    const { listId } = req.body;
    // Support both disk storage (file.path) and memory storage (file.buffer)
    const csvContent = file.path
      ? fs.readFileSync(file.path, 'utf-8')
      : (file.buffer as Buffer).toString('utf-8');
    const lines = csvContent.split('\n').filter((line) => line.trim());

    if (lines.length < 2) {
      throw new AppError('CSV must have a header row and at least one data row', 400);
    }

    // FIX: Use proper CSV parsing for headers too
    const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase());
    const emailIdx = headers.indexOf('email');
    const nameIdx = headers.indexOf('name');

    if (emailIdx === -1) {
      throw new AppError('CSV must have an "email" column', 400);
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      // FIX: Use proper CSV parsing instead of naive split(',')
      const cols = parseCSVLine(lines[i]);
      const email = cols[emailIdx]?.trim();
      const name = nameIdx >= 0 ? cols[nameIdx]?.trim() || null : null;

      // FIX: Proper email validation instead of just checking for '@'
      if (!email || !isValidEmail(email)) {
        skipped++;
        errors.push(`Row ${i + 1}: Invalid email "${email || ''}"`);
        continue;
      }

      try {
        const result = await pool.query(
          'INSERT INTO contacts (email, name) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET name = COALESCE(EXCLUDED.name, contacts.name), updated_at = NOW() RETURNING id',
          [email, name]
        );

        if (listId && result.rows[0]) {
          await pool.query(
            'INSERT INTO contact_list_members (contact_id, list_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [result.rows[0].id, listId]
          );
        }

        imported++;
      } catch {
        skipped++;
        errors.push(`Row ${i + 1}: Failed to import "${email}"`);
      }
    }

    // Update list count
    if (listId) {
      await pool.query(
        'UPDATE contact_lists SET contact_count = (SELECT COUNT(*) FROM contact_list_members WHERE list_id = $1), updated_at = NOW() WHERE id = $1',
        [listId]
      );
    }

    // Invalidate contact filter cache after import
    await cacheDel('contact-filters:*');

    res.json({ imported, skipped, total: lines.length - 1, errors: errors.slice(0, 20) });
  } catch (err) {
    next(err);
  }
}

// FIX: Proper CSV field escaping for values containing quotes or commas
function escapeCSVField(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { listId } = req.query;

    let query = 'SELECT email, name, state, district, block, classes, category, management, address, status, send_count, bounce_count, last_sent_at, created_at FROM contacts';
    const params: unknown[] = [];

    if (listId) {
      query += ' WHERE id IN (SELECT contact_id FROM contact_list_members WHERE list_id = $1)';
      params.push(listId);
    }

    query += ' ORDER BY email';

    const result = await pool.query(query, params);

    const csvHeader = 'email,name,state,district,block,classes,category,management,address,status,send_count,bounce_count,last_sent_at,created_at\n';
    // FIX: Properly escape all fields in CSV output
    const csvRows = result.rows
      .map((r) =>
        [
          escapeCSVField(r.email),
          escapeCSVField(r.name),
          escapeCSVField(r.state),
          escapeCSVField(r.district),
          escapeCSVField(r.block),
          escapeCSVField(r.classes),
          escapeCSVField(r.category),
          escapeCSVField(r.management),
          escapeCSVField(r.address),
          escapeCSVField(r.status),
          r.send_count,
          r.bounce_count,
          r.last_sent_at || '',
          r.created_at,
        ].join(',')
      )
      .join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(csvHeader + csvRows);
  } catch (err) {
    next(err);
  }
}

// Filter facets endpoint: returns unique values for filter dropdowns
// Also returns per-option counts (stateCounts, districtCounts, etc.) for the smart list UI
export async function getContactFilters(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { state, district } = req.query;
    const cacheKey = `contact-filters-v2:${state || ''}:${district || ''}`;

    const result = await cacheThrough<Record<string, unknown>>(cacheKey, async () => {
      const filters: Record<string, unknown> = {};

      // States with counts
      const statesRes = await pool.query(
        "SELECT state, COUNT(*) as count FROM contacts WHERE state IS NOT NULL AND state != '' AND status = 'active' GROUP BY state ORDER BY state"
      );
      filters.states = statesRes.rows.map((r) => r.state);
      const stateCounts: Record<string, number> = {};
      for (const r of statesRes.rows) stateCounts[r.state] = parseInt(r.count);
      filters.stateCounts = stateCounts;

      // Districts: optionally filtered by state, with counts
      if (state) {
        const states = (state as string).split(',').map(s => s.trim()).filter(Boolean);
        const distRes = await pool.query(
          "SELECT district, COUNT(*) as count FROM contacts WHERE district IS NOT NULL AND district != '' AND status = 'active' AND state = ANY($1) GROUP BY district ORDER BY district",
          [states]
        );
        filters.districts = distRes.rows.map((r) => r.district);
        const districtCounts: Record<string, number> = {};
        for (const r of distRes.rows) districtCounts[r.district] = parseInt(r.count);
        filters.districtCounts = districtCounts;
      } else {
        const distRes = await pool.query(
          "SELECT district, COUNT(*) as count FROM contacts WHERE district IS NOT NULL AND district != '' AND status = 'active' GROUP BY district ORDER BY district"
        );
        filters.districts = distRes.rows.map((r) => r.district);
        const districtCounts: Record<string, number> = {};
        for (const r of distRes.rows) districtCounts[r.district] = parseInt(r.count);
        filters.districtCounts = districtCounts;
      }

      // Blocks: optionally filtered by district, with counts
      if (district) {
        const districts = (district as string).split(',').map(s => s.trim()).filter(Boolean);
        const blockRes = await pool.query(
          "SELECT block, COUNT(*) as count FROM contacts WHERE block IS NOT NULL AND block != '' AND status = 'active' AND district = ANY($1) GROUP BY block ORDER BY block",
          [districts]
        );
        filters.blocks = blockRes.rows.map((r) => r.block);
        const blockCounts: Record<string, number> = {};
        for (const r of blockRes.rows) blockCounts[r.block] = parseInt(r.count);
        filters.blockCounts = blockCounts;
      } else {
        const blockRes = await pool.query(
          "SELECT block, COUNT(*) as count FROM contacts WHERE block IS NOT NULL AND block != '' AND status = 'active' GROUP BY block ORDER BY block"
        );
        filters.blocks = blockRes.rows.map((r) => r.block);
        const blockCounts: Record<string, number> = {};
        for (const r of blockRes.rows) blockCounts[r.block] = parseInt(r.count);
        filters.blockCounts = blockCounts;
      }

      // Categories with counts
      const catRes = await pool.query(
        "SELECT category, COUNT(*) as count FROM contacts WHERE category IS NOT NULL AND category != '' AND status = 'active' GROUP BY category ORDER BY category"
      );
      filters.categories = catRes.rows.map((r) => r.category);
      const categoryCounts: Record<string, number> = {};
      for (const r of catRes.rows) categoryCounts[r.category] = parseInt(r.count);
      filters.categoryCounts = categoryCounts;

      // Management types with counts
      const mgmtRes = await pool.query(
        "SELECT management, COUNT(*) as count FROM contacts WHERE management IS NOT NULL AND management != '' AND status = 'active' GROUP BY management ORDER BY management"
      );
      filters.managements = mgmtRes.rows.map((r) => r.management);
      const managementCounts: Record<string, number> = {};
      for (const r of mgmtRes.rows) managementCounts[r.management] = parseInt(r.count);
      filters.managementCounts = managementCounts;

      return filters;
    }, 300); // Cache for 5 minutes

    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * List all bounced emails across campaigns with full context.
 * Supports filters: bounceType, campaignId, search, dateFrom, dateTo.
 */
export async function listBouncedEmails(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, offset } = parsePagination(req.query as { page?: string; limit?: string });
    const { bounceType, campaignId, search, dateFrom, dateTo } = req.query;

    // Include ALL records with a bounce_type set (not just status=bounced/failed — transient bounces may have status=sent)
    let whereClause = "WHERE cr.bounce_type IS NOT NULL";
    const params: unknown[] = [];
    let paramIndex = 1;

    if (bounceType && typeof bounceType === 'string') {
      whereClause += ` AND cr.bounce_type = $${paramIndex}`;
      params.push(bounceType);
      paramIndex++;
    }
    if (campaignId && typeof campaignId === 'string') {
      whereClause += ` AND cr.campaign_id = $${paramIndex}`;
      params.push(campaignId);
      paramIndex++;
    }
    if (search && typeof search === 'string') {
      whereClause += ` AND (cr.email ILIKE $${paramIndex} OR c.name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (dateFrom && typeof dateFrom === 'string') {
      whereClause += ` AND cr.bounced_at >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }
    if (dateTo && typeof dateTo === 'string') {
      whereClause += ` AND cr.bounced_at <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    // Stats query
    const statsResult = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE cr.bounce_type IS NOT NULL) as total,
        COUNT(*) FILTER (WHERE cr.bounce_type = 'permanent') as permanent,
        COUNT(*) FILTER (WHERE cr.bounce_type = 'transient') as transient,
        COUNT(*) FILTER (WHERE cr.bounce_type = 'undetermined') as undetermined
       FROM campaign_recipients cr
       WHERE cr.bounce_type IS NOT NULL`
    );
    const suppressionCountResult = await pool.query('SELECT COUNT(*) FROM suppression_list');

    const stats = {
      total: parseInt(statsResult.rows[0].total, 10),
      permanent: parseInt(statsResult.rows[0].permanent, 10),
      transient: parseInt(statsResult.rows[0].transient, 10),
      undetermined: parseInt(statsResult.rows[0].undetermined, 10),
      suppressed: parseInt(suppressionCountResult.rows[0].count, 10),
    };

    // Count query
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT cr.email) FROM campaign_recipients cr
       LEFT JOIN contacts c ON c.id = cr.contact_id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Main data query — latest bounce per email
    const dataResult = await pool.query(
      `SELECT DISTINCT ON (cr.email)
        cr.id, cr.email, cr.status, cr.bounce_type, cr.error_message, cr.bounced_at,
        c.id as contact_id, c.name as contact_name, c.status as contact_status,
        cam.id as campaign_id, cam.name as campaign_name
       FROM campaign_recipients cr
       LEFT JOIN contacts c ON c.id = cr.contact_id
       LEFT JOIN campaigns cam ON cam.id = cr.campaign_id
       ${whereClause}
       ORDER BY cr.email, cr.bounced_at DESC`,
      params
    );

    // Apply pagination in-memory since DISTINCT ON + LIMIT/OFFSET conflicts with order
    const paginatedData = dataResult.rows.slice(offset, offset + limit);

    res.json({
      data: paginatedData,
      stats,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Verify a batch of emails (max 100). Checks syntax, MX, disposable, role-based, suppression.
 */
export async function verifyEmails(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { emails } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) {
      throw new AppError('emails array is required', 400);
    }
    if (emails.length > 100) {
      throw new AppError('Maximum 100 emails per request', 400);
    }

    const { verifyEmailBatch } = await import('../utils/emailVerifier');
    const results = await verifyEmailBatch(emails);
    res.json({ results });
  } catch (err) {
    next(err);
  }
}

/**
 * Verify all emails in a contact list.
 */
export async function verifyListEmails(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { listId } = req.params;
    validateUUID(listId, 'list ID');

    // Check if this is a smart list
    const listResult = await pool.query('SELECT is_smart, filter_criteria FROM contact_lists WHERE id = $1', [listId]);
    if (listResult.rows.length === 0) throw new AppError('List not found', 404);
    const list = listResult.rows[0];

    let contactsResult;
    if (list.is_smart && list.filter_criteria) {
      // Smart list — use dynamic filter query
      const criteria = list.filter_criteria as Record<string, unknown>;
      const filterParts: string[] = [];
      const filterParams: unknown[] = [];
      let paramIdx = 1;

      if (criteria.state && Array.isArray(criteria.state) && criteria.state.length > 0) {
        filterParts.push(`c.state = ANY($${paramIdx})`); filterParams.push(criteria.state); paramIdx++;
      }
      if (criteria.district && Array.isArray(criteria.district) && criteria.district.length > 0) {
        filterParts.push(`c.district = ANY($${paramIdx})`); filterParams.push(criteria.district); paramIdx++;
      }
      if (criteria.block && Array.isArray(criteria.block) && criteria.block.length > 0) {
        filterParts.push(`c.block = ANY($${paramIdx})`); filterParams.push(criteria.block); paramIdx++;
      }
      if (criteria.category && Array.isArray(criteria.category) && criteria.category.length > 0) {
        filterParts.push(`c.category = ANY($${paramIdx})`); filterParams.push(criteria.category); paramIdx++;
      }
      if (criteria.management && Array.isArray(criteria.management) && criteria.management.length > 0) {
        filterParts.push(`c.management = ANY($${paramIdx})`); filterParams.push(criteria.management); paramIdx++;
      }

      const whereExtra = filterParts.length > 0 ? ' AND ' + filterParts.join(' AND ') : '';
      contactsResult = await pool.query(
        `SELECT c.email FROM contacts c WHERE c.status = 'active'${whereExtra}`,
        filterParams
      );
    } else {
      // Regular list — use contact_list_members
      contactsResult = await pool.query(
        `SELECT c.email FROM contacts c
         JOIN contact_list_members clm ON clm.contact_id = c.id
         WHERE clm.list_id = $1 AND c.status = 'active'`,
        [listId]
      );
    }

    const emails = contactsResult.rows.map(r => r.email);
    if (emails.length === 0) {
      res.json({ results: [], summary: { total: 0, valid: 0, invalid: 0, risky: 0 } });
      return;
    }

    const { verifyEmailBatch } = await import('../utils/emailVerifier');
    const results = await verifyEmailBatch(emails);

    const summary = {
      total: results.length,
      valid: results.filter(r => r.risk === 'low').length,
      invalid: results.filter(r => !r.valid).length,
      risky: results.filter(r => r.risk === 'medium' || r.risk === 'high').length,
    };

    res.json({ results, summary });
  } catch (err) {
    next(err);
  }
}

// ── Contact Health Check ──

const REDIS_HEALTH_PROGRESS_KEY = 'contact-health-check-progress';

export async function startHealthCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Check if already running
    const existing = await redis.get(REDIS_HEALTH_PROGRESS_KEY);
    if (existing) {
      const progress = JSON.parse(existing);
      if (progress.status === 'running') {
        res.json({ message: 'Health check already running', ...progress });
        return;
      }
    }

    // Count unchecked/stale contacts
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM contacts
       WHERE health_status = 'unchecked'
          OR health_checked_at < NOW() - INTERVAL '30 days'
          OR health_checked_at IS NULL`
    );
    const totalUnchecked = parseInt(countResult.rows[0].count);

    // Fire and forget the health check worker
    import('./contactHealthChecker.workerRunner').then(({ run }) => run()).catch((err) => {
      logger.error('Contact health check worker failed', { error: (err as Error).message });
    });

    res.json({ message: 'Health check started', totalUnchecked });
  } catch (err) {
    next(err);
  }
}

export async function getHealthCheckProgress(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await redis.get(REDIS_HEALTH_PROGRESS_KEY);
    if (!data) {
      res.json({ total: 0, checked: 0, good: 0, risky: 0, invalid: 0, suppressed: 0, status: 'idle', startedAt: null });
      return;
    }
    res.json(JSON.parse(data));
  } catch (err) {
    next(err);
  }
}

export async function getHealthStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT COALESCE(health_status, 'unchecked') as health_status, COUNT(*)::int as count
       FROM contacts
       GROUP BY health_status`
    );
    const stats: Record<string, number> = { good: 0, risky: 0, invalid: 0, suppressed: 0, unchecked: 0 };
    for (const row of result.rows) {
      stats[row.health_status] = row.count;
    }
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

/**
 * Count contacts matching smart filter criteria WITHOUT creating a list.
 * Used for live preview in the smart list creation modal.
 * POST /contacts/count-filtered
 */
export async function getFilteredContactCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const criteria = req.body;
    if (!criteria || typeof criteria !== 'object') {
      res.json({ count: 0 });
      return;
    }

    let where = '';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (criteria.state && Array.isArray(criteria.state) && criteria.state.length > 0) {
      where += ` AND c.state = ANY($${paramIndex})`;
      params.push(criteria.state);
      paramIndex++;
    }
    if (criteria.district && Array.isArray(criteria.district) && criteria.district.length > 0) {
      where += ` AND c.district = ANY($${paramIndex})`;
      params.push(criteria.district);
      paramIndex++;
    }
    if (criteria.block && Array.isArray(criteria.block) && criteria.block.length > 0) {
      where += ` AND c.block = ANY($${paramIndex})`;
      params.push(criteria.block);
      paramIndex++;
    }
    if (criteria.category && Array.isArray(criteria.category) && criteria.category.length > 0) {
      where += ` AND c.category = ANY($${paramIndex})`;
      params.push(criteria.category);
      paramIndex++;
    }
    if (criteria.management && Array.isArray(criteria.management) && criteria.management.length > 0) {
      where += ` AND c.management = ANY($${paramIndex})`;
      params.push(criteria.management);
      paramIndex++;
    }
    if (criteria.classes_min != null) {
      where += ` AND CASE WHEN c.classes ~ '^[0-9]+-[0-9]+$' THEN CAST(split_part(c.classes, '-', 2) AS integer) >= $${paramIndex} ELSE true END`;
      params.push(criteria.classes_min);
      paramIndex++;
    }
    if (criteria.classes_max != null) {
      where += ` AND CASE WHEN c.classes ~ '^[0-9]+-[0-9]+$' THEN CAST(split_part(c.classes, '-', 1) AS integer) <= $${paramIndex} ELSE true END`;
      params.push(criteria.classes_max);
      paramIndex++;
    }

    const result = await pool.query(
      `SELECT COUNT(*) FROM contacts c WHERE c.status = 'active' ${where}`,
      params
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    next(err);
  }
}
