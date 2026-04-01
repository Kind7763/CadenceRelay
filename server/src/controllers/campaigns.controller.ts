import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { pool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { parsePagination, buildPaginatedResult } from '../utils/pagination';
import { campaignDispatchQueue } from '../queues/emailQueue';
import { verifyAdminPassword } from '../utils/adminAuth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id: string, label = 'ID'): void {
  if (!UUID_RE.test(id)) {
    throw new AppError(`Invalid ${label} format`, 400);
  }
}

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function listCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { page, limit, offset } = parsePagination(req.query as { page?: string; limit?: string });
    const { status, search, archived, starred, label_name: labelName, project_id: projectId } = req.query;

    let whereClause = 'WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    // Default: exclude archived unless archived=true is passed
    if (archived === 'true') {
      whereClause += ` AND c.is_archived = true`;
    } else {
      whereClause += ` AND (c.is_archived = false OR c.is_archived IS NULL)`;
    }

    if (starred === 'true') {
      whereClause += ` AND c.is_starred = true`;
    }

    if (labelName) {
      whereClause += ` AND c.label_name = $${idx}`;
      params.push(labelName);
      idx++;
    }

    if (status) {
      whereClause += ` AND c.status = $${idx}`;
      params.push(status);
      idx++;
    }

    if (search) {
      whereClause += ` AND c.name ILIKE $${idx}`;
      params.push(`%${search}%`);
      idx++;
    }

    if (projectId === 'none') {
      whereClause += ` AND c.project_id IS NULL`;
    } else if (projectId && typeof projectId === 'string' && UUID_RE.test(projectId)) {
      whereClause += ` AND c.project_id = $${idx}`;
      params.push(projectId);
      idx++;
    }

    const countResult = await pool.query(`SELECT COUNT(*) FROM campaigns c ${whereClause}`, params);
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT c.*, t.name as template_name, cl.name as list_name
       FROM campaigns c
       LEFT JOIN templates t ON t.id = c.template_id
       LEFT JOIN contact_lists cl ON cl.id = c.list_id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json(buildPaginatedResult(result.rows, total, { page, limit, offset }));
  } catch (err) {
    next(err);
  }
}

