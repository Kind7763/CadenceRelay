/**
 * Rule-based spam score checker for email subject + HTML body.
 * Entirely deterministic — no external API calls.
 */

export interface SpamIssue {
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  points: number;
}

export interface SpamCheckResult {
  score: number;       // 0-100 (0 = clean, 100 = very spammy)
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: SpamIssue[];
}

const SPAMMY_WORDS = [
  'FREE', 'ACT NOW', 'LIMITED TIME', 'URGENT', 'WINNER',
  'CONGRATULATIONS', 'CLICK HERE', 'BUY NOW', 'DISCOUNT',
  'OFFER', 'DEAL', 'CASH', 'PRIZE', 'GUARANTEE',
  'NO OBLIGATION', 'RISK FREE', 'SUBSCRIBE', 'ORDER NOW',
  'EARN MONEY', 'DOUBLE YOUR', 'NO COST', 'LOWEST PRICE',
  'ONCE IN A LIFETIME', 'APPLY NOW', 'CLEARANCE', 'BONUS',
  'EXCLUSIVE', 'MAKE MONEY', '100% FREE', 'NO FEES',
];

/** Strip all HTML tags and return just the text content */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Count words in text */
function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Calculate what percentage of alphabetical chars are uppercase */
function uppercasePercent(text: string): number {
  const alpha = text.replace(/[^a-zA-Z]/g, '');
  if (alpha.length === 0) return 0;
  const upper = alpha.replace(/[^A-Z]/g, '').length;
  return (upper / alpha.length) * 100;
}

function assignGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score <= 10) return 'A';
  if (score <= 25) return 'B';
  if (score <= 50) return 'C';
  if (score <= 75) return 'D';
  return 'F';
}

