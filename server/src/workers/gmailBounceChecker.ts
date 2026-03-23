import Imap from 'imap';
import { simpleParser, ParsedMail, Source } from 'mailparser';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

interface GmailImapConfig {
  user: string;
  pass: string;
  host?: string;
  port?: number;
}

// Known bounce sender patterns
const BOUNCE_SENDERS = [
  'mailer-daemon@',
  'postmaster@',
  'mail-daemon@',
  'noreply@google.com',
];

// Patterns in bounce subjects
const BOUNCE_SUBJECTS = [
  'delivery status notification',
  'undeliverable',
  'mail delivery failed',
  'returned mail',
  'failure notice',
  'delivery failure',
  'could not be delivered',
  'delivery has failed',
  'non-delivery',
  'undelivered mail',
];

// Extract bounced email addresses from NDR body
function extractBouncedEmails(text: string): string[] {
  const emailRegex = /[\w.+-]+@[\w-]+\.[\w.]+/g;
  const matches = text.match(emailRegex) || [];
  // Filter out common system addresses
  return matches.filter((email) =>
    !BOUNCE_SENDERS.some((sender) => email.toLowerCase().startsWith(sender.split('@')[0]))
  );
}

// Classify bounce type from NDR content
function classifyBounceType(text: string): 'Permanent' | 'Temporary' {
  const lower = text.toLowerCase();
  const permanentPatterns = [
    'user unknown', 'no such user', 'invalid address', 'does not exist',
    'mailbox not found', 'address rejected', 'bad destination', 'not found',
    'permanently rejected', '550', '551', '553', '554',
    'mailbox unavailable', 'account disabled', 'account has been disabled',
  ];
  const temporaryPatterns = [
    'temporarily', 'try again', 'mailbox full', 'over quota',
    'too many connections', '421', '450', '451', '452',
  ];

  for (const pattern of permanentPatterns) {
    if (lower.includes(pattern)) return 'Permanent';
  }
  for (const pattern of temporaryPatterns) {
    if (lower.includes(pattern)) return 'Temporary';
  }
  return 'Permanent'; // Default to permanent if unclear
}

function isBounceEmail(mail: ParsedMail): boolean {
  const from = (mail.from?.text || '').toLowerCase();
  const subject = (mail.subject || '').toLowerCase();

  // Check sender
  if (BOUNCE_SENDERS.some((s) => from.includes(s))) return true;

  // Check subject
  if (BOUNCE_SUBJECTS.some((s) => subject.includes(s))) return true;

  return false;
}

async function processBounceEmail(mail: ParsedMail): Promise<void> {
  const bodyText = mail.text || mail.html || '';
  const bouncedEmails = extractBouncedEmails(bodyText);
  const bounceType = classifyBounceType(bodyText);
  const diagnosticCode = (mail.subject || '').substring(0, 200);

  logger.info('Gmail bounce detected', {
    from: mail.from?.text,
    subject: mail.subject,
    bouncedEmails,
    bounceType,
  });

  for (const email of bouncedEmails) {
    // Find the most recent campaign_recipient for this email
    const recipientResult = await pool.query(
      `SELECT cr.id, cr.campaign_id, cr.status
       FROM campaign_recipients cr
       WHERE cr.email = $1 AND cr.status IN ('sent', 'delivered')
       ORDER BY cr.sent_at DESC LIMIT 1`,
      [email.toLowerCase()]
    );

    if (recipientResult.rows.length === 0) {
      logger.debug(`Gmail bounce: No matching recipient found for ${email}`);
      continue;
    }

    const { id: recipientId, campaign_id: campaignId, status } = recipientResult.rows[0];

    // Skip if already processed
    if (status === 'bounced') continue;

    // Update campaign recipient
    await pool.query(
      "UPDATE campaign_recipients SET status = 'bounced', bounced_at = NOW(), error_message = $1 WHERE id = $2 AND status != 'bounced'",
      [`Gmail ${bounceType}: ${diagnosticCode}`, recipientId]
    );

    // Record event
    await pool.query(
      "INSERT INTO email_events (campaign_recipient_id, campaign_id, event_type, metadata) VALUES ($1, $2, 'bounced', $3)",
      [recipientId, campaignId, JSON.stringify({ bounceType, diagnosticCode, source: 'gmail-imap' })]
    );

    // Update campaign counter
    await pool.query(
      'UPDATE campaigns SET bounce_count = bounce_count + 1, updated_at = NOW() WHERE id = $1',
      [campaignId]
    );

    // Mark contact as bounced on permanent bounce
    if (bounceType === 'Permanent') {
      await pool.query(
        "UPDATE contacts SET status = 'bounced', bounce_count = bounce_count + 1, updated_at = NOW() WHERE email = $1",
        [email.toLowerCase()]
      );
    }

    logger.info(`Gmail bounce processed: ${email} (${bounceType})`, { campaignId });
  }
}