export async function getCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');
    const result = await pool.query(
      `SELECT c.*, t.name as template_name, t.subject as template_subject, t.html_body as template_html_body, cl.name as list_name
       FROM campaigns c
       LEFT JOIN templates t ON t.id = c.template_id
       LEFT JOIN contact_lists cl ON cl.id = c.list_id
       WHERE c.id = $1`,
      [id]
    );
    if (result.rows.length === 0) throw new AppError('Campaign not found', 404);
    res.json({ campaign: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function createCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, templateId, listId, provider, throttlePerSecond, throttlePerHour, projectId: rawProjectId } = req.body;

    // Handle file attachments from multer
    const files = (req.files as Express.Multer.File[]) || [];
    const attachments = files.map((file) => {
      // Save file to disk with unique name
      const ext = path.extname(file.originalname);
      const storedName = `${Date.now()}-${Math.random().toString(36).substring(2)}${ext}`;
      const storedPath = path.join(UPLOAD_DIR, storedName);
      fs.writeFileSync(storedPath, file.buffer);

      return {
        filename: file.originalname,
        storagePath: storedPath,
        size: file.size,
        contentType: file.mimetype,
      };
    });

    // Allow empty templateId/listId for draft campaigns
    const finalTemplateId = templateId && UUID_RE.test(templateId) ? templateId : null;
    const finalListId = listId && UUID_RE.test(listId) ? listId : null;
    const finalProjectId = rawProjectId && UUID_RE.test(rawProjectId) ? rawProjectId : null;

    const result = await pool.query(
      `INSERT INTO campaigns (name, template_id, list_id, provider, throttle_per_second, throttle_per_hour, attachments, project_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, finalTemplateId, finalListId, provider || 'ses', throttlePerSecond || 5, throttlePerHour || 5000, JSON.stringify(attachments), finalProjectId]
    );

    res.status(201).json({ campaign: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function updateCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');
    const { name, templateId, listId, provider, throttlePerSecond, throttlePerHour, description } = req.body;

    const existing = await pool.query('SELECT status FROM campaigns WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError('Campaign not found', 404);

    const isDraftOrScheduled = ['draft', 'scheduled'].includes(existing.rows[0].status);

    // Campaign settings (template, list, provider, throttle) can only be changed on draft/scheduled
    if (!isDraftOrScheduled && (templateId || listId || provider || throttlePerSecond || throttlePerHour)) {
      throw new AppError('Can only change template, list, provider, and throttle settings on draft or scheduled campaigns', 400);
    }

    // Name and description can always be updated (for organization purposes)
    const result = await pool.query(
      `UPDATE campaigns SET
        name = COALESCE($1, name),
        template_id = COALESCE($2, template_id),
        list_id = COALESCE($3, list_id),
        provider = COALESCE($4, provider),
        throttle_per_second = COALESCE($5, throttle_per_second),
        throttle_per_hour = COALESCE($6, throttle_per_hour),
        description = COALESCE($7, description),
        updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [name, isDraftOrScheduled ? templateId : null, isDraftOrScheduled ? listId : null,
       isDraftOrScheduled ? provider : null, isDraftOrScheduled ? throttlePerSecond : null,
       isDraftOrScheduled ? throttlePerHour : null, description, id]
    );

    res.json({ campaign: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function deleteCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');
    const { adminPassword } = req.body;
    await verifyAdminPassword(adminPassword);

    const existing = await pool.query('SELECT id, attachments FROM campaigns WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError('Campaign not found', 404);

    // Clean up attachment files from disk
    const attachments = existing.rows[0].attachments || [];
    for (const att of attachments) {
      if (att.storagePath && fs.existsSync(att.storagePath)) {
        fs.unlinkSync(att.storagePath);
      }
    }

    // Manually delete child records (email_events & unsubscribes lack ON DELETE CASCADE)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM unsubscribes WHERE campaign_id = $1', [id]);
      await client.query('DELETE FROM email_events WHERE campaign_id = $1', [id]);
      await client.query('DELETE FROM campaign_recipients WHERE campaign_id = $1', [id]);
      await client.query('DELETE FROM campaigns WHERE id = $1', [id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ message: 'Campaign deleted' });
  } catch (err) {
    next(err);
  }
}

export async function bulkDeleteCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { ids, adminPassword } = req.body;
    await verifyAdminPassword(adminPassword);

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new AppError('ids must be a non-empty array', 400);
    }
    for (const id of ids) {
      validateUUID(id, 'campaign ID');
    }

    // Clean up attachment files from disk
    const campaigns = await pool.query('SELECT id, attachments FROM campaigns WHERE id = ANY($1)', [ids]);
    for (const campaign of campaigns.rows) {
      const attachments = campaign.attachments || [];
      for (const att of attachments) {
        if (att.storagePath && fs.existsSync(att.storagePath)) {
          fs.unlinkSync(att.storagePath);
        }
      }
    }

    // Manually delete child records (email_events & unsubscribes lack ON DELETE CASCADE)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM unsubscribes WHERE campaign_id = ANY($1)', [ids]);
      await client.query('DELETE FROM email_events WHERE campaign_id = ANY($1)', [ids]);
      await client.query('DELETE FROM campaign_recipients WHERE campaign_id = ANY($1)', [ids]);
      const result = await client.query('DELETE FROM campaigns WHERE id = ANY($1)', [ids]);
      await client.query('COMMIT');
      res.json({ message: `${result.rowCount} campaign(s) deleted` });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
}

export async function scheduleCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');
    const { scheduledAt } = req.body;

    // FIX: Validate scheduledAt is in the future
    if (!scheduledAt) {
      throw new AppError('scheduledAt is required', 400);
    }
    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      throw new AppError('scheduledAt must be a valid date', 400);
    }
    if (scheduledDate <= new Date()) {
      throw new AppError('scheduledAt must be in the future', 400);
    }

    const existing = await pool.query('SELECT status, template_id, list_id FROM campaigns WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError('Campaign not found', 404);
    if (!['draft', 'scheduled'].includes(existing.rows[0].status)) {
      throw new AppError('Can only schedule draft or already-scheduled campaigns', 400);
    }
    if (!existing.rows[0].template_id || !existing.rows[0].list_id) {
      throw new AppError('Campaign must have a template and list before scheduling', 400);
    }

    // FIX: Validate template and list still exist
    const templateCheck = await pool.query('SELECT id FROM templates WHERE id = $1 AND is_active = true', [existing.rows[0].template_id]);
    if (templateCheck.rows.length === 0) {
      throw new AppError('The assigned template no longer exists or has been deactivated', 400);
    }
    const listCheck = await pool.query('SELECT id FROM contact_lists WHERE id = $1', [existing.rows[0].list_id]);
    if (listCheck.rows.length === 0) {
      throw new AppError('The assigned contact list no longer exists', 400);
    }

    await pool.query(
      'UPDATE campaigns SET status = $1, scheduled_at = $2, updated_at = NOW() WHERE id = $3',
      ['scheduled', scheduledAt, id]
    );

    res.json({ message: 'Campaign scheduled', scheduledAt });
  } catch (err) {
    next(err);
  }
}

