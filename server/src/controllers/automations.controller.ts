import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, buildPaginatedResult } from '../utils/pagination';

// Validate UUID format
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id: string, label = 'ID'): void {
  if (!UUID_RE.test(id)) {
    throw new AppError(`Invalid ${label} format`, 400);
  }
}

export async function listAutomations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, offset } = parsePagination(req.query as { page?: string; limit?: string });
    const { search, status, projectId } = req.query;

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND a.name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (status) {
      whereClause += ` AND a.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    if (projectId) {
      whereClause += ` AND a.project_id = $${paramIndex}`;
      params.push(projectId);
      paramIndex++;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM automations a ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await pool.query(
      `SELECT a.id, a.name, a.description, a.status, a.trigger_type, a.trigger_config,
              a.provider, a.project_id, a.total_enrolled, a.total_completed,
              a.created_at, a.updated_at,
              (SELECT COUNT(*) FROM automation_steps WHERE automation_id = a.id) AS step_count
       FROM automations a
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    res.json(buildPaginatedResult(dataResult.rows, total, { page, limit, offset }));
  } catch (err) {
    next(err);
  }
}

export async function getAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'automation ID');

    const autoResult = await pool.query(
      `SELECT a.*,
              (SELECT COUNT(*) FROM automation_enrollments WHERE automation_id = a.id AND status = 'active') AS active_enrollments,
              (SELECT COUNT(*) FROM automation_enrollments WHERE automation_id = a.id) AS total_enrollments
       FROM automations a WHERE a.id = $1`,
      [id]
    );
    if (autoResult.rows.length === 0) {
      throw new AppError('Automation not found', 404);
    }

    const stepsResult = await pool.query(
      `SELECT s.*, t.name AS template_name, t.subject AS template_subject
       FROM automation_steps s
       LEFT JOIN templates t ON t.id = s.template_id
       WHERE s.automation_id = $1
       ORDER BY s.step_order`,
      [id]
    );

    res.json({
      ...autoResult.rows[0],
      steps: stepsResult.rows,
    });
  } catch (err) {
    next(err);
  }
}

export async function createAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, description, triggerType, triggerConfig, provider, projectId, steps } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const autoResult = await client.query(
        `INSERT INTO automations (name, description, trigger_type, trigger_config, provider, project_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [name, description || null, triggerType, triggerConfig || {}, provider || 'ses', projectId || null]
      );
      const automation = autoResult.rows[0];

      if (steps && steps.length > 0) {
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          await client.query(
            `INSERT INTO automation_steps (automation_id, step_order, template_id, subject_override, delay_days, delay_hours, delay_minutes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [automation.id, i, step.templateId || null, step.subjectOverride || null, step.delayDays || 0, step.delayHours || 0, step.delayMinutes || 0]
          );
        }
      }

      await client.query('COMMIT');

      // Return the created automation with steps
      const stepsResult = await pool.query(
        `SELECT s.*, t.name AS template_name, t.subject AS template_subject
         FROM automation_steps s
         LEFT JOIN templates t ON t.id = s.template_id
         WHERE s.automation_id = $1
         ORDER BY s.step_order`,
        [automation.id]
      );

      res.status(201).json({ ...automation, steps: stepsResult.rows });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

export async function updateAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'automation ID');

    const existing = await pool.query('SELECT * FROM automations WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw new AppError('Automation not found', 404);
    }
    if (!['draft', 'paused'].includes(existing.rows[0].status)) {
      throw new AppError('Can only edit draft or paused automations', 400);
    }

    const { name, description, triggerType, triggerConfig, provider, projectId, steps } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Build dynamic SET clause
      const setClauses: string[] = ['updated_at = NOW()'];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (name !== undefined) { setClauses.push(`name = $${paramIdx}`); params.push(name); paramIdx++; }
      if (description !== undefined) { setClauses.push(`description = $${paramIdx}`); params.push(description); paramIdx++; }
      if (triggerType !== undefined) { setClauses.push(`trigger_type = $${paramIdx}`); params.push(triggerType); paramIdx++; }
      if (triggerConfig !== undefined) { setClauses.push(`trigger_config = $${paramIdx}`); params.push(JSON.stringify(triggerConfig)); paramIdx++; }
      if (provider !== undefined) { setClauses.push(`provider = $${paramIdx}`); params.push(provider); paramIdx++; }
      if (projectId !== undefined) { setClauses.push(`project_id = $${paramIdx}`); params.push(projectId || null); paramIdx++; }

      params.push(id);
      await client.query(
        `UPDATE automations SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
        params
      );

      // Replace steps if provided
      if (steps !== undefined) {
        await client.query('DELETE FROM automation_steps WHERE automation_id = $1', [id]);
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          await client.query(
            `INSERT INTO automation_steps (automation_id, step_order, template_id, subject_override, delay_days, delay_hours, delay_minutes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [id, i, step.templateId || null, step.subjectOverride || null, step.delayDays || 0, step.delayHours || 0, step.delayMinutes || 0]
          );
        }
      }

      await client.query('COMMIT');

      // Return updated automation with steps
      const autoResult = await pool.query('SELECT * FROM automations WHERE id = $1', [id]);
      const stepsResult = await pool.query(
        `SELECT s.*, t.name AS template_name, t.subject AS template_subject
         FROM automation_steps s
         LEFT JOIN templates t ON t.id = s.template_id
         WHERE s.automation_id = $1
         ORDER BY s.step_order`,
        [id]
      );

      res.json({ ...autoResult.rows[0], steps: stepsResult.rows });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

