#!/usr/bin/env node
/**
 * CadenceRelay SMTP Email Verifier
 * Run on your laptop (port 25 must be open)
 *
 * Usage:
 *   node smtp-verifier.js --input emails.csv --output results.csv
 *   node smtp-verifier.js --input emails.csv --output results.csv --rate 3
 *
 * Input CSV: must have an "email" column header
 * Output CSV: email, valid, status, reason, domain, mx_host, catch_all
 */

const net = require('net');
const dns = require('dns');
const fs = require('fs');
const readline = require('readline');

// ── Config ──
const args = process.argv.slice(2);
const inputFile = getArg('--input') || getArg('-i');
const outputFile = getArg('--output') || getArg('-o') || 'verification-results.csv';
const ratePerSec = parseInt(getArg('--rate') || '2');
const timeout = parseInt(getArg('--timeout') || '10000');
const skipGmail = args.includes('--skip-gmail');

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

if (!inputFile) {
  console.log(`
CadenceRelay SMTP Email Verifier
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage:
  node smtp-verifier.js --input emails.csv --output results.csv

Options:
  --input, -i    Input CSV file (must have "email" column)
  --output, -o   Output CSV file (default: verification-results.csv)
  --rate         Verifications per second (default: 2)
  --timeout      SMTP timeout in ms (default: 10000)
  --skip-gmail   Skip Gmail/Outlook/Yahoo (they don't support SMTP verification)

Examples:
  node smtp-verifier.js -i contacts.csv -o verified.csv
  node smtp-verifier.js -i contacts.csv -o verified.csv --rate 3 --skip-gmail
`);
  process.exit(0);
}

// ── Domains that don't support SMTP verification ──
const UNVERIFIABLE_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'outlook.in',
  'yahoo.com', 'yahoo.co.in', 'yahoo.in', 'ymail.com', 'rocketmail.com',
  'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'zoho.com', 'zohomail.in',
]);

// ── MX + Catch-all cache ──
const mxCache = new Map(); // domain → { mx: string, catchAll: boolean }
const dnsResolver = new dns.Resolver();
dnsResolver.setServers(['8.8.8.8', '1.1.1.1']);

// ── Stats ──
let total = 0, checked = 0, valid = 0, invalid = 0, catchAll = 0, unverifiable = 0, errors = 0;

// ── DNS MX Lookup ──
function getMxHost(domain) {
  return new Promise((resolve) => {
    dnsResolver.resolveMx(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        resolve(null);
        return;
      }
      // Pick the MX with lowest priority number
      addresses.sort((a, b) => a.priority - b.priority);
      resolve(addresses[0].exchange);
    });
  });
}

// ── SMTP Conversation ──
function smtpVerify(email, mxHost) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let step = 0;
    let result = { valid: false, status: 'unknown', reason: '' };
    let buffer = '';
    let done = false;

    function finish(res) {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve(res);
    }

    socket.setTimeout(timeout);
    socket.on('timeout', () => finish({ valid: false, status: 'timeout', reason: 'Connection timed out' }));
    socket.on('error', (err) => finish({ valid: false, status: 'error', reason: err.message }));

    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.substring(0, 3));

        if (step === 0 && code === 220) {
          // Server greeting → send EHLO
          step = 1;
          socket.write('EHLO cadencerelay.com\r\n');
        } else if (step === 1 && (code === 250 || code === 220)) {
          // EHLO accepted → send MAIL FROM
          step = 2;
          socket.write('MAIL FROM:<verify@cadencerelay.com>\r\n');
        } else if (step === 2 && code === 250) {
          // MAIL FROM accepted → send RCPT TO
          step = 3;
          socket.write(`RCPT TO:<${email}>\r\n`);
        } else if (step === 3) {
          // RCPT TO response — this is the verification result
          step = 4;
          socket.write('QUIT\r\n');

          if (code === 250 || code === 251) {
            finish({ valid: true, status: 'valid', reason: 'Mailbox exists' });
          } else if (code === 550 || code === 551 || code === 553 || code === 554) {
            finish({ valid: false, status: 'invalid', reason: line.substring(4) || 'Mailbox not found' });
          } else if (code === 450 || code === 451 || code === 452) {
            finish({ valid: false, status: 'temporary', reason: line.substring(4) || 'Temporary error — try later' });
          } else if (code === 421) {
            finish({ valid: false, status: 'rejected', reason: 'Server rejected connection' });
          } else {
            finish({ valid: false, status: 'unknown', reason: `Unexpected response: ${line}` });
          }
        } else if (step === 4) {
          finish(result);
        }
      }
    });

    socket.connect(25, mxHost, () => {
      // Connected — wait for greeting
    });
  });
}

// ── Catch-all Detection ──
async function isCatchAll(mxHost) {
  const randomEmail = `xz9q7test${Date.now()}random@doesnotexist.invalid`;
  // Actually we need to test against the real domain
  return false; // We'll test per-domain below
}

async function checkCatchAll(domain, mxHost) {
  const fakeEmail = `xz9q7test${Math.random().toString(36).slice(2)}@${domain}`;
  try {
    const result = await smtpVerify(fakeEmail, mxHost);
    return result.valid; // If fake email is "valid", server accepts everything (catch-all)
  } catch {
    return false;
  }
}