export async function sendCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');

    const existing = await pool.query('SELECT status, template_id, list_id FROM campaigns WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError('Campaign not found', 404);
    if (!['draft', 'scheduled'].includes(existing.rows[0].status)) {
      throw new AppError('Campaign is already sending or completed', 400);
    }
    if (!existing.rows[0].template_id || !existing.rows[0].list_id) {
      throw new AppError('Campaign must have a template and list', 400);
    }

    // FIX: Validate template and list still exist before sending
    const templateCheck = await pool.query('SELECT id FROM templates WHERE id = $1 AND is_active = true', [existing.rows[0].template_id]);
    if (templateCheck.rows.length === 0) {
      throw new AppError('The assigned template no longer exists or has been deactivated', 400);
    }
    const listCheck = await pool.query('SELECT id FROM contact_lists WHERE id = $1', [existing.rows[0].list_id]);
    if (listCheck.rows.length === 0) {
      throw new AppError('The assigned contact list no longer exists', 400);
    }

    await pool.query(
      "UPDATE campaigns SET status = 'sending', started_at = NOW(), updated_at = NOW() WHERE id = $1",
      [id]
    );

    await campaignDispatchQueue.add('dispatch', { campaignId: id });

    res.json({ message: 'Campaign sending started' });
  } catch (err) {
    next(err);
  }
}

export async function pauseCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');
    const result = await pool.query(
      "UPDATE campaigns SET status = 'paused', updated_at = NOW() WHERE id = $1 AND status = 'sending' RETURNING id",
      [id]
    );
    if (result.rows.length === 0) throw new AppError('Campaign not found or not currently sending', 400);
    res.json({ message: 'Campaign paused' });
  } catch (err) {
    next(err);
  }
}

export async function resumeCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');

    // FIX: Validate template and list still exist before resuming
    const existing = await pool.query('SELECT template_id, list_id FROM campaigns WHERE id = $1 AND status = $2', [id, 'paused']);
    if (existing.rows.length === 0) throw new AppError('Campaign not found or not paused', 400);

    const templateCheck = await pool.query('SELECT id FROM templates WHERE id = $1 AND is_active = true', [existing.rows[0].template_id]);
    if (templateCheck.rows.length === 0) {
      throw new AppError('The assigned template no longer exists or has been deactivated', 400);
    }
    const listCheck = await pool.query('SELECT id FROM contact_lists WHERE id = $1', [existing.rows[0].list_id]);
    if (listCheck.rows.length === 0) {
      throw new AppError('The assigned contact list no longer exists', 400);
    }

    await pool.query(
      "UPDATE campaigns SET status = 'sending', updated_at = NOW() WHERE id = $1",
      [id]
    );

    await campaignDispatchQueue.add('dispatch', { campaignId: id });
    res.json({ message: 'Campaign resumed' });
  } catch (err) {
    next(err);
  }
}

export async function addAttachments(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');

    const existing = await pool.query('SELECT status, attachments FROM campaigns WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError('Campaign not found', 404);
    if (!['draft', 'scheduled'].includes(existing.rows[0].status)) {
      throw new AppError('Can only add attachments to draft or scheduled campaigns', 400);
    }

    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) throw new AppError('No files uploaded', 400);

    const currentAttachments = existing.rows[0].attachments || [];

    const newAttachments = files.map((file) => {
      const ext = path.extname(file.originalname);
      const storedName = `${Date.now()}-${Math.random().toString(36).substring(2)}${ext}`;
      const storedPath = path.join(UPLOAD_DIR, storedName);
      fs.writeFileSync(storedPath, file.buffer);

      return {
        filename: file.originalname,
        storagePath: storedPath,
        size: file.size,
        contentType: file.mimetype,
      };
    });

    const allAttachments = [...currentAttachments, ...newAttachments];

    await pool.query(
      'UPDATE campaigns SET attachments = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(allAttachments), id]
    );

    res.json({ attachments: allAttachments });
  } catch (err) {
    next(err);
  }
}

