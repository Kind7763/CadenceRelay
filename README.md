<div align="center">

<img src="https://img.shields.io/badge/CadenceRelay-Email_Platform-4F46E5?style=for-the-badge&logo=mailchimp&logoColor=white" alt="CadenceRelay" />

# CadenceRelay

### The open-source bulk email platform you actually want to self-host.

Send 100,000+ personalized emails through Gmail SMTP or AWS SES with real-time tracking, smart throttling, and zero emails in spam.

[![Deploy Status](https://github.com/pulkitpareek18/CadenceRelay/actions/workflows/deploy.yml/badge.svg)](https://github.com/pulkitpareek18/CadenceRelay/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![License](https://img.shields.io/badge/License-Source_Available-orange.svg)](LICENSE)

[Live Demo](https://yeb.mail.intellimix.online) &bull; [Report Bug](https://github.com/pulkitpareek18/CadenceRelay/issues) &bull; [Request Feature](https://github.com/pulkitpareek18/CadenceRelay/issues) &bull; [Sponsor](https://github.com/sponsors/pulkitpareek18)

<br />

**If CadenceRelay saves you time or money, consider [sponsoring the project](https://github.com/sponsors/pulkitpareek18).**

</div>

---

## Why CadenceRelay?

Most email tools either cost a fortune at scale (Mailchimp charges $800/mo for 100K contacts) or require a PhD to self-host. CadenceRelay is different:

- **$0/month** on your own VPS (just pay for the server + SES costs at ~$0.10 per 1,000 emails)
- **Takes 10 minutes** to deploy with Docker Compose
- **Doesn't land in spam** — built-in deliverability best practices, proper headers, throttling
- **Tracks everything** — opens, clicks, bounces, complaints, with per-recipient event history
- **Handles 280K+ contacts** — tested with large-scale real-world datasets

<br />

## Screenshots

<details>
<summary><b>Dashboard & Analytics</b></summary>

Real-time analytics with date range filters, campaign selection, send volume charts, engagement metrics, and CSV/PDF export.

</details>

<details>
<summary><b>Campaign Wizard</b></summary>

4-step campaign creation: Details → Template → Schedule → Review. Auto-save drafts, file attachments, template preview.

</details>

<details>
<summary><b>Template Editor</b></summary>

Monaco code editor with live split-pane preview. Handlebars variables, version history with nicknames, restore to any version.

</details>

<details>
<summary><b>Contact Management</b></summary>

Smart lists with dynamic filters (state, district, category, management). CSV import handles 280K+ rows. Per-contact engagement analytics.

</details>

---

## Features

### Email Sending
| Feature | Description |
|---------|-------------|
| **Dual Provider** | Switch between Gmail SMTP and AWS SES with one click |
| **Smart Throttling** | Configurable emails/sec and emails/hr to protect sender reputation |
| **Background Processing** | Click send and close your browser — BullMQ worker handles the rest |
| **Pause / Resume** | Pause a running campaign and resume later without losing progress |
| **Scheduling** | Schedule campaigns for a future date/time with countdown display |
| **Attachments** | Up to 10 files (25MB each) with preview, thumbnail, and download |
| **Personalization** | Handlebars variables: `{{name}}`, `{{school_name}}`, `{{state}}`, custom fields |
| **Reply-To** | Custom reply-to address so responses go where you want |
| **From Name** | Configurable display name (e.g., "Acme Corp - Marketing") |

### Tracking & Analytics
| Feature | Description |
|---------|-------------|
| **Open Tracking** | Invisible pixel tracks every open with timestamp, IP, user agent |
| **Click Tracking** | All links rewritten through tracking proxy with redirect |
| **Open Count** | See how many times each recipient opened (not just first open) |
| **Click Count** | Track every click per recipient with URL details |
| **Bounce Detection** | Gmail IMAP polling + AWS SNS webhooks for real-time bounce alerts |
| **Complaint Tracking** | AWS SES feedback loop integration |
| **Event Timeline** | Expandable per-recipient event history on campaign detail page |
| **Contact Analytics** | Per-contact engagement metrics across all campaigns |
| **Dashboard Filters** | Filter by date range, specific campaigns, providers |
| **CSV Export** | Export analytics data as formatted CSV |
| **Unsubscribe** | RFC 8058 one-click unsubscribe with List-Unsubscribe headers |

### Contact Management
| Feature | Description |
|---------|-------------|
| **CSV Import** | Stream-based import handles 280K+ rows (65MB+ files) without memory issues |
| **Smart Lists** | Dynamic lists based on filters (state, district, category, management, classes) |
| **School Data** | Built-in support for school fields: state, district, block, classes, category, management |
| **Custom Variables** | Define custom fields (principal_name, phone, etc.) that appear in contact forms and templates |
| **Bulk Operations** | Multi-select contacts/campaigns for bulk delete with admin password protection |
| **Send History** | See how many times each contact was emailed, with open/click stats |
| **Column Sorting** | Sort by name, email, state, district, status, send count |
| **Advanced Filters** | Filter by state, district, category, management, status, send count |

### Template System
| Feature | Description |
|---------|-------------|
| **Monaco Editor** | Full IDE-like HTML editor with syntax highlighting |
| **Live Preview** | Split-pane preview updates as you type |
| **Version History** | Browse, preview, restore any version. Add nicknames like "Final version" |
| **Handlebars Variables** | Auto-detected variables panel with click-to-copy |
| **HTML Import** | Import HTML files directly into the editor |
| **Send Test** | Send test emails directly from the editor |

### Campaign Management
| Feature | Description |
|---------|-------------|
| **Draft Auto-Save** | Campaigns auto-save as drafts with all settings and attachments preserved |
| **Edit Drafts** | Return to the full creation wizard to edit any draft |
| **Schedule with Countdown** | See scheduled time with live countdown, reschedule or cancel |
| **Email Preview** | View the exact email (subject, body, attachments) on any campaign |
| **Attachment Preview** | Preview images/PDFs inline, download any file type |

### Infrastructure
| Feature | Description |
|---------|-------------|
| **Dockerized** | Full Docker Compose setup with dev, test, and production profiles |
| **CI/CD** | GitHub Actions: type-check → build → deploy to VPS on every push |
| **Zero-Downtime Deploy** | Database migrations use `IF NOT EXISTS` — data is never lost |
| **SSL/HTTPS** | Let's Encrypt with auto-renewal via Certbot |
| **Redis Caching** | Settings, contact filters cached for sub-millisecond responses |
| **Credential Encryption** | AES-256-GCM encryption for all provider credentials at rest |
| **Rate Limiting** | API rate limiting + tracking endpoint burst protection |

---

## Tech Stack

```
Frontend:   React 18 · TypeScript · Vite · Tailwind CSS · React Query · Recharts · Monaco Editor
Backend:    Node.js 20 · Express · TypeScript · BullMQ · Nodemailer · AWS SDK v3
Database:   PostgreSQL 16 · Redis 7
Infra:      Docker Compose · Nginx · Certbot · GitHub Actions
```

---

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Git

### 1. Clone & Configure

```bash
git clone https://github.com/pulkitpareek18/CadenceRelay.git
cd CadenceRelay
cp .env.example .env
```

Edit `.env` with your settings:
```env
POSTGRES_DB=cadencerelay
POSTGRES_USER=cadencerelay
POSTGRES_PASSWORD=your-secure-password
JWT_SECRET=your-32-char-secret-here
JWT_REFRESH_SECRET=another-32-char-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-admin-password
TRACKING_DOMAIN=https://your-domain.com
```

### 2. Start (Development)

```bash
docker compose up -d
```

Open `http://localhost:5173` and login with your admin credentials.

### 3. Start (Production)

```bash
docker compose -f docker-compose.prod.yml up -d
```

See [Production Deployment](#production-deployment) for full VPS setup with SSL.

---

## Production Deployment

<details>
<summary><b>Full VPS deployment guide (click to expand)</b></summary>

### Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 1 vCPU | 2+ vCPUs |
| RAM | 2 GB | 4+ GB |
| Storage | 20 GB | 50+ GB (for attachments) |
| OS | Ubuntu 22.04+ | Ubuntu 24.04 |

### Step 1: Install Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### Step 2: Clone & Configure

```bash
cd /opt
git clone https://github.com/pulkitpareek18/CadenceRelay.git cadencerelay
cd cadencerelay
cp .env.example .env
nano .env  # Edit with production values
```

### Step 3: SSL Certificate

```bash
# Start nginx for ACME challenge
docker compose -f docker-compose.prod.yml up -d nginx
# Get certificate
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d your-domain.com
```

### Step 4: Launch

```bash
docker compose -f docker-compose.prod.yml up -d
```

### Step 5: DNS Records

Point your domain to the server IP:
```
A     your-domain.com    → YOUR_SERVER_IP
```

For email deliverability, also add:
```
TXT   your-domain.com    → v=spf1 include:amazonses.com ~all
TXT   _dmarc.your-domain → v=DMARC1; p=quarantine; rua=mailto:dmarc@your-domain.com
```

DKIM is auto-configured by AWS SES.

</details>

---

## CI/CD Pipeline

Every push to `main` triggers:

```
Push → Type Check → Build Client & Server → SSH Deploy → Rebuild Containers → Migrate DB → Verify Health
```

Database is **never reset** — migrations use `IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`.

---

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │              Nginx                   │
                    │    (SSL termination + reverse proxy) │
                    └─────┬──────────────────┬────────────┘
                          │                  │
                    ┌─────▼─────┐    ┌───────▼───────┐
                    │  React    │    │   Express     │
                    │  Client   │    │   API Server  │
                    │  (Vite)   │    │               │
                    └───────────┘    └───┬───────┬───┘
                                        │       │
                                  ┌─────▼───┐ ┌─▼──────────┐
                                  │PostgreSQL│ │   Redis     │
                                  │   16     │ │   7         │
                                  └─────────┘ └──────┬──────┘
                                                     │
                                              ┌──────▼──────┐
                                              │  BullMQ     │
                                              │  Worker     │
                                              │ (send,track,│
                                              │  schedule)  │
                                              └─────────────┘
```

---

## Email Deliverability

CadenceRelay is built to land in the **Primary inbox**, not Promotions or Spam:

- **SPF/DKIM/DMARC** — full support with setup guide
- **RFC 8058** one-click unsubscribe headers
- **Smart throttling** — don't trigger rate limits
- **Bounce handling** — auto-marks bounced contacts to protect reputation
- **Complaint tracking** — auto-unsubscribes complainers
- **Personalization** — per-recipient variable substitution makes emails feel personal

---

## API Reference

<details>
<summary><b>Authentication</b></summary>

```
POST /api/v1/auth/login        — Login (returns JWT + refresh token)
POST /api/v1/auth/refresh      — Refresh access token
```
</details>

<details>
<summary><b>Campaigns</b></summary>

```
GET    /api/v1/campaigns                    — List campaigns (paginated, filterable)
POST   /api/v1/campaigns                    — Create campaign (with attachments)
GET    /api/v1/campaigns/:id                — Get campaign details
PUT    /api/v1/campaigns/:id                — Update campaign
DELETE /api/v1/campaigns/:id                — Delete campaign (admin password required)
POST   /api/v1/campaigns/:id/send           — Send campaign
POST   /api/v1/campaigns/:id/schedule       — Schedule campaign
POST   /api/v1/campaigns/:id/pause          — Pause sending
POST   /api/v1/campaigns/:id/resume         — Resume sending
GET    /api/v1/campaigns/:id/recipients     — List recipients (paginated, filterable)
POST   /api/v1/campaigns/:id/attachments    — Add attachments
DELETE /api/v1/campaigns/:id/attachments/:i  — Remove attachment
GET    /api/v1/campaigns/:id/attachments/:i  — Download attachment
```
</details>

<details>
<summary><b>Contacts</b></summary>

```
GET    /api/v1/contacts                 — List contacts (paginated, filterable, sortable)
POST   /api/v1/contacts                 — Create contact
GET    /api/v1/contacts/:id             — Get contact with send history
PUT    /api/v1/contacts/:id             — Update contact
DELETE /api/v1/contacts/:id             — Delete contact (admin password required)
POST   /api/v1/contacts/import-csv      — Import CSV (stream-based, handles 280K+ rows)
GET    /api/v1/contacts/filters         — Get filter options (states, districts, etc.)
```
</details>

<details>
<summary><b>Templates</b></summary>

```
GET    /api/v1/templates                       — List templates
POST   /api/v1/templates                       — Create template
GET    /api/v1/templates/:id                   — Get template
PUT    /api/v1/templates/:id                   — Update template (creates new version)
DELETE /api/v1/templates/:id                   — Delete template
GET    /api/v1/templates/:id/versions          — List versions
GET    /api/v1/templates/:id/versions/:v       — Get specific version
POST   /api/v1/templates/:id/versions/:v/restore — Restore version
PUT    /api/v1/templates/:id/versions/:v/label   — Set version nickname
```
</details>

<details>
<summary><b>Analytics</b></summary>

```
GET    /api/v1/analytics/dashboard                    — Dashboard stats
GET    /api/v1/analytics/campaigns/:id                — Campaign analytics
GET    /api/v1/analytics/recipients/:id/events        — Recipient event history
GET    /api/v1/analytics/contacts/:id                 — Contact engagement analytics
GET    /api/v1/analytics/export                       — Export analytics as CSV
```
</details>

<details>
<summary><b>Lists, Settings, Tracking</b></summary>

```
GET/POST/PUT/DELETE  /api/v1/lists/*          — Contact list management
GET/PUT              /api/v1/settings/*        — Provider config, throttling, reply-to
POST                 /api/v1/settings/test-email — Send test email
GET                  /api/v1/t/o/:token        — Open tracking pixel
GET                  /api/v1/t/c/:token/:idx   — Click tracking redirect
POST                 /api/v1/t/u/:token        — Unsubscribe
```
</details>

---

## Template Variables

Use Handlebars syntax `{{variable_name}}` in your templates:

### Standard Variables (auto-populated from contact data)

| Variable | Example Value |
|----------|--------------|
| `{{name}}` | St. Xavier's High School |
| `{{email}}` | school@example.com |
| `{{state}}` | Goa |
| `{{district}}` | North Goa |
| `{{block}}` | Tiswadi |
| `{{classes}}` | 1-12 |
| `{{category}}` | Secondary with Higher Secondary |
| `{{management}}` | Private Unaided (Recognized) |
| `{{address}}` | Plot No. 6, Tiswadi, North Goa |

### Custom Variables

Define custom variables in Settings → Custom Variables. They appear in contact forms, CSV import, and template editor.

---

## Scaling Guide

| Scale | Setup | Expected Throughput |
|-------|-------|-------------------|
| **Small** (< 10K emails/day) | Single VPS, Gmail SMTP | ~500 emails/hour |
| **Medium** (10K-100K/day) | Single VPS, AWS SES | ~5,000 emails/hour |
| **Large** (100K+/day) | Multiple workers, SES production | ~50,000 emails/hour |

To scale the worker:
```bash
docker compose -f docker-compose.prod.yml up -d --scale worker=3
```

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

By contributing, you agree to the [Contributor License Agreement](LICENSE) — your contributions are licensed under the same terms.

---

## Support the Project

If CadenceRelay helps you save time or money:

- **Star this repo** — it helps others discover the project
- **[Sponsor on GitHub](https://github.com/sponsors/pulkitpareek18)** — fund ongoing development
- **Share it** — tweet, blog, or tell a friend

---

## License

CadenceRelay is **source-available** under a custom license. See [LICENSE](LICENSE) for details.

**TL;DR:**
- Personal/non-commercial use: **Free**
- Commercial/SaaS use: **Requires license** — contact pulkitpareek18@gmail.com
- All rights reserved by [Pulkit Pareek](https://github.com/pulkitpareek18)

---

<div align="center">

**[Star this repo](https://github.com/pulkitpareek18/CadenceRelay)** if you find it useful.

Made with determination in India.

</div>