export function checkSpamScore(subject: string, html: string, hasPlainText?: boolean): SpamCheckResult {
  const issues: SpamIssue[] = [];

  // ────── Subject Line Rules ──────

  // ALL CAPS subject (>50% uppercase chars)
  if (subject.length > 0 && uppercasePercent(subject) > 50) {
    issues.push({
      severity: 'error',
      rule: 'subject-all-caps',
      message: 'Subject line is mostly uppercase — this triggers spam filters',
      points: 20,
    });
  }

  // Excessive punctuation (3+ consecutive !!! or ???)
  if (/[!]{3,}|[?]{3,}/.test(subject)) {
    issues.push({
      severity: 'warning',
      rule: 'subject-excessive-punctuation',
      message: 'Subject contains excessive punctuation (3+ consecutive ! or ?)',
      points: 10,
    });
  }

  // Spammy words in subject
  const subjectUpper = subject.toUpperCase();
  for (const word of SPAMMY_WORDS) {
    // Match as whole word or phrase boundary
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(subjectUpper)) {
      issues.push({
        severity: 'warning',
        rule: 'subject-spammy-word',
        message: `Found spammy phrase "${word}" in subject`,
        points: 5,
      });
    }
  }

  // Very short subject
  if (subject.length > 0 && subject.length < 10) {
    issues.push({
      severity: 'info',
      rule: 'subject-too-short',
      message: `Subject is very short (${subject.length} chars) — may look suspicious`,
      points: 5,
    });
  }

  // Very long subject
  if (subject.length > 100) {
    issues.push({
      severity: 'info',
      rule: 'subject-too-long',
      message: `Subject is very long (${subject.length} chars) — may be truncated in inboxes`,
      points: 5,
    });
  }

  // Starts with "Re:" or "Fwd:" (deceptive)
  if (/^\s*(Re|Fwd|Fw)\s*:/i.test(subject)) {
    issues.push({
      severity: 'warning',
      rule: 'subject-fake-reply',
      message: 'Subject starts with "Re:" or "Fwd:" — this looks deceptive in bulk emails',
      points: 10,
    });
  }

  // ────── HTML Body Rules ──────

  if (html) {
    const textContent = stripHtml(html);
    const words = wordCount(textContent);

    // Informational: no plain text alternative
    if (!hasPlainText) {
      issues.push({
        severity: 'info',
        rule: 'body-no-text-alternative',
        message: 'Consider adding a plain text alternative for maximum deliverability',
        points: 0,
      });
    }

    // Image-heavy
    const imgCount = (html.match(/<img[\s>]/gi) || []).length;
    if (imgCount > 5 && words < 100) {
      issues.push({
        severity: 'warning',
        rule: 'body-image-heavy',
        message: `Email is image-heavy (${imgCount} images, only ${words} words of text)`,
        points: 15,
      });
    }

    // Missing alt attributes on images
    const imgsWithoutAlt = (html.match(/<img(?![^>]*\balt\s*=)[^>]*>/gi) || []).length;
    if (imgsWithoutAlt > 0) {
      issues.push({
        severity: 'info',
        rule: 'body-missing-alt',
        message: `${imgsWithoutAlt} image(s) missing alt attributes`,
        points: 5,
      });
    }

    // Excessive links
    const linkCount = (html.match(/<a[\s>]/gi) || []).length;
    if (linkCount > 10) {
      issues.push({
        severity: 'warning',
        rule: 'body-excessive-links',
        message: `Email contains ${linkCount} links — more than 10 can trigger spam filters`,
        points: 10,
      });
    }

    // Hidden text detection
    const hasHiddenText =
      /display\s*:\s*none/i.test(html) ||
      /font-size\s*:\s*0/i.test(html) ||
      /color\s*:\s*#fff\w*\s*;[^"]*background\s*:\s*#fff/i.test(html) ||
      /color\s*:\s*white\s*;[^"]*background\s*:\s*white/i.test(html) ||
      /color\s*:\s*#ffffff/i.test(html) && /background(?:-color)?\s*:\s*#ffffff/i.test(html);

    if (hasHiddenText) {
      issues.push({
        severity: 'error',
        rule: 'body-hidden-text',
        message: 'Detected possible hidden text (display:none, font-size:0, or matching text/background colors)',
        points: 15,
      });
    }

    // Very large HTML
    const htmlSizeKB = Buffer.byteLength(html, 'utf8') / 1024;
    if (htmlSizeKB > 100) {
      issues.push({
        severity: 'info',
        rule: 'body-too-large',
        message: `HTML is ${Math.round(htmlSizeKB)}KB — emails over 100KB may be clipped`,
        points: 5,
      });
    }

    // No unsubscribe link text
    if (!/unsubscribe/i.test(textContent)) {
      issues.push({
        severity: 'warning',
        rule: 'body-no-unsubscribe',
        message: 'No "unsubscribe" text found in body — having visible unsubscribe text improves deliverability',
        points: 10,
      });
    }

    // ALL CAPS body (>30% uppercase)
    if (textContent.length > 20 && uppercasePercent(textContent) > 30) {
      issues.push({
        severity: 'warning',
        rule: 'body-all-caps',
        message: 'More than 30% of body text is uppercase',
        points: 10,
      });
    }

    // Red/large font abuse
    const largeFontMatches = (html.match(/font-size\s*:\s*(\d+)\s*px/gi) || [])
      .filter((m) => {
        const sizeMatch = m.match(/(\d+)/);
        return sizeMatch && parseInt(sizeMatch[1]) > 24;
      });
    const redColorMatches = (html.match(/color\s*:\s*(red|#ff0000|#f00)\b/gi) || []);
    if (largeFontMatches.length > 2 || redColorMatches.length > 2) {
      issues.push({
        severity: 'info',
        rule: 'body-font-abuse',
        message: 'Multiple instances of very large fonts or red text detected',
        points: 5,
      });
    }
  }

  // ────── Calculate Score ──────
  const rawScore = issues.reduce((sum, issue) => sum + issue.points, 0);
  const score = Math.min(100, rawScore);
  const grade = assignGrade(score);

  return { score, grade, issues };
}
