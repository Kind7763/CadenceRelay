import { Worker, Job, UnrecoverableError } from 'bullmq';
import fs from 'fs';
import { config } from '../config';
import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { generateTrackingToken } from '../utils/crypto';
import { renderTemplate } from '../utils/templateRenderer';
import { createProvider } from '../services/email/providerFactory';
import { emailSendQueue, campaignDispatchQueue } from '../queues/emailQueue';
import {
  PermanentBounceError, TemporaryBounceError, RateLimitError, AuthenticationError,
  EmailAttachment,
} from '../services/email/EmailProvider';
import { checkDailyLimit, incrementDailySend } from '../utils/dailyLimits';
import { isEmailSuppressed } from '../controllers/suppression.controller';

interface DispatchJobData {
  campaignId: string;
}

interface AttachmentMeta {
  filename: string;
  storagePath: string;
  size: number;
  contentType: string;
}

interface SendJobData {
  campaignRecipientId: string;
  campaignId: string;
  email: string;
  subject: string;
  html: string;
  text: string | null;
  provider: string;
  providerConfig: Record<string, unknown>;
  trackingToken: string;
  trackingDomain: string;
  attachments?: AttachmentMeta[];
  replyTo?: string;
}

// --- Shared helpers for dispatch & A/B winner ---

interface DynVarDef {
  key: string;
  type: 'counter' | 'date' | 'pattern' | 'random' | 'text';
  startValue?: number;
  increment?: number;
  padding?: number;
  prefix?: string;
  suffix?: string;
  format?: string;
  values?: string[];
  value?: string;
}

function buildDynamicVarResolver(dynamicVarDefs: DynVarDef[]) {
  const counterState: Record<string, number> = {};
  for (const def of dynamicVarDefs) {
    if (def.type === 'counter') {
      counterState[def.key] = def.startValue ?? 1;
    }
  }

  return function resolveDynamicVars(index: number): Record<string, string> {
    const vars: Record<string, string> = {};
    const now = new Date();
    for (const def of dynamicVarDefs) {
      switch (def.type) {
        case 'counter': {
          let val = counterState[def.key] ?? (def.startValue ?? 1);
          let formatted = String(val);
          if (def.padding && def.padding > 0) {
            formatted = formatted.padStart(def.padding, '0');
          }
          if (def.prefix) formatted = def.prefix + formatted;
          if (def.suffix) formatted = formatted + def.suffix;
          vars[def.key] = formatted;
          counterState[def.key] = val + (def.increment ?? 1);
          break;
        }
        case 'date': {
          const fmt = def.format || 'YYYY-MM-DD';
          const pad = (n: number) => String(n).padStart(2, '0');
          const dateStr = fmt
            .replace('YYYY', String(now.getFullYear()))
            .replace('YY', String(now.getFullYear()).slice(-2))
            .replace('MM', pad(now.getMonth() + 1))
            .replace('DD', pad(now.getDate()))
            .replace('HH', pad(now.getHours()))
            .replace('mm', pad(now.getMinutes()))
            .replace('ss', pad(now.getSeconds()))
            .replace('Month', now.toLocaleString('en', { month: 'long' }))
            .replace('Mon', now.toLocaleString('en', { month: 'short' }))
            .replace('Day', now.toLocaleString('en', { weekday: 'long' }))
            .replace('Dy', now.toLocaleString('en', { weekday: 'short' }));
          vars[def.key] = (def.prefix || '') + dateStr + (def.suffix || '');
          break;
        }
        case 'pattern': {
          const values = def.values || [];
          if (values.length > 0) {
            vars[def.key] = values[index % values.length];
          }
          break;
        }
        case 'random': {
          const values = def.values || [];
          if (values.length > 0) {
            vars[def.key] = values[Math.floor(Math.random() * values.length)];
          }
          break;
        }
        case 'text': {
          vars[def.key] = (def.prefix || '') + (def.value || '') + (def.suffix || '');
          break;
        }
      }
    }
    return vars;
  };
}