export async function checkGmailBounces(): Promise<void> {
  // Load Gmail config from settings
  const configResult = await pool.query("SELECT value FROM settings WHERE key = 'gmail_config'");
  if (!configResult.rows[0]?.value) return;

  const gmailConfig: GmailImapConfig = typeof configResult.rows[0].value === 'string'
    ? JSON.parse(configResult.rows[0].value)
    : configResult.rows[0].value;

  if (!gmailConfig.user || !gmailConfig.pass) {
    return; // Gmail not configured
  }

  // Check if we're actually using Gmail provider
  const providerResult = await pool.query("SELECT value FROM settings WHERE key = 'email_provider'");
  const currentProvider = providerResult.rows[0]?.value;
  if (currentProvider !== 'gmail' && currentProvider !== '"gmail"') {
    return; // Not using Gmail, skip IMAP check
  }

  return new Promise<void>((resolve) => {
    const imap = new Imap({
      user: gmailConfig.user,
      password: gmailConfig.pass,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      connTimeout: 10000,
      authTimeout: 10000,
    });

    imap.once('ready', () => {
      // Search in INBOX for bounce-like emails from last 24 hours
      imap.openBox('INBOX', false, (err) => {
        if (err) {
          logger.error('Gmail IMAP: Failed to open inbox', { error: err.message });
          imap.end();
          resolve();
          return;
        }

        const since = new Date();
        since.setDate(since.getDate() - 1); // Last 24 hours

        imap.search(
          [
            ['SINCE', since],
            ['OR',
              ['FROM', 'mailer-daemon'],
              ['FROM', 'postmaster'],
            ],
          ],
          (searchErr, results) => {
            if (searchErr || !results || results.length === 0) {
              if (searchErr) logger.debug('Gmail IMAP: Search error', { error: searchErr.message });
              else logger.debug('Gmail IMAP: No bounce emails found');
              imap.end();
              resolve();
              return;
            }

            logger.info(`Gmail IMAP: Found ${results.length} potential bounce emails`);

            const fetch = imap.fetch(results, { bodies: '', markSeen: true });
            let processed = 0;
            const total = results.length;

            fetch.on('message', (msg) => {
              msg.on('body', (stream) => {
                simpleParser(stream as unknown as Source, async (parseErr, mail) => {
                  if (parseErr) {
                    logger.error('Gmail IMAP: Parse error', { error: parseErr.message });
                    processed++;
                    if (processed >= total) { imap.end(); resolve(); }
                    return;
                  }

                  if (isBounceEmail(mail)) {
                    try {
                      await processBounceEmail(mail);
                    } catch (procErr) {
                      logger.error('Gmail IMAP: Process error', { error: (procErr as Error).message });
                    }
                  }

                  processed++;
                  if (processed >= total) { imap.end(); resolve(); }
                });
              });
            });

            fetch.once('error', (fetchErr) => {
              logger.error('Gmail IMAP: Fetch error', { error: fetchErr.message });
              imap.end();
              resolve();
            });

            fetch.once('end', () => {
              if (processed >= total) { imap.end(); resolve(); }
            });
          }
        );
      });
    });

    imap.once('error', (imapErr: Error) => {
      logger.error('Gmail IMAP: Connection error', { error: imapErr.message });
      resolve();
    });

    imap.once('end', () => {
      logger.debug('Gmail IMAP: Connection ended');
    });

    imap.connect();
  });
}