export async function deleteAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'automation ID');

    const result = await pool.query('DELETE FROM automations WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      throw new AppError('Automation not found', 404);
    }

    res.json({ message: 'Automation deleted' });
  } catch (err) {
    next(err);
  }
}

export async function activateAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'automation ID');

    const existing = await pool.query('SELECT status FROM automations WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw new AppError('Automation not found', 404);
    }
    if (!['draft', 'paused'].includes(existing.rows[0].status)) {
      throw new AppError('Can only activate draft or paused automations', 400);
    }

    // Validate at least 1 step with a template
    const stepCount = await pool.query(
      'SELECT COUNT(*) FROM automation_steps WHERE automation_id = $1 AND template_id IS NOT NULL',
      [id]
    );
    if (parseInt(stepCount.rows[0].count) === 0) {
      throw new AppError('Automation must have at least one step with a template', 400);
    }

    await pool.query(
      "UPDATE automations SET status = 'active', updated_at = NOW() WHERE id = $1",
      [id]
    );

    res.json({ message: 'Automation activated' });
  } catch (err) {
    next(err);
  }
}

export async function pauseAutomation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'automation ID');

    const existing = await pool.query('SELECT status FROM automations WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw new AppError('Automation not found', 404);
    }
    if (existing.rows[0].status !== 'active') {
      throw new AppError('Can only pause active automations', 400);
    }

    await pool.query(
      "UPDATE automations SET status = 'paused', updated_at = NOW() WHERE id = $1",
      [id]
    );

    res.json({ message: 'Automation paused' });
  } catch (err) {
    next(err);
  }
}

export async function enrollContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'automation ID');

    const existing = await pool.query('SELECT status FROM automations WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw new AppError('Automation not found', 404);
    }
    if (existing.rows[0].status !== 'active') {
      throw new AppError('Can only enroll contacts in active automations', 400);
    }

    const { contactIds, listId } = req.body;

    let idsToEnroll: string[] = [];

    if (contactIds && contactIds.length > 0) {
      idsToEnroll = contactIds;
    } else if (listId) {
      validateUUID(listId, 'list ID');
      const members = await pool.query(
        'SELECT contact_id FROM contact_list_members WHERE list_id = $1',
        [listId]
      );
      idsToEnroll = members.rows.map((r: { contact_id: string }) => r.contact_id);
    } else {
      throw new AppError('contactIds or listId required', 400);
    }

    if (idsToEnroll.length === 0) {
      res.json({ message: 'No contacts to enroll', enrolled: 0 });
      return;
    }

    // Get step 0 delay
    const step0 = await pool.query(
      'SELECT delay_days, delay_hours, delay_minutes FROM automation_steps WHERE automation_id = $1 AND step_order = 0',
      [id]
    );
    const delayMs = step0.rows[0]
      ? (step0.rows[0].delay_days * 86400 + step0.rows[0].delay_hours * 3600 + step0.rows[0].delay_minutes * 60) * 1000
      : 0;

    let enrolled = 0;
    for (const contactId of idsToEnroll) {
      const insertResult = await pool.query(
        `INSERT INTO automation_enrollments (automation_id, contact_id, current_step, status, next_step_at)
         VALUES ($1, $2, 0, 'active', NOW() + INTERVAL '1 millisecond' * $3)
         ON CONFLICT (automation_id, contact_id) DO NOTHING
         RETURNING id`,
        [id, contactId, delayMs]
      );
      if (insertResult.rows.length > 0) enrolled++;
    }

    // Update total_enrolled counter
    await pool.query(
      'UPDATE automations SET total_enrolled = (SELECT COUNT(*) FROM automation_enrollments WHERE automation_id = $1), updated_at = NOW() WHERE id = $1',
      [id]
    );

    res.json({ message: `Enrolled ${enrolled} contacts`, enrolled });
  } catch (err) {
    next(err);
  }
}

export async function getEnrollments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'automation ID');

    const { page, limit, offset } = parsePagination(req.query as { page?: string; limit?: string });

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM automation_enrollments WHERE automation_id = $1',
      [id]
    );
    const total = parseInt(countResult.rows[0].count);

    const dataResult = await pool.query(
      `SELECT ae.*, c.email, c.name AS contact_name, c.status AS contact_status
       FROM automation_enrollments ae
       JOIN contacts c ON c.id = ae.contact_id
       WHERE ae.automation_id = $1
       ORDER BY ae.enrolled_at DESC
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    res.json(buildPaginatedResult(dataResult.rows, total, { page, limit, offset }));
  } catch (err) {
    next(err);
  }
}
