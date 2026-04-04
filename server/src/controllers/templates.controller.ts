import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { detectVariables, renderTemplate, htmlToPlainText } from '../utils/templateRenderer';
import { checkSpamScore } from '../utils/spamChecker';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateUUID(id: string, label = 'ID'): void {
  if (!UUID_RE.test(id)) {
    throw new AppError(`Invalid ${label} format`, 400);
  }
}

export async function listTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { project_id: projectId, archived } = req.query;
    const showArchived = archived === 'true';
    let query = `SELECT id, name, subject, html_body, text_body, variables, version, is_active, project_id, created_at, updated_at FROM templates WHERE is_active = ${showArchived ? 'false' : 'true'}`;
    const params: unknown[] = [];

    if (projectId === 'none') {
      query += ' AND project_id IS NULL';
    } else if (projectId && typeof projectId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      query += ' AND project_id = $1';
      params.push(projectId);
    }

    query += ' ORDER BY updated_at DESC';
    const result = await pool.query(query, params);
    res.json({ templates: result.rows });
  } catch (err) {
    next(err);
  }
}

export async function getTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'template ID');
    const result = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
    if (result.rows.length === 0) throw new AppError('Template not found', 404);
    res.json({ template: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function createTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, subject, htmlBody, textBody, projectId } = req.body;
    const variables = detectVariables(htmlBody);
    const finalProjectId = projectId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId) ? projectId : null;
    const finalTextBody = textBody || htmlToPlainText(htmlBody);

    const result = await pool.query(
      'INSERT INTO templates (name, subject, html_body, text_body, variables, project_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, subject, htmlBody, finalTextBody, JSON.stringify(variables), finalProjectId]
    );

    const template = result.rows[0];

    // Create first version entry
    await pool.query(
      'INSERT INTO template_versions (template_id, version, subject, html_body, text_body, variables) VALUES ($1, 1, $2, $3, $4, $5)',
      [template.id, subject, htmlBody, finalTextBody, JSON.stringify(variables)]
    );

    res.status(201).json({ template });
  } catch (err) {
    next(err);
  }
}