export async function removeAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, index } = req.params;
    validateUUID(id, 'campaign ID');
    const idx = parseInt(index);

    const existing = await pool.query('SELECT status, attachments FROM campaigns WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError('Campaign not found', 404);
    if (!['draft', 'scheduled'].includes(existing.rows[0].status)) {
      throw new AppError('Can only remove attachments from draft or scheduled campaigns', 400);
    }

    const attachments = existing.rows[0].attachments || [];
    if (isNaN(idx) || idx < 0 || idx >= attachments.length) {
      throw new AppError('Invalid attachment index', 400);
    }

    // Delete file from disk
    const removed = attachments[idx];
    if (removed.storagePath && fs.existsSync(removed.storagePath)) {
      fs.unlinkSync(removed.storagePath);
    }

    attachments.splice(idx, 1);

    await pool.query(
      'UPDATE campaigns SET attachments = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(attachments), id]
    );

    res.json({ attachments, removed: removed.filename });
  } catch (err) {
    next(err);
  }
}

export async function downloadAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, index } = req.params;
    validateUUID(id, 'campaign ID');

    const idx = parseInt(index);
    if (isNaN(idx) || idx < 0) {
      throw new AppError('Invalid attachment index', 400);
    }

    const result = await pool.query('SELECT attachments FROM campaigns WHERE id = $1', [id]);
    if (result.rows.length === 0) throw new AppError('Campaign not found', 404);

    const attachments = result.rows[0].attachments || [];
    if (idx >= attachments.length) {
      throw new AppError('Attachment not found', 404);
    }

    const attachment = attachments[idx];
    const filePath = attachment.storagePath;

    if (!filePath || !fs.existsSync(filePath)) {
      throw new AppError('Attachment file not found on disk', 404);
    }

    const contentType = attachment.contentType || 'application/octet-stream';
    const filename = attachment.filename || `attachment-${idx}`;

    // Determine disposition: inline for preview (images/PDFs) or attachment for download
    const inline = req.query.inline === 'true';
    const inlineAllowed = /^(image\/|application\/pdf)/.test(contentType);
    const disposition = inline && inlineAllowed ? 'inline' : 'attachment';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(filename)}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function duplicateCampaign(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');

    const existing = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError('Campaign not found', 404);

    const source = existing.rows[0];

    // Copy attachment files on disk
    const sourceAttachments: Array<{ filename: string; storagePath: string; size: number; contentType: string }> = source.attachments || [];
    const newAttachments = sourceAttachments.map((att) => {
      if (att.storagePath && fs.existsSync(att.storagePath)) {
        const ext = path.extname(att.storagePath);
        const newName = `${Date.now()}-${Math.random().toString(36).substring(2)}${ext}`;
        const newPath = path.join(UPLOAD_DIR, newName);
        fs.copyFileSync(att.storagePath, newPath);
        return { ...att, storagePath: newPath };
      }
      return att;
    });

    const result = await pool.query(
      `INSERT INTO campaigns (
        name, template_id, list_id, provider, status,
        throttle_per_second, throttle_per_hour, description,
        label_name, label_color, attachments, project_id, dynamic_variables
      ) VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        `Copy of ${source.name}`,
        source.template_id,
        source.list_id,
        source.provider,
        source.throttle_per_second,
        source.throttle_per_hour,
        source.description,
        source.label_name,
        source.label_color,
        JSON.stringify(newAttachments),
        source.project_id || null,
        source.dynamic_variables ? JSON.stringify(source.dynamic_variables) : '[]',
      ]
    );

    res.status(201).json({ campaign: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function toggleStar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');

    const result = await pool.query(
      `UPDATE campaigns SET is_starred = NOT COALESCE(is_starred, false), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) throw new AppError('Campaign not found', 404);

    res.json({ campaign: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function toggleArchive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');

    const result = await pool.query(
      `UPDATE campaigns SET is_archived = NOT COALESCE(is_archived, false), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) throw new AppError('Campaign not found', 404);

    res.json({ campaign: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function updateLabel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');
    const { name, color } = req.body as { name?: string; color?: string };

    // If both are empty/null, remove the label
    const labelName = name || null;
    const labelColor = color || null;

    const result = await pool.query(
      `UPDATE campaigns SET label_name = $1, label_color = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [labelName, labelColor, id]
    );
    if (result.rows.length === 0) throw new AppError('Campaign not found', 404);

    res.json({ campaign: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

// ── Campaign Labels CRUD ──

export async function listLabels(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await pool.query('SELECT * FROM campaign_labels ORDER BY created_at ASC');
    res.json({ labels: result.rows });
  } catch (err) {
    next(err);
  }
}

export async function createLabel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, color } = req.body as { name: string; color?: string };
    if (!name) throw new AppError('Label name is required', 400);

    const result = await pool.query(
      'INSERT INTO campaign_labels (name, color) VALUES ($1, $2) RETURNING *',
      [name, color || '#6B7280']
    );

    res.status(201).json({ label: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function deleteLabel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'label ID');

    const result = await pool.query('DELETE FROM campaign_labels WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) throw new AppError('Label not found', 404);

    res.json({ message: 'Label deleted' });
  } catch (err) {
    next(err);
  }
}

export async function getCampaignRecipients(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');
    const { page, limit, offset } = parsePagination(req.query as { page?: string; limit?: string });
    const { status, excludeEmails } = req.query;

    let whereClause = 'WHERE cr.campaign_id = $1';
    const params: unknown[] = [id];
    let idx = 2;

    if (status) {
      whereClause += ` AND cr.status = $${idx}`;
      params.push(status);
      idx++;
    }

    // Exclude specific contacts (useful for filtering out test sends)
    if (excludeEmails) {
      const emails = (excludeEmails as string).split(',').map((e) => e.trim().toLowerCase());
      if (emails.length > 0) {
        whereClause += ` AND LOWER(cr.email) != ALL($${idx})`;
        params.push(emails);
        idx++;
      }
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM campaign_recipients cr ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await pool.query(
      `SELECT cr.* FROM campaign_recipients cr ${whereClause}
       ORDER BY cr.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json(buildPaginatedResult(result.rows, total, { page, limit, offset }));
  } catch (err) {
    next(err);
  }
}

// ── Dynamic Variables ──

export async function updateDynamicVariables(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');
    const { dynamicVariables } = req.body;

    if (!Array.isArray(dynamicVariables)) {
      throw new AppError('dynamicVariables must be an array', 400);
    }

    const validTypes = ['counter', 'date', 'pattern', 'random', 'text'];
    for (const v of dynamicVariables) {
      if (!v.key || typeof v.key !== 'string') throw new AppError('Each dynamic variable must have a "key"', 400);
      if (!validTypes.includes(v.type)) throw new AppError(`Invalid type "${v.type}". Must be: ${validTypes.join(', ')}`, 400);
    }

    const result = await pool.query(
      'UPDATE campaigns SET dynamic_variables = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(dynamicVariables), id]
    );
    if (result.rows.length === 0) throw new AppError('Campaign not found', 404);

    res.json({ campaign: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function previewDynamicVariables(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');

    const campResult = await pool.query('SELECT dynamic_variables FROM campaigns WHERE id = $1', [id]);
    if (campResult.rows.length === 0) throw new AppError('Campaign not found', 404);

    const dynamicVarDefs = campResult.rows[0].dynamic_variables || [];
    if (!Array.isArray(dynamicVarDefs) || dynamicVarDefs.length === 0) {
      res.json({ previews: [] });
      return;
    }

    const previews: Array<{ position: number; variables: Record<string, string> }> = [];
    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, '0');

    for (const pos of [0, 1, 2, 9, 49, 99]) {
      const vars: Record<string, string> = {};
      for (const def of dynamicVarDefs) {
        switch (def.type) {
          case 'counter': {
            const start = def.startValue ?? 1;
            const increment = def.increment ?? 1;
            let val = start + (pos * increment);
            let formatted = String(val);
            if (def.padding > 0) formatted = formatted.padStart(def.padding, '0');
            if (def.prefix) formatted = def.prefix + formatted;
            if (def.suffix) formatted = formatted + def.suffix;
            vars[def.key] = formatted;
            break;
          }
          case 'date': {
            const fmt = def.format || 'YYYY-MM-DD';
            const dateStr = fmt
              .replace('YYYY', String(now.getFullYear()))
              .replace('MM', pad2(now.getMonth() + 1))
              .replace('DD', pad2(now.getDate()))
              .replace('HH', pad2(now.getHours()))
              .replace('mm', pad2(now.getMinutes()))
              .replace('Month', now.toLocaleString('en', { month: 'long' }))
              .replace('Day', now.toLocaleString('en', { weekday: 'long' }));
            vars[def.key] = (def.prefix || '') + dateStr + (def.suffix || '');
            break;
          }
          case 'pattern': {
            const values = def.values || [];
            if (values.length > 0) vars[def.key] = values[pos % values.length];
            break;
          }
          case 'random': {
            const values = def.values || [];
            if (values.length > 0) vars[def.key] = values[Math.floor(Math.random() * values.length)];
            break;
          }
          case 'text': {
            vars[def.key] = (def.prefix || '') + (def.value || '') + (def.suffix || '');
            break;
          }
        }
      }
      previews.push({ position: pos, variables: vars });
    }

    res.json({ previews });
  } catch (err) {
    next(err);
  }
}

export async function resendToNonOpeners(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'campaign ID');
    const { subject } = req.body as { subject?: string };

    // Load original campaign
    const existing = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError('Campaign not found', 404);
    const source = existing.rows[0];

    if (source.status !== 'completed') {
      throw new AppError('Can only resend to non-openers for completed campaigns', 400);
    }

    // Count non-openers
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM campaign_recipients
       WHERE campaign_id = $1 AND opened_at IS NULL AND status IN ('sent', 'delivered')`,
      [id]
    );
    const nonOpenerCount = parseInt(countResult.rows[0].count);

    if (nonOpenerCount === 0) {
      throw new AppError('No non-openers found for this campaign', 400);
    }

    // Copy attachment files on disk
    const sourceAttachments: Array<{ filename: string; storagePath: string; size: number; contentType: string }> = source.attachments || [];
    const newAttachments = sourceAttachments.map((att) => {
      if (att.storagePath && fs.existsSync(att.storagePath)) {
        const ext = path.extname(att.storagePath);
        const newName = `${Date.now()}-${Math.random().toString(36).substring(2)}${ext}`;
        const newPath = path.join(UPLOAD_DIR, newName);
        fs.copyFileSync(att.storagePath, newPath);
        return { ...att, storagePath: newPath };
      }
      return att;
    });

    // Create new campaign (copy from original)
    const newName = subject ? `Re: ${source.name}` : `Re: ${source.name}`;
    const campaignResult = await pool.query(
      `INSERT INTO campaigns (
        name, template_id, list_id, provider, status,
        throttle_per_second, throttle_per_hour, description,
        label_name, label_color, attachments, project_id, dynamic_variables
      ) VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        newName,
        source.template_id,
        source.list_id,
        source.provider,
        source.throttle_per_second,
        source.throttle_per_hour,
        `Resend to non-openers of "${source.name}"`,
        source.label_name,
        source.label_color,
        JSON.stringify(newAttachments),
        source.project_id || null,
        source.dynamic_variables ? JSON.stringify(source.dynamic_variables) : '[]',
      ]
    );
    const newCampaign = campaignResult.rows[0];

    // Create campaign_recipients directly for the new campaign from non-openers
    const insertResult = await pool.query(
      `INSERT INTO campaign_recipients (campaign_id, contact_id, email, tracking_token)
       SELECT $1, cr.contact_id, cr.email, encode(gen_random_bytes(16), 'hex')
       FROM campaign_recipients cr
       WHERE cr.campaign_id = $2
         AND cr.opened_at IS NULL
         AND cr.status IN ('sent', 'delivered')
         AND cr.contact_id IS NOT NULL`,
      [newCampaign.id, id]
    );

    const recipientCount = insertResult.rowCount ?? 0;

    // Update total_recipients on the new campaign
    await pool.query(
      'UPDATE campaigns SET total_recipients = $1, updated_at = NOW() WHERE id = $2',
      [recipientCount, newCampaign.id]
    );

    // Re-fetch the campaign with updated total_recipients
    const finalResult = await pool.query(
      `SELECT c.*, t.name as template_name, t.subject as template_subject, cl.name as list_name
       FROM campaigns c
       LEFT JOIN templates t ON t.id = c.template_id
       LEFT JOIN contact_lists cl ON cl.id = c.list_id
       WHERE c.id = $1`,
      [newCampaign.id]
    );

    res.status(201).json({ campaign: finalResult.rows[0] });
  } catch (err) {
    next(err);
  }
}