// ── Verify Single Email ──
async function verifyEmail(email) {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return { email, valid: false, status: 'invalid', reason: 'Invalid email format', domain: '', mxHost: '', catchAll: false };

  // Skip unverifiable domains
  if (skipGmail && UNVERIFIABLE_DOMAINS.has(domain)) {
    return { email, valid: true, status: 'skipped', reason: 'Major provider — cannot SMTP verify', domain, mxHost: '', catchAll: false };
  }

  // Check cache
  if (!mxCache.has(domain)) {
    const mx = await getMxHost(domain);
    if (!mx) {
      mxCache.set(domain, { mx: null, catchAll: false });
    } else {
      const catchAllResult = await checkCatchAll(domain, mx);
      mxCache.set(domain, { mx, catchAll: catchAllResult });
    }
  }

  const cached = mxCache.get(domain);

  if (!cached.mx) {
    return { email, valid: false, status: 'invalid', reason: 'No MX records — domain cannot receive email', domain, mxHost: '', catchAll: false };
  }

  if (cached.catchAll) {
    return { email, valid: true, status: 'catch_all', reason: 'Server accepts all addresses (catch-all)', domain, mxHost: cached.mx, catchAll: true };
  }

  try {
    const result = await smtpVerify(email, cached.mx);
    return { email, ...result, domain, mxHost: cached.mx, catchAll: false };
  } catch (err) {
    return { email, valid: false, status: 'error', reason: err.message, domain, mxHost: cached.mx, catchAll: false };
  }
}

// ── Parse CSV ──
async function loadEmails(filePath) {
  const emails = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let headers = null;
  let emailIdx = -1;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!headers) {
      headers = trimmed.toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
      emailIdx = headers.indexOf('email');
      if (emailIdx === -1) {
        console.error('ERROR: CSV must have an "email" column');
        process.exit(1);
      }
      continue;
    }

    // Simple CSV parse (handles quoted fields)
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inQuotes) {
        if (ch === '"' && trimmed[i + 1] === '"') { current += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { cols.push(current.trim()); current = ''; }
        else { current += ch; }
      }
    }
    cols.push(current.trim());

    const email = cols[emailIdx]?.trim();
    if (email && email.includes('@')) {
      emails.push(email.toLowerCase());
    }
  }

  return [...new Set(emails)]; // Deduplicate
}

// ── Sleep ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Main ──
async function main() {
  console.log('\nCadenceRelay SMTP Email Verifier');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Input:   ${inputFile}`);
  console.log(`Output:  ${outputFile}`);
  console.log(`Rate:    ${ratePerSec}/sec`);
  console.log(`Timeout: ${timeout}ms`);
  console.log(`Skip Gmail/Yahoo/Outlook: ${skipGmail ? 'Yes' : 'No'}\n`);

  // Load emails
  const emails = await loadEmails(inputFile);
  total = emails.length;
  console.log(`Loaded ${total} unique emails\n`);

  if (total === 0) {
    console.log('No emails to verify');
    return;
  }

  // Count domains
  const domainCounts = {};
  for (const e of emails) {
    const d = e.split('@')[1];
    domainCounts[d] = (domainCounts[d] || 0) + 1;
  }
  const uniqueDomains = Object.keys(domainCounts).length;
  console.log(`Unique domains: ${uniqueDomains}`);

  // Show top 5 domains
  const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  for (const [d, c] of topDomains) {
    const skip = UNVERIFIABLE_DOMAINS.has(d) ? ' (will skip)' : '';
    console.log(`  ${d}: ${c}${skip}`);
  }
  console.log();

  // Open output file
  const output = fs.createWriteStream(outputFile);
  output.write('email,valid,status,reason,domain,mx_host,catch_all\n');

  const startTime = Date.now();
  const delayMs = Math.ceil(1000 / ratePerSec);

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const result = await verifyEmail(email);

    // Write result
    const row = [
      result.email,
      result.valid,
      result.status,
      `"${(result.reason || '').replace(/"/g, '""')}"`,
      result.domain,
      result.mxHost,
      result.catchAll,
    ].join(',');
    output.write(row + '\n');

    // Update stats
    checked++;
    if (result.status === 'valid') valid++;
    else if (result.status === 'invalid') invalid++;
    else if (result.status === 'catch_all') catchAll++;
    else if (result.status === 'skipped') unverifiable++;
    else errors++;

    // Progress
    if (checked % 50 === 0 || checked === total) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = checked / elapsed;
      const eta = (total - checked) / rate;
      const etaMin = Math.ceil(eta / 60);
      process.stdout.write(`\r  ${checked}/${total} (${Math.round(checked/total*100)}%) | ✅ ${valid} valid | ❌ ${invalid} invalid | 🔄 ${catchAll} catch-all | ⏭️  ${unverifiable} skipped | ⏱️  ~${etaMin}m remaining`);
    }

    // Throttle
    await sleep(delayMs);
  }

  output.end();

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n\n━━━ Results ━━━`);
  console.log(`✅ Valid:        ${valid}`);
  console.log(`❌ Invalid:      ${invalid}`);
  console.log(`🔄 Catch-all:    ${catchAll}`);
  console.log(`⏭️  Skipped:      ${unverifiable}`);
  console.log(`⚠️  Errors:       ${errors}`);
  console.log(`━━━━━━━━━━━━━━━`);
  console.log(`Total:          ${total}`);
  console.log(`Time:           ${elapsed}s`);
  console.log(`Domains cached: ${mxCache.size}`);
  console.log(`\nResults saved to: ${outputFile}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Open ${outputFile} in a spreadsheet`);
  console.log(`  2. Filter by status = "invalid"`);
  console.log(`  3. Import those emails into CadenceRelay's suppression list`);
  console.log(`  4. Or use: node smtp-verifier.js --input ${outputFile} --filter-invalid`);
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
