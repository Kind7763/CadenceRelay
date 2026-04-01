import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AppError } from '../middleware/errorHandler';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id: string, label = 'ID'): void {
  if (!UUID_RE.test(id)) {
    throw new AppError(`Invalid ${label} format`, 400);
  }
}

export async function listProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { archived } = req.query;

    let whereClause = '';
    if (archived === 'true') {
      whereClause = 'WHERE p.is_archived = true';
    } else {
      whereClause = 'WHERE p.is_archived = false';
    }

    const result = await pool.query(
      `SELECT p.*,
        COALESCE(camp.cnt, 0)::int AS campaign_count,
        COALESCE(tmpl.cnt, 0)::int AS template_count,
        COALESCE(lst.cnt, 0)::int AS list_count,
        COALESCE(camp.total_sent, 0)::int AS total_sent,
        COALESCE(camp.total_opens, 0)::int AS total_opens
       FROM projects p
       LEFT JOIN (
         SELECT project_id, COUNT(*)::int AS cnt,
                COALESCE(SUM(sent_count), 0)::int AS total_sent,
                COALESCE(SUM(open_count), 0)::int AS total_opens
         FROM campaigns
         GROUP BY project_id
       ) camp ON camp.project_id = p.id
       LEFT JOIN (
         SELECT project_id, COUNT(*)::int AS cnt
         FROM templates
         GROUP BY project_id
       ) tmpl ON tmpl.project_id = p.id
       LEFT JOIN (
         SELECT project_id, COUNT(*)::int AS cnt
         FROM contact_lists
         GROUP BY project_id
       ) lst ON lst.project_id = p.id
       ${whereClause}
       ORDER BY p.created_at DESC`
    );

    res.json({ projects: result.rows });
  } catch (err) {
    next(err);
  }
}

export async function createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, description, color, icon } = req.body;

    const result = await pool.query(
      `INSERT INTO projects (name, description, color, icon)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description || null, color || '#6366f1', icon || null]
    );

    res.status(201).json({ project: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function getProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'project ID');

    const result = await pool.query(
      `SELECT p.*,
        COALESCE(camp.cnt, 0)::int AS campaign_count,
        COALESCE(tmpl.cnt, 0)::int AS template_count,
        COALESCE(lst.cnt, 0)::int AS list_count,
        COALESCE(camp.total_sent, 0)::int AS total_sent,
        COALESCE(camp.total_opens, 0)::int AS total_opens
       FROM projects p
       LEFT JOIN (
         SELECT project_id, COUNT(*)::int AS cnt,
                COALESCE(SUM(sent_count), 0)::int AS total_sent,
                COALESCE(SUM(open_count), 0)::int AS total_opens
         FROM campaigns
         GROUP BY project_id
       ) camp ON camp.project_id = p.id
       LEFT JOIN (
         SELECT project_id, COUNT(*)::int AS cnt
         FROM templates
         GROUP BY project_id
       ) tmpl ON tmpl.project_id = p.id
       LEFT JOIN (
         SELECT project_id, COUNT(*)::int AS cnt
         FROM contact_lists
         GROUP BY project_id
       ) lst ON lst.project_id = p.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) throw new AppError('Project not found', 404);
    res.json({ project: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function updateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'project ID');
    const { name, description, color, icon } = req.body;

    const existing = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError('Project not found', 404);

    const result = await pool.query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        color = COALESCE($3, color),
        icon = COALESCE($4, icon),
        updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [name || null, description !== undefined ? description : null, color || null, icon !== undefined ? icon : null, id]
    );

    res.json({ project: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'project ID');

    const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) throw new AppError('Project not found', 404);

    res.json({ message: 'Project deleted' });
  } catch (err) {
    next(err);
  }
}

export async function toggleArchive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'project ID');

    const result = await pool.query(
      `UPDATE projects SET is_archived = NOT is_archived, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) throw new AppError('Project not found', 404);
    res.json({ project: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function moveItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'project ID');
    const { campaignIds, templateIds, listIds } = req.body;

    // Verify project exists
    const project = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (project.rows.length === 0) throw new AppError('Project not found', 404);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (campaignIds && campaignIds.length > 0) {
        await client.query(
          'UPDATE campaigns SET project_id = $1 WHERE id = ANY($2::uuid[])',
          [id, campaignIds]
        );
      }

      if (templateIds && templateIds.length > 0) {
        await client.query(
          'UPDATE templates SET project_id = $1 WHERE id = ANY($2::uuid[])',
          [id, templateIds]
        );
      }

      if (listIds && listIds.length > 0) {
        await client.query(
          'UPDATE contact_lists SET project_id = $1 WHERE id = ANY($2::uuid[])',
          [id, listIds]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ message: 'Items moved to project' });
  } catch (err) {
    next(err);
  }
}

export async function unlinkItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'project ID');
    const { campaignIds, templateIds, listIds } = req.body;

    // Verify project exists
    const project = await pool.query('SELECT id FROM projects WHERE id = $1', [id]);
    if (project.rows.length === 0) throw new AppError('Project not found', 404);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (campaignIds && campaignIds.length > 0) {
        await client.query(
          'UPDATE campaigns SET project_id = NULL WHERE id = ANY($1::uuid[]) AND project_id = $2',
          [campaignIds, id]
        );
      }

      if (templateIds && templateIds.length > 0) {
        await client.query(
          'UPDATE templates SET project_id = NULL WHERE id = ANY($1::uuid[]) AND project_id = $2',
          [templateIds, id]
        );
      }

      if (listIds && listIds.length > 0) {
        await client.query(
          'UPDATE contact_lists SET project_id = NULL WHERE id = ANY($1::uuid[]) AND project_id = $2',
          [listIds, id]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ message: 'Items unlinked from project' });
  } catch (err) {
    next(err);
  }
}