function buildContactVariables(contact: Record<string, unknown>): Record<string, string> {
  const variables: Record<string, string> = {
    school_name: (contact.name as string) || '',
    name: (contact.name as string) || '',
    email: (contact.email as string) || '',
    state: (contact.state as string) || '',
    district: (contact.district as string) || '',
    block: (contact.block as string) || '',
    classes: (contact.classes as string) || '',
    category: (contact.category as string) || '',
    management: (contact.management as string) || '',
    address: (contact.address as string) || '',
  };
  if (contact.metadata && typeof contact.metadata === 'object') {
    for (const [key, val] of Object.entries(contact.metadata as Record<string, unknown>)) {
      if (typeof val === 'string' || typeof val === 'number') {
        variables[key] = String(val);
      }
    }
  }
  return variables;
}

/** Fisher-Yates shuffle (in place) */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function loadDispatchContext(campaignId: string) {
  // Load campaign
  const campResult = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (campResult.rows.length === 0) throw new Error('Campaign not found');
  const campaign = campResult.rows[0];

  // Load template
  const tplResult = await pool.query('SELECT * FROM templates WHERE id = $1', [campaign.template_id]);
  if (tplResult.rows.length === 0) throw new Error('Template not found');
  const template = tplResult.rows[0];

  // Load provider config
  const providerResult = await pool.query("SELECT value FROM settings WHERE key = $1", [
    campaign.provider === 'gmail' ? 'gmail_config' : 'ses_config'
  ]);
  const providerConfig = providerResult.rows[0]?.value || {};

  // Load tracking domain
  const trackingResult = await pool.query("SELECT value FROM settings WHERE key = 'tracking_domain'");
  const trackingDomain = trackingResult.rows[0]?.value || 'http://localhost:3001';

  // Load reply-to setting
  const replyToResult = await pool.query("SELECT value FROM settings WHERE key = 'reply_to'");
  let replyTo: string | undefined;
  if (replyToResult.rows[0]?.value) {
    const raw = replyToResult.rows[0].value;
    if (typeof raw === 'string' && raw.length > 0 && raw.includes('@')) {
      replyTo = raw;
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string' && parsed.length > 0) {
          replyTo = parsed;
        }
      } catch {
        // not JSON, skip
      }
    }
  }

  const campaignAttachments: AttachmentMeta[] = campaign.attachments || [];

  return { campaign, template, providerConfig, trackingDomain, replyTo, campaignAttachments };
}

async function loadContacts(campaign: Record<string, unknown>, campaignId: string) {
  const listResult = await pool.query(
    'SELECT is_smart, filter_criteria FROM contact_lists WHERE id = $1',
    [campaign.list_id]
  );
  if (listResult.rows.length === 0) throw new Error('Contact list not found');
  const list = listResult.rows[0];

  let contactsResult;
  if (list.is_smart && list.filter_criteria) {
    const criteria = typeof list.filter_criteria === 'string'
      ? JSON.parse(list.filter_criteria) : list.filter_criteria;
    const filterParams: unknown[] = [];
    let filterWhere = '';
    let paramIndex = 1;

    if (criteria.state && Array.isArray(criteria.state) && criteria.state.length > 0) {
      filterWhere += ` AND c.state = ANY($${paramIndex})`;
      filterParams.push(criteria.state);
      paramIndex++;
    }
    if (criteria.district && Array.isArray(criteria.district) && criteria.district.length > 0) {
      filterWhere += ` AND c.district = ANY($${paramIndex})`;
      filterParams.push(criteria.district);
      paramIndex++;
    }
    if (criteria.block && Array.isArray(criteria.block) && criteria.block.length > 0) {
      filterWhere += ` AND c.block = ANY($${paramIndex})`;
      filterParams.push(criteria.block);
      paramIndex++;
    }
    if (criteria.category && Array.isArray(criteria.category) && criteria.category.length > 0) {
      filterWhere += ` AND c.category = ANY($${paramIndex})`;
      filterParams.push(criteria.category);
      paramIndex++;
    }
    if (criteria.management && Array.isArray(criteria.management) && criteria.management.length > 0) {
      filterWhere += ` AND c.management = ANY($${paramIndex})`;
      filterParams.push(criteria.management);
      paramIndex++;
    }
    if (criteria.classes_min != null) {
      filterWhere += ` AND CASE WHEN c.classes ~ '^[0-9]+-[0-9]+$' THEN CAST(split_part(c.classes, '-', 2) AS integer) >= $${paramIndex} ELSE true END`;
      filterParams.push(criteria.classes_min);
      paramIndex++;
    }
    if (criteria.classes_max != null) {
      filterWhere += ` AND CASE WHEN c.classes ~ '^[0-9]+-[0-9]+$' THEN CAST(split_part(c.classes, '-', 1) AS integer) <= $${paramIndex} ELSE true END`;
      filterParams.push(criteria.classes_max);
      paramIndex++;
    }

    contactsResult = await pool.query(
      `SELECT c.id, c.email, c.name, c.state, c.district, c.block, c.classes, c.category, c.management, c.address, c.metadata FROM contacts c
       WHERE c.status = 'active' ${filterWhere}
       AND c.id NOT IN (SELECT contact_id FROM campaign_recipients WHERE campaign_id = $${paramIndex} AND contact_id IS NOT NULL)`,
      [...filterParams, campaignId]
    );
  } else {
    contactsResult = await pool.query(
      `SELECT c.id, c.email, c.name, c.state, c.district, c.block, c.classes, c.category, c.management, c.address, c.metadata FROM contacts c
       JOIN contact_list_members clm ON clm.contact_id = c.id
       WHERE clm.list_id = $1 AND c.status = 'active'
       AND c.id NOT IN (SELECT contact_id FROM campaign_recipients WHERE campaign_id = $2 AND contact_id IS NOT NULL)`,
      [campaign.list_id, campaignId]
    );
  }

  return contactsResult.rows;
}

