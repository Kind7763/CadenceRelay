import apiClient from './client';

export async function getSettings() {
  const res = await apiClient.get('/settings');
  return res.data.settings;
}

export async function updateProvider(provider: 'gmail' | 'ses') {
  const res = await apiClient.put('/settings/provider', { provider });
  return res.data;
}

export async function updateGmailConfig(config: { user: string; pass: string; host?: string; port?: number }) {
  const res = await apiClient.put('/settings/gmail', config);
  return res.data;
}

export async function updateSesConfig(config: {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
  fromName?: string;
}) {
  const res = await apiClient.put('/settings/ses', config);
  return res.data;
}

export async function updateReplyTo(replyTo: string) {
  const res = await apiClient.put('/settings/reply-to', { replyTo });
  return res.data;
}

export async function updateThrottleDefaults(config: { perSecond: number; perHour: number }) {
  const res = await apiClient.put('/settings/throttle', config);
  return res.data;
}

export async function updateDailyLimits(config: { gmailDailyLimit: number; sesDailyLimit: number }) {
  const res = await apiClient.put('/settings/daily-limits', config);
  return res.data;
}

export async function sendTestEmail(to: string, options?: { subject?: string; html?: string; campaignId?: string; emailAccountId?: string }) {
  const res = await apiClient.post('/settings/test-email', { to, ...options });
  return res.data;
}

export interface DnsCheck {
  status: 'pass' | 'warning' | 'fail' | 'info' | 'unknown';
  message: string;
  record?: string;
  recommendation?: string;
}

export interface DomainHealthData {
  domain: string;
  healthScore: number;
  grade: string;
  checks: {
    spf: DnsCheck;
    dkim: DnsCheck;
    dmarc: DnsCheck;
    mx: DnsCheck;
  };
  metrics: {
    sent30d: number;
    bounceRate: number;
    complaintRate: number;
    unsubRate: number;
    bounceRateGrade: string;
    complaintRateGrade: string;
  };
  recommendations: string[];
}

export async function getDomainHealth(): Promise<DomainHealthData> {
  const res = await apiClient.get('/settings/domain-health');
  return res.data;
}

// ─── SES Quota ────────────────────────────────────────────────────────────────

export interface SesQuotaData {
  max24HourSend: number;
  sentLast24Hours: number;
  maxSendRate: number;
  remaining: number;
  usagePercent: number;
  sandbox: boolean;
  recentStats: Array<{
    timestamp: string;
    deliveryAttempts: number;
    bounces: number;
    complaints: number;
    rejects: number;
  }>;
}

export async function getSesQuota(): Promise<SesQuotaData> {
  const res = await apiClient.get('/settings/ses-quota');
  return res.data;
}

// ─── SNS Setup ────────────────────────────────────────────────────────────────

export interface SnsStatusData {
  configured: boolean;
  identity?: string;
  bounceTopicArn?: string;
  complaintTopicArn?: string;
  message?: string;
}

export async function getSnsStatus(): Promise<SnsStatusData> {
  const res = await apiClient.get('/settings/sns-status');
  return res.data;
}

export interface SnsSetupResult {
  message: string;
  topicArn: string;
  identity: string;
  webhookUrl: string;
}

export async function setupSns(): Promise<SnsSetupResult> {
  const res = await apiClient.post('/settings/setup-sns');
  return res.data;
}

// ─── SES Account Statistics ──────────────────────────────────────────────────

export interface SesStatsData {
  sent: number;
  delivered: number;
  bounces: number;
  permanentBounces: number;
  transientBounces: number;
  undeterminedBounces: number;
  complaints: number;
  rejects: number;
  opens: number;
  clicks: number;
  deliveryRate: number;
  bounceRate: number;
  permanentBounceRate: number;
  transientBounceRate: number;
  complaintRate: number;
  openRate: number;
  clickRate: number;
  quota: {
    max24HourSend: number;
    sentLast24Hours: number;
    maxSendRate: number;
  };
  dataPoints: Array<{
    timestamp: string;
    deliveryAttempts: number;
    bounces: number;
    complaints: number;
    rejects: number;
  }>;
}

export async function getSesStats(): Promise<SesStatsData> {
  const res = await apiClient.get('/settings/ses-stats');
  return res.data;
}

export async function classifyAndImportBounces(): Promise<{
  classified: { permanent: number; transient: number; undetermined: number };
  suppressed: number;
  message: string;
}> {
  const res = await apiClient.post('/settings/classify-bounces');
  return res.data;
}

// ─── Bounced Emails Not in Suppression ───────────────────────────────────────

export interface BouncedEmail {
  email: string;
  bounced_at: string | null;
  error_message: string | null;
  bounce_count: number;
}

export interface BouncedEmailsResponse {
  data: BouncedEmail[];
  total: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getBouncedEmails(params?: { page?: number; limit?: number }): Promise<BouncedEmailsResponse> {
  const res = await apiClient.get('/settings/ses-bounced-emails', { params });
  return res.data;
}
