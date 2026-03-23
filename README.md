<div align="center">

# CadenceRelay

**Production-grade bulk email platform with intelligent delivery, real-time tracking, and campaign analytics.**

[![Deploy to VPS](https://github.com/pulkitpareek18/CadenceRelay/actions/workflows/deploy.yml/badge.svg)](https://github.com/pulkitpareek18/CadenceRelay/actions/workflows/deploy.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

[Live Demo](https://yeb.mail.intellimix.online) &bull; [Report Bug](https://github.com/pulkitpareek18/CadenceRelay/issues) &bull; [Request Feature](https://github.com/pulkitpareek18/CadenceRelay/issues)

</div>

---

## Overview

CadenceRelay is a full-stack email campaign platform that lets you send bulk emails at scale through **Gmail SMTP** or **AWS SES** with built-in deliverability optimization. It handles everything from contact management and HTML template editing to send throttling, open/click tracking, bounce detection, and real-time analytics.

Built for teams that need to send thousands of personalized emails (school invitations, event announcements, newsletters) without landing in spam.

### Key Highlights

- **Dual provider** &mdash; switch between Gmail SMTP and AWS SES with one click
- **Smart throttling** &mdash; configurable emails/sec and emails/hr to protect sender reputation
- **Full tracking pipeline** &mdash; opens, clicks, bounces, complaints, unsubscribes
- **Gmail bounce detection** &mdash; IMAP inbox polling catches delayed NDR emails
- **Attachment support** &mdash; attach files up to 25 MB per campaign
- **Zero-downtime deploys** &mdash; GitHub Actions CI/CD with safe, idempotent migrations

---

## Table of Contents

- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Features](#features)
- [Getting Started](#getting-started)
- [Production Deployment](#production-deployment)
- [CI/CD Pipeline](#cicd-pipeline)
- [API Reference](#api-reference)
- [Email Deliverability](#email-deliverability)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [Contributing](#contributing)
- [License](#license)

---

## Screenshots

| Dashboard | Campaign Wizard | Template Editor |
|:---------:|:---------------:|:---------------:|
| Stats, charts, contact health | 4-step create flow with preview | Monaco editor + live preview |

| Contacts | Settings | Analytics |
|:--------:|:--------:|:---------:|
| Search, filter, CSV import | Provider toggle, test connection | Date range, export CSV |

---

## Architecture

```
                        Internet
                           |
                    [Nginx + SSL]
                    /      |      \
           [React SPA] [REST API] [Tracking]
                        |      |
                    [PostgreSQL] [Redis]
                                   |
                              [BullMQ Workers]
                              /    |    |    \
                        Dispatch  Send  Events  Scheduler
                                   |
                          [Gmail SMTP / AWS SES]
```

| Component | Role |
|-----------|------|
| **Nginx** | SSL termination, reverse proxy, rate limiting |
| **React Client** | SPA dashboard with Tailwind CSS, Recharts, Monaco Editor |
| **Express API** | REST API with JWT auth, Zod validation, Winston logging |
| **PostgreSQL** | 11 tables with JSONB fields, UUID primary keys |
| **Redis** | BullMQ job queues for async email processing |
| **Worker** | Separate process: campaign dispatch, email sending, bounce checking, event processing |

---

## Tech Stack

<table>
<tr><td><b>Frontend</b></td><td>React 18 &bull; TypeScript &bull; Vite &bull; Tailwind CSS &bull; Recharts &bull; Monaco Editor &bull; React Router v6</td></tr>
<tr><td><b>Backend</b></td><td>Node.js 20 &bull; Express &bull; TypeScript &bull; Zod &bull; Winston &bull; Handlebars</td></tr>
<tr><td><b>Database</b></td><td>PostgreSQL 16 &bull; node-pg-migrate</td></tr>
<tr><td><b>Queue</b></td><td>Redis 7 &bull; BullMQ</td></tr>
<tr><td><b>Email</b></td><td>Nodemailer (Gmail) &bull; AWS SES SDK v3 (SendRawEmailCommand)</td></tr>
<tr><td><b>Infra</b></td><td>Docker Compose &bull; Nginx &bull; Let's Encrypt &bull; GitHub Actions</td></tr>
</table>

---

## Features

### Campaign Management
- 4-step campaign wizard: Details &rarr; Template &rarr; Schedule &rarr; Review
- Send immediately or schedule for a specific date/time
- Pause and resume active campaigns
- Configurable send throttling (emails/sec, emails/hr)
- File attachments (up to 10 files, 25 MB each)
- Live progress bar with auto-refresh during sending

### Contact Management
- Create, edit, delete contacts with metadata
- Organize contacts into named lists
- CSV bulk import with duplicate detection (upsert)
- CSV export with optional list filtering
- Per-contact send history across all campaigns
- Filter by status (active, bounced, complained, unsubscribed), list, send count

### Template Engine
- Monaco code editor with HTML syntax highlighting
- Live split-pane preview (editor left, rendered right)
- Handlebars variables: `{{school_name}}`, `{{email}}`, etc.
- Automatic variable detection from template content
- Version history with restore capability
- Send test email before launching

### Tracking & Analytics
- **Open tracking** &mdash; 1x1 transparent GIF pixel, cache-busted
- **Click tracking** &mdash; link rewriting with 302 redirect, per-link stats
- **Bounce detection** &mdash; SMTP error classification (5xx permanent, 4xx temporary) + Gmail IMAP polling + AWS SNS webhooks
- **Complaint handling** &mdash; AWS SNS complaint notifications
- **Unsubscribe** &mdash; RFC 8058 one-click unsubscribe with `List-Unsubscribe` headers
- **Dashboard** &mdash; send volume, open/click/bounce rates, contact health, recent campaigns
- **Analytics page** &mdash; date range filtering, time-series charts, CSV export

### Deliverability
- `List-Unsubscribe` + `List-Unsubscribe-Post` headers (RFC 8058, required by Gmail/Yahoo)
- `Feedback-ID` header for Gmail Postmaster Tools
- Proper `From`, `Reply-To`, `Message-ID` headers
- Multipart alternative (HTML + plain text)
- Automatic suppression of bounced and complained contacts
- Smart retry: permanent bounces skip retry, rate limits backoff exponentially

### Security
- JWT authentication with access + refresh tokens
- Bcrypt password hashing (12 rounds)
- Sensitive credentials masked in API responses
- Zod request validation on all endpoints
- Helmet security headers
- Nginx rate limiting per endpoint type
- HTTPS with auto-renewing Let's Encrypt certificates
- Executable file uploads blocked

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Git](https://git-scm.com/)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/pulkitpareek18/CadenceRelay.git
cd CadenceRelay

# Start all services (dev mode with hot reload)
docker compose up --build

# In another terminal, run database migrations
docker compose exec server npx node-pg-migrate up \
  --tsconfig tsconfig.json \
  --migration-file-language ts \
  --migrations-dir src/db/migrations

# Seed the admin user
docker compose exec server npx ts-node src/db/seeds/001_admin-user.ts
```

Open **http://localhost:5173** and log in with `admin` / `admin123`.

### Development Ports

| Service | Port | URL |
|---------|------|-----|
| Frontend (Vite) | 5173 | http://localhost:5173 |
| API Server | 3001 | http://localhost:3001 |
| PostgreSQL | 5432 | `psql -h localhost -U bulk_email_user -d bulk_email` |
| Redis | 6379 | `redis-cli -h localhost` |

---

## Production Deployment

### 1. Provision a VPS

Any Ubuntu 22+ server with 2+ vCPUs and 4+ GB RAM. The app runs well on 8 GB.

### 2. Run the setup script

```bash
ssh root@your-server-ip
curl -fsSL https://raw.githubusercontent.com/pulkitpareek18/CadenceRelay/main/scripts/setup-vps.sh | bash
```

### 3. Configure environment

```bash
cd /opt/cadencerelay
nano .env
```

Set real values for `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_PASSWORD`, and `TRACKING_DOMAIN`.

### 4. Start the application

```bash
docker compose -f docker-compose.prod.yml up -d --build

# Run migrations
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U $POSTGRES_USER -d $POSTGRES_DB < scripts/migrate.sql

# Seed admin
docker cp scripts/seed-admin.js cadencerelay-server-1:/app/seed-admin.js
docker compose -f docker-compose.prod.yml exec -T server node /app/seed-admin.js
```

### 5. DNS Records

Point your domain to the VPS and add deliverability records:

| Type | Host | Value |
|------|------|-------|
| `A` | `yeb.mail` | `YOUR_VPS_IP` |
| `TXT` | `yeb.mail` | `v=spf1 include:amazonses.com include:_spf.google.com ~all` |
| `TXT` | `_dmarc.yeb.mail` | `v=DMARC1; p=none; rua=mailto:admin@yourdomain.com` |

### 6. SSL Certificate

```bash
docker compose -f docker-compose.prod.yml stop nginx
docker run --rm -p 80:80 \
  -v $(pwd)/certbot-etc:/etc/letsencrypt \
  -v $(pwd)/certbot-var:/var/lib/letsencrypt \
  certbot/certbot certonly --standalone \
  -d yeb.mail.yourdomain.com --non-interactive --agree-tos --email you@email.com
docker compose -f docker-compose.prod.yml up -d nginx
```

---

## CI/CD Pipeline

Every push to `main` triggers automatic deployment via **GitHub Actions**.

```
Push to main ──> GitHub Actions ──> SSH to VPS ──> git pull ──> docker build ──> restart ──> migrate
```

The pipeline:
1. Connects to the VPS via SSH
2. Pulls latest code
3. Rebuilds Docker images (server, worker, client)
4. Restarts containers with zero downtime
5. Runs idempotent SQL migration (`IF NOT EXISTS` everywhere)
6. Seeds admin user (skips if exists)
7. Prunes old Docker images

**Database is never reset** &mdash; migrations only add tables/columns, never drop.

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | Server IP address |
| `VPS_USER` | SSH username (usually `root`) |
| `VPS_PASSWORD` | SSH password |

---

## API Reference

All endpoints prefixed with `/api/v1`. Protected routes require `Authorization: Bearer <token>`.

<details>
<summary><b>Authentication</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/login` | Login, returns JWT tokens |
| `POST` | `/auth/refresh` | Refresh access token |
| `GET` | `/auth/me` | Get current user |

</details>

<details>
<summary><b>Contacts</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/contacts` | List (paginated, searchable, filterable) |
| `POST` | `/contacts` | Create contact |
| `GET` | `/contacts/:id` | Detail + send history |
| `PUT` | `/contacts/:id` | Update |
| `DELETE` | `/contacts/:id` | Delete |
| `POST` | `/contacts/import` | CSV bulk import (multipart) |
| `GET` | `/contacts/export` | CSV export |

</details>

<details>
<summary><b>Lists</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/lists` | All lists |
| `POST` | `/lists` | Create list |
| `GET` | `/lists/:id` | List detail + contacts |
| `PUT` | `/lists/:id` | Update |
| `DELETE` | `/lists/:id` | Delete |
| `POST` | `/lists/:id/contacts` | Add contacts |
| `DELETE` | `/lists/:id/contacts` | Remove contacts |

</details>

<details>
<summary><b>Templates</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/templates` | All templates |
| `POST` | `/templates` | Create |
| `GET` | `/templates/:id` | Get with current version |
| `PUT` | `/templates/:id` | Update (creates new version) |
| `DELETE` | `/templates/:id` | Soft delete |
| `GET` | `/templates/:id/versions` | Version history |
| `POST` | `/templates/:id/preview` | Render with sample data |

</details>

<details>
<summary><b>Campaigns</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/campaigns` | List (paginated, filterable) |
| `POST` | `/campaigns` | Create (multipart, supports attachments) |
| `GET` | `/campaigns/:id` | Detail + stats |
| `PUT` | `/campaigns/:id` | Update (draft/scheduled only) |
| `DELETE` | `/campaigns/:id` | Delete (draft only) |
| `POST` | `/campaigns/:id/schedule` | Schedule with datetime |
| `POST` | `/campaigns/:id/send` | Send immediately |
| `POST` | `/campaigns/:id/pause` | Pause sending |
| `POST` | `/campaigns/:id/resume` | Resume sending |
| `GET` | `/campaigns/:id/recipients` | Recipient list with status |
| `POST` | `/campaigns/:id/attachments` | Add files |
| `DELETE` | `/campaigns/:id/attachments/:idx` | Remove file |

</details>

<details>
<summary><b>Analytics</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/analytics/dashboard` | Aggregate stats + charts |
| `GET` | `/analytics/campaigns/:id` | Per-campaign time series |
| `GET` | `/analytics/export` | CSV export |

</details>

<details>
<summary><b>Settings</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/settings` | All settings (secrets masked) |
| `PUT` | `/settings/provider` | Switch Gmail/SES |
| `PUT` | `/settings/gmail` | Gmail SMTP config |
| `PUT` | `/settings/ses` | AWS SES config |
| `PUT` | `/settings/throttle` | Default throttle limits |
| `POST` | `/settings/test-email` | Send test email |

</details>

<details>
<summary><b>Tracking (Public)</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/t/o/:token` | Open tracking pixel |
| `GET` | `/t/c/:token/:idx` | Click redirect |
| `GET` | `/t/u/:token` | Unsubscribe page |
| `POST` | `/t/u/:token` | One-click unsubscribe |

</details>

<details>
<summary><b>Webhooks (Public)</b></summary>

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/webhooks/sns` | AWS SNS bounce/complaint notifications |

</details>

---

## Email Deliverability

CadenceRelay is designed to keep your emails out of spam:

| Technique | Implementation |
|-----------|---------------|
| **SPF** | DNS TXT record authenticates sending servers |
| **DKIM** | Configure in AWS SES or Google Workspace |
| **DMARC** | DNS TXT record with policy and reporting |
| **List-Unsubscribe** | RFC 8058 headers on every email (required by Gmail/Yahoo since 2024) |
| **Throttling** | Configurable rate limits prevent spike patterns |
| **Warm-up** | Start with 100/day, double weekly |
| **Bounce suppression** | Hard-bounced contacts auto-suppressed from future sends |
| **Complaint handling** | Complained contacts auto-suppressed |
| **Multipart** | HTML + plain text alternative |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_DB` | Database name | `bulk_email` |
| `POSTGRES_USER` | Database user | `bulk_email_user` |
| `POSTGRES_PASSWORD` | Database password | &mdash; |
| `JWT_SECRET` | JWT signing secret (32+ chars) | &mdash; |
| `JWT_REFRESH_SECRET` | Refresh token secret (32+ chars) | &mdash; |
| `ADMIN_USERNAME` | Dashboard login username | `admin` |
| `ADMIN_PASSWORD` | Dashboard login password | &mdash; |
| `TRACKING_DOMAIN` | Public URL for tracking pixels/links | &mdash; |
| `UPLOAD_DIR` | File attachment storage path | `/app/uploads` |

---

## Database Schema

11 tables across 4 domains:

```
Users:     admin_users
Contacts:  contacts, contact_lists, contact_list_members
Campaigns: campaigns, campaign_recipients, templates, template_versions
Tracking:  email_events, settings, unsubscribes
```

All tables use UUID primary keys and `timestamptz` timestamps. Campaign stats are denormalized for fast dashboard reads.

---

## Project Structure

```
CadenceRelay/
├── .github/workflows/     # CI/CD pipeline
├── client/                # React frontend (Vite + Tailwind)
│   └── src/
│       ├── pages/         # 12 page components
│       ├── components/    # Layout, UI components
│       ├── api/           # Axios API clients
│       └── context/       # Auth context
├── server/                # Express backend (TypeScript)
│   └── src/
│       ├── controllers/   # Route handlers
│       ├── services/      # Email providers (Gmail, SES)
│       ├── workers/       # BullMQ job processors
│       ├── middleware/     # Auth, validation, error handling
│       └── db/            # Migrations and seeds
├── nginx/                 # Nginx configs (dev + prod)
├── scripts/               # Setup, migration, seed scripts
├── docker-compose.yml     # Dev environment
├── docker-compose.prod.yml # Production environment
└── .env.example           # Environment template
```

---

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">

**Built by [Pulkit Pareek](https://github.com/pulkitpareek18)**

</div>
