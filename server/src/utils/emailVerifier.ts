import dns from 'dns';
import { pool } from '../config/database';

// Top 50+ known disposable email domains
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
  'spamfree24.org', 'mailexpire.com', 'tempr.email', 'discard.email',
  'mailtemp.info', 'inboxalias.com', 'emailfake.com', 'crazymailing.com',
  'armyspy.com', 'dayrep.com', 'einrot.com', 'fleckens.hu',
  'jourrapide.com', 'rhyta.com', 'superrito.com', 'teleworm.us',
  'guerrillamail.info', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamail.de', 'sharklasers.com', 'spam4.me', 'trashmail.io',
]);

// Role-based email prefixes
const ROLE_PREFIXES = new Set([
  'admin', 'info', 'support', 'sales', 'help', 'contact', 'office',
  'billing', 'abuse', 'postmaster', 'webmaster', 'hostmaster', 'noreply',
  'no-reply', 'feedback', 'marketing', 'media', 'press', 'security',
  'team', 'hr', 'careers', 'jobs', 'legal', 'compliance', 'privacy',
]);

// Common typo domains with their corrections
const TYPO_DOMAINS: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gamil.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmai.com': 'gmail.com',
  'gmali.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com',
  'yahoi.com': 'yahoo.com', 'yhaoo.com': 'yahoo.com',
  'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmaill.com': 'hotmail.com',
  'hotmail.con': 'hotmail.com', 'hotamil.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.con': 'outlook.com',
  'redifmail.com': 'rediffmail.com', 'rediffmal.com': 'rediffmail.com',
  'yaho.co.in': 'yahoo.co.in', 'yahooo.co.in': 'yahoo.co.in',
};

// Invalid/reserved TLDs
const INVALID_TLDS = ['.invalid', '.test', '.example', '.localhost', '.internal'];

export interface EmailVerificationResult {
  email: string;
  valid: boolean;
  checks: {
    syntax: 'pass' | 'fail';
    mx: 'pass' | 'fail' | 'unknown';
    disposable: 'pass' | 'fail';
    roleBased: 'pass' | 'warning';
    previouslyBounced: 'pass' | 'fail';
    typoDomain: 'pass' | 'fail';
    invalidTld: 'pass' | 'fail';
    duplicate: 'pass' | 'fail';
  };
  risk: 'low' | 'medium' | 'high';
  suggestion: string | null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkSyntax(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 320;
}

async function checkMx(domain: string): Promise<boolean> {
  try {
    const resolver = new dns.promises.Resolver();
    resolver.setServers(['8.8.8.8', '1.1.1.1']);
    const records = await Promise.race([
      resolver.resolveMx(domain),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('MX lookup timeout')), 3000)
      ),
    ]);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

function checkDisposable(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

function checkRoleBased(localPart: string): boolean {
  return ROLE_PREFIXES.has(localPart.toLowerCase());
}

async function checkPreviouslyBounced(email: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM suppression_list WHERE LOWER(email) = LOWER($1)',
    [email]
  );
  return result.rows.length > 0;
}

export async function verifyEmail(email: string): Promise<EmailVerificationResult> {
  const result: EmailVerificationResult = {
    email,
    valid: true,
    checks: {
      syntax: 'pass',
      mx: 'pass',
      disposable: 'pass',
      roleBased: 'pass',
      previouslyBounced: 'pass',
      typoDomain: 'pass',
      invalidTld: 'pass',
      duplicate: 'pass',
    },
    risk: 'low',
    suggestion: null,
  };

  const suggestions: string[] = [];

  // 1. Syntax check
  if (!checkSyntax(email)) {
    result.checks.syntax = 'fail';
    result.valid = false;
    result.risk = 'high';
    result.suggestion = 'Invalid email format';
    return result;
  }

  const [localPart, domain] = email.split('@');

  // 1b. Invalid TLD check
  const domainLower = domain.toLowerCase();
  if (INVALID_TLDS.some((tld) => domainLower.endsWith(tld))) {
    result.checks.invalidTld = 'fail';
    result.valid = false;
    result.risk = 'high';
    suggestions.push(`Invalid TLD in domain "${domain}"`);
  }

  // 1c. Typo domain check
  const typoDomainSuggestion = TYPO_DOMAINS[domainLower];
  if (typoDomainSuggestion) {
    result.checks.typoDomain = 'fail';
    result.risk = 'high';
    suggestions.push(`Did you mean ${typoDomainSuggestion}?`);
  }

  // 2. MX record check
  const hasMx = await checkMx(domain);
  if (!hasMx) {
    result.checks.mx = 'fail';
    result.valid = false;
    result.risk = 'high';
    suggestions.push('Domain has no mail servers');
  }

  // 3. Disposable email check
  if (checkDisposable(domain)) {
    result.checks.disposable = 'fail';
    result.valid = false;
    result.risk = 'high';
    suggestions.push('Disposable email domain');
  }

  // 4. Role-based check
  if (checkRoleBased(localPart)) {
    result.checks.roleBased = 'warning';
    if (result.risk === 'low') result.risk = 'medium';
    suggestions.push(`Role-based email (${localPart}@) -- higher bounce risk`);
  }

  // 5. Previously bounced check
  const bounced = await checkPreviouslyBounced(email);
  if (bounced) {
    result.checks.previouslyBounced = 'fail';
    result.valid = false;
    result.risk = 'high';
    suggestions.push('Email is on the suppression list');
  }

  if (suggestions.length > 0) {
    result.suggestion = suggestions.join('; ');
  }

  return result;
}

export async function verifyEmailBatch(emails: string[]): Promise<EmailVerificationResult[]> {
  // Process in parallel with concurrency limit
  const CONCURRENCY = 10;
  const results: EmailVerificationResult[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < emails.length; i += CONCURRENCY) {
    const batch = emails.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(verifyEmail));

    for (const result of batchResults) {
      const normalized = result.email.toLowerCase();
      if (seen.has(normalized)) {
        result.checks.duplicate = 'fail';
        if (result.risk === 'low') result.risk = 'medium';
        const existing = result.suggestion ? result.suggestion + '; ' : '';
        result.suggestion = existing + 'Duplicate email in batch';
      }
      seen.add(normalized);
      results.push(result);
    }
  }

  return results;
}
