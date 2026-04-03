import dns from 'dns';
import { pool } from '../config/database';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

const BATCH_SIZE = 500;
const MAX_CONTACTS_PER_RUN = 0; // 0 = unlimited, check ALL contacts
const MX_TIMEOUT_MS = 5000;
const REDIS_PROGRESS_KEY = 'contact-health-check-progress';

// Top 50+ known disposable email domains (mirrors emailVerifier.ts)
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'dispostable.com', 'trashmail.com', 'mailnesia.com', 'mailcatch.com',
  'temp-mail.org', 'fakeinbox.com', 'tempail.com', 'mohmal.com',
  'getnada.com', 'emailondeck.com', 'mintemail.com', 'mytemp.email',
  'burnermail.io', 'maildrop.cc', 'harakirimail.com', 'discard.email',
  'mailsac.com', 'trashmail.net', 'trashmail.me', 'spamgourmet.com',
  'jetable.org', 'tmpmail.net', 'tmpmail.org', 'binkmail.com',
  'safetymail.info', 'filzmail.com', 'devnullmail.com', 'tempinbox.com',
  'spamfree24.org', 'mailexpire.com', 'tempr.email',
  'mailtemp.info', 'inboxalias.com', 'emailfake.com', 'crazymailing.com',
  'armyspy.com', 'dayrep.com', 'einrot.com', 'fleckens.hu',
  'jourrapide.com', 'rhyta.com', 'superrito.com', 'teleworm.us',
  'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamail.de', 'spam4.me', 'trashmail.io',
]);

// Role-based email prefixes
const ROLE_PREFIXES = new Set([
  'admin', 'info', 'support', 'sales', 'help', 'contact', 'office',
  'billing', 'abuse', 'postmaster', 'webmaster', 'hostmaster', 'noreply',
  'no-reply', 'feedback', 'marketing', 'media', 'press', 'security',
  'team', 'hr', 'careers', 'jobs', 'legal', 'compliance', 'privacy',
]);

interface HealthProgress {
  total: number;
  checked: number;
  good: number;
  risky: number;
  invalid: number;
  suppressed: number;
  status: 'running' | 'completed';
  startedAt: string;
}

async function checkMxCached(
  domain: string,
  cache: Map<string, 'valid' | 'invalid'>
): Promise<'valid' | 'invalid'> {
  const cached = cache.get(domain);
  if (cached) return cached;

  try {
    const resolver = new dns.promises.Resolver();
    resolver.setServers(['8.8.8.8', '1.1.1.1']);
    const records = await Promise.race([
      resolver.resolveMx(domain),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('MX lookup timeout')), MX_TIMEOUT_MS)
      ),
    ]);
    const result = Array.isArray(records) && records.length > 0 ? 'valid' : 'invalid';
    cache.set(domain, result);
    return result;
  } catch {
    cache.set(domain, 'invalid');
    return 'invalid';
  }
}