export function startCampaignDispatchWorker(): Worker {
  const worker = new Worker<DispatchJobData>(
    'campaign-dispatch',
    async (job: Job<DispatchJobData>) => {
      // Route to the correct handler based on job name
      if (job.name === 'pick-ab-winner') {
        return handlePickABWinner(job);
      }

      // Default: normal dispatch
      return handleDispatch(job);
    },
    {
      connection: { url: config.redis.url },
      concurrency: 1,
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`Campaign dispatch failed: ${err.message}`, { jobId: job?.id });
  });

  return worker;
}

async function handleDispatch(job: Job<DispatchJobData>) {
  const { campaignId } = job.data;
  logger.info(`Dispatching campaign ${campaignId}`);

  const { campaign, template, providerConfig, trackingDomain, replyTo, campaignAttachments } = await loadDispatchContext(campaignId);

  if (campaign.status === 'paused') {
    logger.info(`Campaign ${campaignId} is paused, skipping dispatch`);
    return;
  }

  const contacts = await loadContacts(campaign, campaignId);
  logger.info(`Campaign ${campaignId}: ${contacts.length} recipients to process`);

  // Update total recipients
  await pool.query(
    'UPDATE campaigns SET total_recipients = total_recipients + $1, updated_at = NOW() WHERE id = $2',
    [contacts.length, campaignId]
  );

  const dynamicVarDefs: DynVarDef[] = Array.isArray(campaign.dynamic_variables)
    ? campaign.dynamic_variables
    : [];
  const resolveDynamicVars = buildDynamicVarResolver(dynamicVarDefs);

  // Check if A/B testing is enabled
  const abTest = campaign.ab_test;
  const isABTest = abTest && abTest.enabled === true;

  if (isABTest) {
    // --- A/B Test dispatch ---
    const splitPercent = abTest.splitPercentage || 20; // total %
    const halfSplit = splitPercent / 2; // each variant gets half
    const variantACount = Math.max(1, Math.round(contacts.length * (halfSplit / 100)));
    const variantBCount = Math.max(1, Math.round(contacts.length * (halfSplit / 100)));

    // Shuffle for fair distribution
    shuffleArray(contacts);

    const variantAContacts = contacts.slice(0, variantACount);
    const variantBContacts = contacts.slice(variantACount, variantACount + variantBCount);
    const holdoutContacts = contacts.slice(variantACount + variantBCount);

    // Load variant B template if different
    let variantBTemplate = template;
    if (abTest.variantB?.templateId) {
      const vbTplResult = await pool.query('SELECT * FROM templates WHERE id = $1', [abTest.variantB.templateId]);
      if (vbTplResult.rows.length > 0) {
        variantBTemplate = vbTplResult.rows[0];
      }
    }
    const variantBSubject = abTest.variantB?.subject || template.subject;

    logger.info(`Campaign ${campaignId} A/B test: ${variantAContacts.length} variant A, ${variantBContacts.length} variant B, ${holdoutContacts.length} holdout`);

    // Dispatch variant A
    for (let i = 0; i < variantAContacts.length; i++) {
      const contact = variantAContacts[i];
      const trackingToken = generateTrackingToken();
      const variables = buildContactVariables(contact);
      Object.assign(variables, resolveDynamicVars(i));

      const renderedHtml = renderTemplate(template.html_body, variables);
      const renderedSubject = renderTemplate(template.subject, variables);
      const renderedText = template.text_body ? renderTemplate(template.text_body, variables) : null;

      const crResult = await pool.query(
        `INSERT INTO campaign_recipients (campaign_id, contact_id, email, tracking_token, ab_variant)
         VALUES ($1, $2, $3, $4, 'A') RETURNING id`,
        [campaignId, contact.id, contact.email, trackingToken]
      );

      await emailSendQueue.add('send', {
        campaignRecipientId: crResult.rows[0].id,
        campaignId,
        email: contact.email,
        subject: renderedSubject,
        html: renderedHtml,
        text: renderedText,
        provider: campaign.provider,
        providerConfig,
        trackingToken,
        trackingDomain,
        attachments: campaignAttachments,
        replyTo,
      } as SendJobData, { delay: 0 });
    }

    // Dispatch variant B
    for (let i = 0; i < variantBContacts.length; i++) {
      const contact = variantBContacts[i];
      const trackingToken = generateTrackingToken();
      const variables = buildContactVariables(contact);
      Object.assign(variables, resolveDynamicVars(variantAContacts.length + i));

      const renderedHtml = renderTemplate(variantBTemplate.html_body, variables);
      const renderedSubject = renderTemplate(variantBSubject, variables);
      const renderedText = variantBTemplate.text_body ? renderTemplate(variantBTemplate.text_body, variables) : null;

      const crResult = await pool.query(
        `INSERT INTO campaign_recipients (campaign_id, contact_id, email, tracking_token, ab_variant)
         VALUES ($1, $2, $3, $4, 'B') RETURNING id`,
        [campaignId, contact.id, contact.email, trackingToken]
      );

      await emailSendQueue.add('send', {
        campaignRecipientId: crResult.rows[0].id,
        campaignId,
        email: contact.email,
        subject: renderedSubject,
        html: renderedHtml,
        text: renderedText,
        provider: campaign.provider,
        providerConfig,
        trackingToken,
        trackingDomain,
        attachments: campaignAttachments,
        replyTo,
      } as SendJobData, { delay: 0 });
    }

    // Create holdout recipients (pending, no send job yet)
    for (const contact of holdoutContacts) {
      const trackingToken = generateTrackingToken();
      await pool.query(
        `INSERT INTO campaign_recipients (campaign_id, contact_id, email, tracking_token, ab_variant, status)
         VALUES ($1, $2, $3, $4, 'holdout', 'pending')`,
        [campaignId, contact.id, contact.email, trackingToken]
      );
    }

    // Update ab_test status to testing
    const updatedAbTest = { ...abTest, status: 'testing' };
    await pool.query(
      'UPDATE campaigns SET ab_test = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updatedAbTest), campaignId]
    );

    // Schedule the pick-ab-winner job
    const delayMs = (abTest.testDurationHours || 4) * 3600 * 1000;
    await campaignDispatchQueue.add('pick-ab-winner', { campaignId }, { delay: delayMs });

    logger.info(`Campaign ${campaignId}: A/B test dispatched. Winner pick scheduled in ${abTest.testDurationHours || 4}h`);
  } else {
    // --- Normal (non-A/B) dispatch ---
    for (let recipientIndex = 0; recipientIndex < contacts.length; recipientIndex++) {
      const contact = contacts[recipientIndex];
      const trackingToken = generateTrackingToken();
      const variables = buildContactVariables(contact);
      Object.assign(variables, resolveDynamicVars(recipientIndex));

      const renderedHtml = renderTemplate(template.html_body, variables);
      const renderedSubject = renderTemplate(template.subject, variables);
      const renderedText = template.text_body ? renderTemplate(template.text_body, variables) : null;

      const crResult = await pool.query(
        `INSERT INTO campaign_recipients (campaign_id, contact_id, email, tracking_token)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [campaignId, contact.id, contact.email, trackingToken]
      );

      await emailSendQueue.add('send', {
        campaignRecipientId: crResult.rows[0].id,
        campaignId,
        email: contact.email,
        subject: renderedSubject,
        html: renderedHtml,
        text: renderedText,
        provider: campaign.provider,
        providerConfig,
        trackingToken,
        trackingDomain,
        attachments: campaignAttachments,
        replyTo,
      } as SendJobData, { delay: 0 });
    }

    logger.info(`Campaign ${campaignId}: ${contacts.length} send jobs enqueued`);
  }
}

async function handlePickABWinner(job: Job<DispatchJobData>) {
  const { campaignId } = job.data;
  logger.info(`Picking A/B winner for campaign ${campaignId}`);

  // Load campaign
  const campResult = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (campResult.rows.length === 0) throw new Error('Campaign not found');
  const campaign = campResult.rows[0];
  const abTest = campaign.ab_test;

  if (!abTest || abTest.status !== 'testing') {
    logger.info(`Campaign ${campaignId}: A/B test not in testing state (${abTest?.status}), skipping`);
    return;
  }

  // Query variant stats
  const statsResult = await pool.query(
    `SELECT ab_variant,
       COUNT(*) FILTER (WHERE status IN ('sent','delivered','opened','clicked')) as sent,
       COUNT(*) FILTER (WHERE opened_at IS NOT NULL) as opens,
       COUNT(*) FILTER (WHERE clicked_at IS NOT NULL) as clicks
     FROM campaign_recipients
     WHERE campaign_id = $1 AND ab_variant IN ('A', 'B')
     GROUP BY ab_variant`,
    [campaignId]
  );

  const statsMap: Record<string, { sent: number; opens: number; clicks: number }> = { A: { sent: 0, opens: 0, clicks: 0 }, B: { sent: 0, opens: 0, clicks: 0 } };
  for (const row of statsResult.rows) {
    statsMap[row.ab_variant] = {
      sent: Number(row.sent) || 0,
      opens: Number(row.opens) || 0,
      clicks: Number(row.clicks) || 0,
    };
  }

  // Calculate rates
  const winnerMetric = abTest.winnerMetric || 'open_rate';
  let rateA = 0;
  let rateB = 0;
  if (winnerMetric === 'click_rate') {
    rateA = statsMap.A.sent > 0 ? statsMap.A.clicks / statsMap.A.sent : 0;
    rateB = statsMap.B.sent > 0 ? statsMap.B.clicks / statsMap.B.sent : 0;
  } else {
    rateA = statsMap.A.sent > 0 ? statsMap.A.opens / statsMap.A.sent : 0;
    rateB = statsMap.B.sent > 0 ? statsMap.B.opens / statsMap.B.sent : 0;
  }

  // Pick winner (tie = A wins)
  const winnerVariant: 'A' | 'B' = rateB > rateA ? 'B' : 'A';

  logger.info(`Campaign ${campaignId} A/B winner: ${winnerVariant} (A: ${(rateA * 100).toFixed(1)}%, B: ${(rateB * 100).toFixed(1)}%)`);

  // Update ab_test with results
  const updatedAbTest = {
    ...abTest,
    status: 'winner_picked',
    winnerVariant,
    variantAStats: statsMap.A,
    variantBStats: statsMap.B,
  };
  await pool.query(
    'UPDATE campaigns SET ab_test = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(updatedAbTest), campaignId]
  );

  // Now send to holdout group using winner's template/subject
  const { template, providerConfig, trackingDomain, replyTo, campaignAttachments } = await loadDispatchContext(campaignId);

  // Determine winner's template and subject
  let winnerTemplate = template;
  let winnerSubject = template.subject;
  if (winnerVariant === 'B') {
    if (abTest.variantB?.templateId) {
      const vbTplResult = await pool.query('SELECT * FROM templates WHERE id = $1', [abTest.variantB.templateId]);
      if (vbTplResult.rows.length > 0) {
        winnerTemplate = vbTplResult.rows[0];
      }
    }
    winnerSubject = abTest.variantB?.subject || template.subject;
  }

  // Load holdout recipients
  const holdoutResult = await pool.query(
    `SELECT cr.id, cr.email, cr.tracking_token, cr.contact_id,
            c.name, c.state, c.district, c.block, c.classes, c.category, c.management, c.address, c.metadata
     FROM campaign_recipients cr
     LEFT JOIN contacts c ON c.id = cr.contact_id
     WHERE cr.campaign_id = $1 AND cr.ab_variant = 'holdout' AND cr.status = 'pending'`,
    [campaignId]
  );

  const dynamicVarDefs: DynVarDef[] = Array.isArray(campaign.dynamic_variables) ? campaign.dynamic_variables : [];
  const resolveDynamicVars = buildDynamicVarResolver(dynamicVarDefs);

  for (let i = 0; i < holdoutResult.rows.length; i++) {
    const row = holdoutResult.rows[i];
    const variables = buildContactVariables(row);
    Object.assign(variables, resolveDynamicVars(i));

    const renderedHtml = renderTemplate(winnerTemplate.html_body, variables);
    const renderedSubject = renderTemplate(winnerSubject, variables);
    const renderedText = winnerTemplate.text_body ? renderTemplate(winnerTemplate.text_body, variables) : null;

    await emailSendQueue.add('send', {
      campaignRecipientId: row.id,
      campaignId,
      email: row.email,
      subject: renderedSubject,
      html: renderedHtml,
      text: renderedText,
      provider: campaign.provider,
      providerConfig,
      trackingToken: row.tracking_token,
      trackingDomain,
      attachments: campaignAttachments,
      replyTo,
    } as SendJobData, { delay: 0 });

    // Update variant to holdout_winner
    await pool.query(
      "UPDATE campaign_recipients SET ab_variant = 'holdout_W' WHERE id = $1",
      [row.id]
    );
  }

  // Mark A/B test as completed
  const completedAbTest = { ...updatedAbTest, status: 'completed' };
  await pool.query(
    'UPDATE campaigns SET ab_test = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(completedAbTest), campaignId]
  );

  logger.info(`Campaign ${campaignId}: A/B test completed. ${holdoutResult.rows.length} holdout emails enqueued with winner variant ${winnerVariant}`);
}

export function startEmailSendWorker(): Worker {
  const worker = new Worker<SendJobData>(
    'email-send',
    async (job: Job<SendJobData>) => {
      const { campaignRecipientId, campaignId, email, subject, html, text, provider, providerConfig, trackingToken, trackingDomain, replyTo } = job.data;

      // Check if campaign is paused
      const campCheck = await pool.query('SELECT status FROM campaigns WHERE id = $1', [campaignId]);
      if (campCheck.rows[0]?.status === 'paused') {
        // Re-queue with delay
        throw new Error('Campaign paused');
      }

      // --- Suppression check ---
      const suppressed = await isEmailSuppressed(email);
      if (suppressed) {
        await pool.query(
          "UPDATE campaign_recipients SET status = 'failed', error_message = 'Email suppressed' WHERE id = $1",
          [campaignRecipientId]
        );
        await pool.query(
          'UPDATE campaigns SET failed_count = failed_count + 1, updated_at = NOW() WHERE id = $1',
          [campaignId]
        );
        logger.info(`Skipping suppressed email ${email}`);
        // Check campaign completion
        const suppStats = await pool.query(
          'SELECT total_recipients, sent_count, failed_count, bounce_count FROM campaigns WHERE id = $1',
          [campaignId]
        );
        const suppCamp = suppStats.rows[0];
        if (suppCamp && (Number(suppCamp.sent_count) + Number(suppCamp.failed_count) + Number(suppCamp.bounce_count)) >= Number(suppCamp.total_recipients)) {
          await pool.query(
            "UPDATE campaigns SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1",
            [campaignId]
          );
        }
        return; // Don't throw — no retry needed
      }

      // --- Daily send limit check ---
      const limitCheck = await checkDailyLimit(provider);
      if (!limitCheck.allowed) {
        await pool.query(
          "UPDATE campaigns SET status = 'paused', pause_reason = 'Daily send limit reached', updated_at = NOW() WHERE id = $1 AND status = 'sending'",
          [campaignId]
        );
        logger.warn(`Daily limit reached for ${provider}: ${limitCheck.current}/${limitCheck.limit}. Pausing campaign ${campaignId}`);
        throw new UnrecoverableError('DAILY_LIMIT_REACHED');
      }

      // Inject tracking pixel
      const pixelUrl = `${trackingDomain}/api/v1/t/o/${trackingToken}`;
      const trackingPixel = `<img src="${pixelUrl}" width="1" height="1" style="display:block" alt="" />`;
      let trackedHtml = html.replace('</body>', `${trackingPixel}</body>`);
      if (!trackedHtml.includes(trackingPixel)) {
        trackedHtml += trackingPixel;
      }

      // Rewrite links for click tracking
      const linkUrls: string[] = [];
      let linkIndex = 0;
      trackedHtml = trackedHtml.replace(/<a\s+([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi, (_match, pre, url, post) => {
        if (url.startsWith('mailto:') || url.startsWith('#')) return `<a ${pre}href="${url}"${post}>`;
        linkUrls.push(url);
        const trackUrl = `${trackingDomain}/api/v1/t/c/${trackingToken}/${linkIndex}`;
        linkIndex++;
        return `<a ${pre}href="${trackUrl}"${post}>`;
      });

      // Store link URLs
      await pool.query('UPDATE campaign_recipients SET link_urls = $1 WHERE id = $2', [JSON.stringify(linkUrls), campaignRecipientId]);

      // Build headers
      const unsubUrl = `${trackingDomain}/api/v1/t/u/${trackingToken}`;
      const headers: Record<string, string> = {
        'List-Unsubscribe': `<${unsubUrl}>, <mailto:unsubscribe@yourdomain.com?subject=unsubscribe>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'Feedback-ID': `${campaignId}:cadencerelay`,
      };

      // Load attachments from disk
      const emailAttachments: EmailAttachment[] = [];
      if (job.data.attachments && job.data.attachments.length > 0) {
        for (const att of job.data.attachments) {
          if (fs.existsSync(att.storagePath)) {
            emailAttachments.push({
              filename: att.filename,
              content: fs.readFileSync(att.storagePath),
              contentType: att.contentType,
            });
          } else {
            logger.warn(`Attachment file not found: ${att.storagePath}`, { filename: att.filename });
          }
        }
      }

      // Send email - catch and classify errors
      const emailProvider = createProvider(provider, providerConfig);
      let result;
      try {
        result = await emailProvider.send({
          to: email,
          subject,
          html: trackedHtml,
          text: text || undefined,
          replyTo,
          headers,
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
        });
      } catch (sendErr) {
        // Permanent bounces should not be retried
        if (sendErr instanceof PermanentBounceError) {
          throw new UnrecoverableError(sendErr.message);
        }
        // Auth errors should not be retried (campaign will be paused)
        if (sendErr instanceof AuthenticationError) {
          throw new UnrecoverableError(sendErr.message);
        }
        // Rate limits and temporary errors: rethrow for BullMQ retry
        throw sendErr;
      }

      // Increment daily send counter
      await incrementDailySend(provider);

      // Update campaign_recipient
      await pool.query(
        "UPDATE campaign_recipients SET status = 'sent', provider_message_id = $1, sent_at = NOW() WHERE id = $2",
        [result.messageId, campaignRecipientId]
      );

      // Record event
      await pool.query(
        "INSERT INTO email_events (campaign_recipient_id, campaign_id, event_type, metadata) VALUES ($1, $2, 'sent', $3)",
        [campaignRecipientId, campaignId, JSON.stringify({ messageId: result.messageId, provider })]
      );

      // Update denormalized counters
      await pool.query(
        'UPDATE campaigns SET sent_count = sent_count + 1, updated_at = NOW() WHERE id = $1',
        [campaignId]
      );
      await pool.query(
        'UPDATE contacts SET send_count = send_count + 1, last_sent_at = NOW() WHERE email = $1',
        [email]
      );

      // Check if campaign is complete
      const stats = await pool.query(
        'SELECT total_recipients, sent_count, failed_count, bounce_count FROM campaigns WHERE id = $1',
        [campaignId]
      );
      const camp = stats.rows[0];
      if (camp && (Number(camp.sent_count) + Number(camp.failed_count) + Number(camp.bounce_count)) >= Number(camp.total_recipients)) {
        await pool.query(
          "UPDATE campaigns SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1",
          [campaignId]
        );
        logger.info(`Campaign ${campaignId} completed`);
      }

      logger.debug(`Email sent to ${email}`, { messageId: result.messageId });
    },
    {
      connection: { url: config.redis.url },
      concurrency: 10,
      limiter: {
        max: 5,
        duration: 1000,
      },
    }
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const { campaignRecipientId, campaignId, email } = job.data;

    // Classify the error for proper handling
    const isPermanentBounce = err instanceof PermanentBounceError || err.name === 'PermanentBounceError';
    const isAuthError = err instanceof AuthenticationError || err.name === 'AuthenticationError';
    const isRateLimit = err instanceof RateLimitError || err.name === 'RateLimitError';
    const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || 3);

    if (isPermanentBounce) {
      // Permanent bounce: mark as bounced immediately, don't retry
      logger.warn(`Permanent bounce for ${email}: ${err.message}`);

      await pool.query(
        "UPDATE campaign_recipients SET status = 'bounced', bounced_at = NOW(), error_message = $1 WHERE id = $2 AND status != 'bounced'",
        [err.message, campaignRecipientId]
      );
      await pool.query(
        "INSERT INTO email_events (campaign_recipient_id, campaign_id, event_type, metadata) VALUES ($1, $2, 'bounced', $3)",
        [campaignRecipientId, campaignId, JSON.stringify({
          bounceType: 'Permanent',
          error: err.message,
          source: 'smtp-rejection',
          provider: job.data.provider,
        })]
      );
      await pool.query(
        'UPDATE campaigns SET bounce_count = bounce_count + 1, updated_at = NOW() WHERE id = $1',
        [campaignId]
      );
      // Mark contact as bounced
      await pool.query(
        "UPDATE contacts SET status = 'bounced', bounce_count = bounce_count + 1, updated_at = NOW() WHERE email = $1",
        [email]
      );
    } else if (isAuthError) {
      // Auth error: stop the whole campaign, not just this email
      logger.error(`Authentication error: ${err.message}. Pausing campaign ${campaignId}`);

      await pool.query(
        "UPDATE campaign_recipients SET status = 'failed', error_message = $1 WHERE id = $2",
        [`Auth error: ${err.message}`, campaignRecipientId]
      );
      await pool.query(
        "UPDATE campaigns SET status = 'failed', updated_at = NOW() WHERE id = $1 AND status = 'sending'",
        [campaignId]
      );
    } else if (isRateLimit) {
      // Rate limit: will be retried automatically by BullMQ backoff
      logger.warn(`Rate limited for ${email}, attempt ${job.attemptsMade}/${job.opts.attempts}: ${err.message}`);

      if (isFinalAttempt) {
        await pool.query(
          "UPDATE campaign_recipients SET status = 'failed', error_message = $1 WHERE id = $2",
          [`Rate limited after ${job.attemptsMade} attempts: ${err.message}`, campaignRecipientId]
        );
        await pool.query(
          'UPDATE campaigns SET failed_count = failed_count + 1, updated_at = NOW() WHERE id = $1',
          [campaignId]
        );
      }
    } else if (isFinalAttempt) {
      // Other errors on final attempt
      logger.error(`Email send failed permanently for ${email}: ${err.message}`);

      await pool.query(
        "UPDATE campaign_recipients SET status = 'failed', error_message = $1 WHERE id = $2",
        [err.message, campaignRecipientId]
      );
      await pool.query(
        "INSERT INTO email_events (campaign_recipient_id, campaign_id, event_type, metadata) VALUES ($1, $2, 'failed', $3)",
        [campaignRecipientId, campaignId, JSON.stringify({ error: err.message, provider: job.data.provider })]
      );
      await pool.query(
        'UPDATE campaigns SET failed_count = failed_count + 1, updated_at = NOW() WHERE id = $1',
        [campaignId]
      );
    } else {
      // Temporary error, will retry
      logger.warn(`Temporary failure for ${email}, attempt ${job.attemptsMade}/${job.opts.attempts}: ${err.message}`);
    }

    // Check campaign completion after any terminal state
    if (isPermanentBounce || isFinalAttempt || isAuthError) {
      const stats = await pool.query(
        'SELECT total_recipients, sent_count, failed_count, bounce_count FROM campaigns WHERE id = $1',
        [campaignId]
      );
      const camp = stats.rows[0];
      if (camp && (Number(camp.sent_count) + Number(camp.failed_count) + Number(camp.bounce_count)) >= Number(camp.total_recipients)) {
        await pool.query(
          "UPDATE campaigns SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'sending'",
          [campaignId]
        );
        logger.info(`Campaign ${campaignId} completed (with ${camp.bounce_count} bounces, ${camp.failed_count} failures)`);
      }
    }
  });

  return worker;
}