export async function updateTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'template ID');
    const { name, subject, htmlBody, textBody } = req.body;

    const existing = await pool.query('SELECT * FROM templates WHERE id = $1', [id]);
    if (existing.rows.length === 0) throw new AppError('Template not found', 404);

    const newVersion = existing.rows[0].version + 1;

    // FIX: Always detect variables from the ACTUAL body being saved, not conditionally.
    // Determine the effective html_body that will be stored after COALESCE.
    const effectiveHtmlBody = htmlBody || existing.rows[0].html_body;
    const variables = detectVariables(effectiveHtmlBody);
    const finalTextBody = textBody || htmlToPlainText(effectiveHtmlBody);

    const result = await pool.query(
      `UPDATE templates SET
        name = COALESCE($1, name),
        subject = COALESCE($2, subject),
        html_body = COALESCE($3, html_body),
        text_body = $4,
        variables = $5,
        version = $6,
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [name, subject, htmlBody, finalTextBody, JSON.stringify(variables), newVersion, id]
    );

    // Save version
    const t = result.rows[0];
    await pool.query(
      'INSERT INTO template_versions (template_id, version, subject, html_body, text_body, variables) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, newVersion, t.subject, t.html_body, t.text_body, JSON.stringify(variables)]
    );

    res.json({ template: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function toggleArchiveTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'template ID');
    const result = await pool.query(
      'UPDATE templates SET is_active = NOT is_active, updated_at = NOW() WHERE id = $1 RETURNING id, is_active',
      [id]
    );
    if (result.rows.length === 0) throw new AppError('Template not found', 404);
    const isActive = result.rows[0].is_active;
    res.json({ message: isActive ? 'Template restored' : 'Template archived', is_active: isActive });
  } catch (err) {
    next(err);
  }
}

export async function deleteTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'template ID');
    const result = await pool.query(
      'UPDATE templates SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) throw new AppError('Template not found', 404);
    res.json({ message: 'Template deleted' });
  } catch (err) {
    next(err);
  }
}

export async function getTemplateVersions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'template ID');
    const result = await pool.query(
      'SELECT id, version, subject, label, created_at FROM template_versions WHERE template_id = $1 ORDER BY version DESC',
      [id]
    );
    res.json({ versions: result.rows });
  } catch (err) {
    next(err);
  }
}

export async function getTemplateVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, version } = req.params;
    validateUUID(id, 'template ID');

    // FIX: Validate that version is a valid number
    const versionNum = parseInt(version);
    if (isNaN(versionNum) || versionNum < 1) {
      throw new AppError('Invalid version number', 400);
    }

    const result = await pool.query(
      'SELECT * FROM template_versions WHERE template_id = $1 AND version = $2',
      [id, versionNum]
    );
    if (result.rows.length === 0) throw new AppError('Version not found', 404);
    res.json({ version: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * Restore a template to a previous version — creates a NEW version with the old content
 */
export async function restoreVersion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, version } = req.params;
    validateUUID(id, 'template ID');
    const versionNum = parseInt(version);
    if (isNaN(versionNum) || versionNum < 1) throw new AppError('Invalid version number', 400);

    // Get the old version's content
    const oldVersion = await pool.query(
      'SELECT subject, html_body, text_body, variables FROM template_versions WHERE template_id = $1 AND version = $2',
      [id, versionNum]
    );
    if (oldVersion.rows.length === 0) throw new AppError('Version not found', 404);

    const old = oldVersion.rows[0];

    // Get current version number
    const current = await pool.query('SELECT version FROM templates WHERE id = $1', [id]);
    if (current.rows.length === 0) throw new AppError('Template not found', 404);

    const newVersionNum = current.rows[0].version + 1;

    // Ensure variables is properly stringified for jsonb column
    const variablesJson = typeof old.variables === 'string' ? old.variables : JSON.stringify(old.variables || []);

    // Update the main template with old version's content
    await pool.query(
      `UPDATE templates SET subject = $1, html_body = $2, text_body = $3, variables = $4, version = $5, updated_at = NOW() WHERE id = $6`,
      [old.subject, old.html_body, old.text_body, variablesJson, newVersionNum, id]
    );

    // Create a new version entry (labeled as restored)
    await pool.query(
      `INSERT INTO template_versions (template_id, version, subject, html_body, text_body, variables, label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, newVersionNum, old.subject, old.html_body, old.text_body, variablesJson, `Restored from v${versionNum}`]
    );

    res.json({ message: `Restored to v${versionNum} as new v${newVersionNum}`, version: newVersionNum });
  } catch (err) {
    next(err);
  }
}

/**
 * Update a version's label/nickname
 */
export async function updateVersionLabel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, version } = req.params;
    validateUUID(id, 'template ID');
    const versionNum = parseInt(version);
    if (isNaN(versionNum) || versionNum < 1) throw new AppError('Invalid version number', 400);

    const { label } = req.body;
    if (typeof label !== 'string') throw new AppError('Label must be a string', 400);

    const result = await pool.query(
      'UPDATE template_versions SET label = $1 WHERE template_id = $2 AND version = $3 RETURNING id',
      [label.trim().substring(0, 100) || null, id, versionNum]
    );
    if (result.rows.length === 0) throw new AppError('Version not found', 404);

    res.json({ message: 'Label updated' });
  } catch (err) {
    next(err);
  }
}

export async function spamCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    let subject: string;
    let html: string;

    let hasPlainText = false;

    if (id) {
      // Check a saved template by ID
      validateUUID(id, 'template ID');
      const result = await pool.query('SELECT subject, html_body, text_body FROM templates WHERE id = $1', [id]);
      if (result.rows.length === 0) throw new AppError('Template not found', 404);
      subject = result.rows[0].subject;
      html = result.rows[0].html_body;
      hasPlainText = !!result.rows[0].text_body;
    } else {
      // Ad-hoc check from body
      subject = req.body.subject || '';
      html = req.body.html || '';
      hasPlainText = !!req.body.hasPlainText;
      if (!subject && !html) {
        throw new AppError('Either subject or html is required', 400);
      }
    }

    const result = checkSpamScore(subject, html, hasPlainText);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function previewTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    validateUUID(id, 'template ID');
    const { data } = req.body;

    const result = await pool.query('SELECT html_body FROM templates WHERE id = $1', [id]);
    if (result.rows.length === 0) throw new AppError('Template not found', 404);

    const sampleData = data || { school_name: 'Example School', email: 'test@example.com', name: 'John Doe' };
    const rendered = renderTemplate(result.rows[0].html_body, sampleData);

    res.json({ html: rendered });
  } catch (err) {
    next(err);
  }
}