export async function runContactHealthCheck(): Promise<void> {
  logger.info('Contact health check started');

  // Load suppression list emails into a Set for fast lookup
  const suppressionResult = await pool.query('SELECT LOWER(email) as email FROM suppression_list');
  const suppressedEmails = new Set(suppressionResult.rows.map((r: { email: string }) => r.email));

  // Count total eligible contacts
  const countResult = await pool.query(
    `SELECT COUNT(*) FROM contacts
     WHERE health_status = 'unchecked'
        OR health_checked_at < NOW() - INTERVAL '30 days'
        OR health_checked_at IS NULL`
  );
  const totalEligible = MAX_CONTACTS_PER_RUN > 0
    ? Math.min(parseInt(countResult.rows[0].count), MAX_CONTACTS_PER_RUN)
    : parseInt(countResult.rows[0].count);

  const progress: HealthProgress = {
    total: totalEligible,
    checked: 0,
    good: 0,
    risky: 0,
    invalid: 0,
    suppressed: 0,
    status: 'running',
    startedAt: new Date().toISOString(),
  };
  await redis.set(REDIS_PROGRESS_KEY, JSON.stringify(progress), 'EX', 3600);

  if (totalEligible === 0) {
    progress.status = 'completed';
    await redis.set(REDIS_PROGRESS_KEY, JSON.stringify(progress), 'EX', 3600);
    logger.info('Contact health check completed: no contacts to check');
    return;
  }

  const mxCache = new Map<string, 'valid' | 'invalid'>();
  let totalChecked = 0;

  while (MAX_CONTACTS_PER_RUN === 0 || totalChecked < MAX_CONTACTS_PER_RUN) {
    // Fetch a batch of contacts that need checking
    const batchResult = await pool.query(
      `SELECT id, email, status FROM contacts
       WHERE health_status = 'unchecked'
          OR health_checked_at < NOW() - INTERVAL '30 days'
          OR health_checked_at IS NULL
       ORDER BY health_checked_at ASC NULLS FIRST
       LIMIT $1`,
      [BATCH_SIZE]
    );

    if (batchResult.rows.length === 0) break;

    const contacts: { id: string; email: string; status: string }[] = batchResult.rows;

    // Group by domain and pre-check MX records
    const domains = new Set<string>();
    for (const c of contacts) {
      const parts = c.email.split('@');
      if (parts.length === 2) domains.add(parts[1].toLowerCase());
    }

    // Check MX for all unique domains in parallel (limited concurrency)
    const domainArray = Array.from(domains);
    const MX_CONCURRENCY = 10;
    for (let i = 0; i < domainArray.length; i += MX_CONCURRENCY) {
      const batch = domainArray.slice(i, i + MX_CONCURRENCY);
      await Promise.all(batch.map((d) => checkMxCached(d, mxCache)));
    }

    // Classify each contact
    const updates: { id: string; health_status: string }[] = [];

    for (const c of contacts) {
      const emailLower = c.email.toLowerCase();
      const parts = emailLower.split('@');
      let healthStatus: string;

      if (parts.length !== 2) {
        healthStatus = 'invalid';
      } else {
        const [localPart, domain] = parts;

        // Priority order of checks
        if (suppressedEmails.has(emailLower)) {
          healthStatus = 'suppressed';
        } else if (c.status === 'bounced' || c.status === 'complained') {
          healthStatus = 'invalid';
        } else if (mxCache.get(domain) === 'invalid') {
          healthStatus = 'invalid';
        } else if (DISPOSABLE_DOMAINS.has(domain)) {
          healthStatus = 'risky';
        } else if (ROLE_PREFIXES.has(localPart)) {
          healthStatus = 'risky';
        } else {
          healthStatus = 'good';
        }
      }

      updates.push({ id: c.id, health_status: healthStatus });

      // Update progress counts
      if (healthStatus === 'good') progress.good++;
      else if (healthStatus === 'risky') progress.risky++;
      else if (healthStatus === 'invalid') progress.invalid++;
      else if (healthStatus === 'suppressed') progress.suppressed++;
    }

    // Batch update contacts
    if (updates.length > 0) {
      // Build a bulk UPDATE using unnest
      const ids = updates.map((u) => u.id);
      const statuses = updates.map((u) => u.health_status);

      await pool.query(
        `UPDATE contacts
         SET health_status = data.health_status,
             health_checked_at = NOW(),
             updated_at = NOW()
         FROM (SELECT unnest($1::uuid[]) as id, unnest($2::varchar[]) as health_status) AS data
         WHERE contacts.id = data.id`,
        [ids, statuses]
      );
    }

    totalChecked += contacts.length;
    progress.checked = totalChecked;
    await redis.set(REDIS_PROGRESS_KEY, JSON.stringify(progress), 'EX', 3600);

    logger.info(`Checked ${totalChecked}/${progress.total} contacts...`);
  }

  progress.status = 'completed';
  progress.checked = totalChecked;
  await redis.set(REDIS_PROGRESS_KEY, JSON.stringify(progress), 'EX', 3600);

  logger.info(
    `Contact health check completed: ${totalChecked} checked — good=${progress.good}, risky=${progress.risky}, invalid=${progress.invalid}, suppressed=${progress.suppressed}`
  );
}
