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

export async function sendTestEmail(to: string, options?: { subject?: string; html?: string; campaignId?: string }) {
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
