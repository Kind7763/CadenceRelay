-- CadenceRelay Database Migration
-- This file is run directly via psql in production

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- admin_users
CREATE TABLE IF NOT EXISTS admin_users (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    username varchar(100) UNIQUE NOT NULL,
    password_hash varchar(255) NOT NULL,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

-- contacts
CREATE TABLE IF NOT EXISTS contacts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email varchar(320) NOT NULL,
    name varchar(255),
    metadata jsonb DEFAULT '{}'::jsonb,
    status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'bounced', 'complained', 'unsubscribed')),
    bounce_count integer DEFAULT 0,
    send_count integer DEFAULT 0,
    last_sent_at timestamptz,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_idx ON contacts(email);
CREATE INDEX IF NOT EXISTS contacts_status_idx ON contacts(status);
CREATE INDEX IF NOT EXISTS contacts_send_count_idx ON contacts(send_count);

-- contact_lists
CREATE TABLE IF NOT EXISTS contact_lists (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name varchar(255) NOT NULL,
    description text,
    contact_count integer DEFAULT 0,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

-- contact_list_members
CREATE TABLE IF NOT EXISTS contact_list_members (
    contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    list_id uuid NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
    added_at timestamptz DEFAULT NOW(),
    PRIMARY KEY (contact_id, list_id)
);
CREATE INDEX IF NOT EXISTS clm_list_id_idx ON contact_list_members(list_id);

-- templates
CREATE TABLE IF NOT EXISTS templates (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name varchar(255) NOT NULL,
    subject varchar(998) NOT NULL,
    html_body text NOT NULL,
    text_body text,
    variables jsonb DEFAULT '[]'::jsonb,
    version integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

-- template_versions
CREATE TABLE IF NOT EXISTS template_versions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    version integer NOT NULL,
    subject varchar(998) NOT NULL,
    html_body text NOT NULL,
    text_body text,
    variables jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT NOW()
);

-- campaigns
CREATE TABLE IF NOT EXISTS campaigns (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name varchar(255) NOT NULL,
    template_id uuid REFERENCES templates(id),
    list_id uuid REFERENCES contact_lists(id),
    status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','paused','completed','failed')),
    provider varchar(10) NOT NULL DEFAULT 'ses' CHECK (provider IN ('gmail', 'ses')),
    scheduled_at timestamptz,
    started_at timestamptz,
    completed_at timestamptz,
    throttle_per_second integer DEFAULT 5,
    throttle_per_hour integer DEFAULT 5000,
    total_recipients integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    bounce_count integer DEFAULT 0,
    open_count integer DEFAULT 0,
    click_count integer DEFAULT 0,
    complaint_count integer DEFAULT 0,
    unsubscribe_count integer DEFAULT 0,
    attachments jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS campaigns_status_idx ON campaigns(status);

-- campaign_recipients
CREATE TABLE IF NOT EXISTS campaign_recipients (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contact_id uuid REFERENCES contacts(id),
    email varchar(320) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','queued','sent','delivered','bounced','failed','opened','clicked','complained','unsubscribed')),
    provider_message_id varchar(255),
    sent_at timestamptz,
    delivered_at timestamptz,
    opened_at timestamptz,
    clicked_at timestamptz,
    bounced_at timestamptz,
    error_message text,
    tracking_token varchar(64) UNIQUE,
    link_urls jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cr_campaign_id_idx ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS cr_contact_id_idx ON campaign_recipients(contact_id);
CREATE INDEX IF NOT EXISTS cr_status_idx ON campaign_recipients(status);
CREATE INDEX IF NOT EXISTS cr_tracking_token_idx ON campaign_recipients(tracking_token);
CREATE INDEX IF NOT EXISTS cr_provider_msg_idx ON campaign_recipients(provider_message_id);

-- email_events
CREATE TABLE IF NOT EXISTS email_events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_recipient_id uuid REFERENCES campaign_recipients(id) ON DELETE CASCADE,
    campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
    event_type varchar(20) NOT NULL CHECK (event_type IN ('queued','sent','delivered','bounced','opened','clicked','complained','unsubscribed','failed')),
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ee_campaign_id_idx ON email_events(campaign_id);
CREATE INDEX IF NOT EXISTS ee_cr_id_idx ON email_events(campaign_recipient_id);
CREATE INDEX IF NOT EXISTS ee_type_idx ON email_events(event_type);
CREATE INDEX IF NOT EXISTS ee_created_idx ON email_events(created_at);

-- settings
CREATE TABLE IF NOT EXISTS settings (
    key varchar(100) PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz DEFAULT NOW()
);
INSERT INTO settings (key, value) VALUES
    ('email_provider', '"ses"'),
    ('gmail_config', '{"host":"smtp.gmail.com","port":587,"user":"","pass":""}'),
    ('ses_config', '{"region":"ap-south-1","accessKeyId":"","secretAccessKey":"","fromEmail":""}'),
    ('throttle_defaults', '{"perSecond":5,"perHour":5000}'),
    ('tracking_domain', '"https://yeb.mail.intellimix.online"')
ON CONFLICT (key) DO NOTHING;

-- School-specific columns on contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS state varchar(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS district varchar(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS block varchar(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS classes varchar(50);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS category varchar(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS management varchar(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address text;

-- Widen classes column to handle longer values
DO $$ BEGIN
  ALTER TABLE contacts ALTER COLUMN classes TYPE varchar(255);
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS contacts_state_idx ON contacts(state);
CREATE INDEX IF NOT EXISTS contacts_district_idx ON contacts(district);
CREATE INDEX IF NOT EXISTS contacts_category_idx ON contacts(category);
CREATE INDEX IF NOT EXISTS contacts_management_idx ON contacts(management);

-- Smart list columns on contact_lists
ALTER TABLE contact_lists ADD COLUMN IF NOT EXISTS is_smart boolean DEFAULT false;
ALTER TABLE contact_lists ADD COLUMN IF NOT EXISTS filter_criteria jsonb;

-- unsubscribes
CREATE TABLE IF NOT EXISTS unsubscribes (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email varchar(320) NOT NULL,
    campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
    reason text,
    created_at timestamptz DEFAULT NOW()
);
-- Fix: unique per email+campaign, not just email (allow same email to unsub from multiple campaigns)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'unsub_email_idx') THEN
    DROP INDEX unsub_email_idx;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS unsub_email_campaign_idx ON unsubscribes(email, campaign_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS cr_campaign_status_idx ON campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS contacts_created_idx ON contacts(created_at);

-- Version label/nickname for template versions
ALTER TABLE template_versions ADD COLUMN IF NOT EXISTS label varchar(100);

-- Open/click count tracking on campaign_recipients
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS open_count integer DEFAULT 0;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS click_count integer DEFAULT 0;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS last_opened_at timestamptz;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS last_clicked_at timestamptz;

-- Campaign management columns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_starred boolean DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS label_name varchar(50);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS label_color varchar(20);

CREATE INDEX IF NOT EXISTS campaigns_starred_idx ON campaigns(is_starred) WHERE is_starred = true;
CREATE INDEX IF NOT EXISTS campaigns_archived_idx ON campaigns(is_archived);

-- Predefined campaign labels
CREATE TABLE IF NOT EXISTS campaign_labels (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name varchar(50) NOT NULL,
    color varchar(20) NOT NULL DEFAULT '#6B7280',
    created_at timestamptz DEFAULT NOW()
);

-- Dynamic variables per campaign (counter, date, pattern, etc.)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS dynamic_variables jsonb DEFAULT '[]'::jsonb;

-- Custom variable definitions
CREATE TABLE IF NOT EXISTS custom_variables (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name varchar(100) NOT NULL,
    key varchar(100) UNIQUE NOT NULL,
    type varchar(20) DEFAULT 'text',
    options jsonb DEFAULT '[]'::jsonb,
    required boolean DEFAULT false,
    default_value varchar(255),
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT NOW()
);

-- Projects system
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name varchar(255) NOT NULL,
  description text,
  color varchar(20) DEFAULT '#6366f1',
  icon varchar(10),
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE contact_lists ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS campaigns_project_id_idx ON campaigns(project_id);
CREATE INDEX IF NOT EXISTS templates_project_id_idx ON templates(project_id);
CREATE INDEX IF NOT EXISTS contact_lists_project_id_idx ON contact_lists(project_id);

-- Daily send limits
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS pause_reason text;
INSERT INTO settings (key, value) VALUES ('gmail_daily_limit', '500') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('ses_daily_limit', '50000') ON CONFLICT (key) DO NOTHING;

-- Suppression list
CREATE TABLE IF NOT EXISTS suppression_list (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email varchar(320) NOT NULL,
    reason text DEFAULT 'manual',
    added_by varchar(50) DEFAULT 'manual',
    created_at timestamptz DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppression_email_idx ON suppression_list(LOWER(email));

-- Engagement scoring
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS engagement_score integer DEFAULT 50;
CREATE INDEX IF NOT EXISTS contacts_engagement_idx ON contacts(engagement_score);
INSERT INTO settings (key, value) VALUES ('engagement_scoring', '{"opened": 3, "clicked": 5, "bounced": -15, "complained": -30, "unsubscribed": -50, "decay_per_week": -5}') ON CONFLICT (key) DO NOTHING;

-- A/B Testing
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_test jsonb DEFAULT NULL;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS ab_variant varchar(10);
CREATE INDEX IF NOT EXISTS cr_ab_variant_idx ON campaign_recipients(campaign_id, ab_variant);

-- Email Automations (Drip Sequences)
CREATE TABLE IF NOT EXISTS automations (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name varchar(255) NOT NULL,
    description text,
    status varchar(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
    trigger_type varchar(30) NOT NULL CHECK (trigger_type IN ('manual', 'contact_added', 'list_joined', 'email_opened', 'email_clicked', 'tag_added')),
    trigger_config jsonb DEFAULT '{}'::jsonb,
    project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
    provider varchar(10) DEFAULT 'ses' CHECK (provider IN ('gmail', 'ses')),
    total_enrolled integer DEFAULT 0,
    total_completed integer DEFAULT 0,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_steps (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    step_order integer NOT NULL,
    template_id uuid REFERENCES templates(id),
    subject_override varchar(998),
    delay_days integer DEFAULT 0,
    delay_hours integer DEFAULT 0,
    delay_minutes integer DEFAULT 0,
    created_at timestamptz DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auto_steps_automation_idx ON automation_steps(automation_id, step_order);

CREATE TABLE IF NOT EXISTS automation_enrollments (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    current_step integer DEFAULT 0,
    status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
    enrolled_at timestamptz DEFAULT NOW(),
    next_step_at timestamptz,
    completed_at timestamptz,
    last_step_sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS auto_enroll_automation_idx ON automation_enrollments(automation_id);
CREATE INDEX IF NOT EXISTS auto_enroll_next_step_idx ON automation_enrollments(next_step_at) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS auto_enroll_unique_idx ON automation_enrollments(automation_id, contact_id);

-- Bounce type differentiation (permanent / transient / undetermined)
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS bounce_type varchar(20);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bounce_type varchar(20);
CREATE INDEX IF NOT EXISTS cr_bounce_type_idx ON campaign_recipients(bounce_type) WHERE bounce_type IS NOT NULL;

-- Campaign subject override
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS subject_override varchar(998);

-- Contact health check
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS health_status varchar(20) DEFAULT 'unchecked';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS health_checked_at timestamptz;
CREATE INDEX IF NOT EXISTS contacts_health_status_idx ON contacts(health_status);

-- Template snapshot: freeze template content when campaign first sends
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS template_version integer;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS template_snapshot_subject varchar(998);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS template_snapshot_html text;

-- Unique constraint on campaign_recipients to prevent duplicate sends
CREATE UNIQUE INDEX IF NOT EXISTS cr_campaign_contact_unique ON campaign_recipients(campaign_id, contact_id) WHERE contact_id IS NOT NULL;

-- Email accounts (multi-Gmail / multi-SES support)
CREATE TABLE IF NOT EXISTS email_accounts (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    label varchar(100) NOT NULL,
    provider_type varchar(10) NOT NULL CHECK (provider_type IN ('gmail', 'ses')),
    config jsonb NOT NULL DEFAULT '{}',
    daily_limit integer DEFAULT 500,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT NOW(),
    updated_at timestamptz DEFAULT NOW()
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS email_account_id uuid REFERENCES email_accounts(id) ON DELETE SET NULL;

-- Per-campaign reply-to override
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reply_to varchar(320);

-- Domain-level suppression
CREATE TABLE IF NOT EXISTS suppressed_domains (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain varchar(255) NOT NULL,
    reason text DEFAULT 'manual',
    added_by varchar(50) DEFAULT 'manual',
    created_at timestamptz DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppressed_domain_idx ON suppressed_domains(LOWER(domain));
