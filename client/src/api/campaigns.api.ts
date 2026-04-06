import apiClient from './client';
import { UploadState, createTrackedUpload } from '../lib/uploadHelper';

export interface CampaignAttachment {
  filename: string;
  storagePath: string;
  size: number;
  contentType: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  provider: string;
  template_id: string;
  template_name?: string;
  template_subject?: string;
  template_html_body?: string;
  list_id: string;
  list_name?: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  throttle_per_second: number;
  throttle_per_hour: number;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  bounce_count: number;
  open_count: number;
  click_count: number;
  complaint_count: number;
  pause_reason?: string | null;
  attachments?: CampaignAttachment[];
  is_starred?: boolean;
  is_archived?: boolean;
  label_name?: string;
  label_color?: string;
  dynamic_variables?: DynamicVariable[];
  subject_override?: string | null;
  reply_to?: string | null;
  email_account_id?: string | null;
  template_version?: number;
  template_snapshot_subject?: string;
  template_snapshot_html?: string;
  ab_test?: ABTest | null;
  bounceBreakdown?: {
    permanent: number;
    transient: number;
    undetermined: number;
    suppressed: number;
  };
  created_at: string;
}

export interface ABTestVariantStats {
  sent: number;
  opens: number;
  clicks: number;
}

export interface ABTest {
  enabled: boolean;
  variantB: {
    subject: string;
    templateId?: string | null;
  };
  splitPercentage: number;
  testDurationHours: number;
  winnerMetric: 'open_rate' | 'click_rate';
  status: 'pending' | 'testing' | 'winner_picked' | 'completed';
  winnerVariant?: 'A' | 'B' | null;
  variantAStats?: ABTestVariantStats;
  variantBStats?: ABTestVariantStats;
}

export async function listCampaigns(params: Record<string, string> = {}) {
  const res = await apiClient.get('/campaigns', { params });
  return res.data;
}

export async function getCampaign(id: string) {
  const res = await apiClient.get(`/campaigns/${id}`);
  return res.data.campaign as Campaign;
}

export async function createCampaign(data: {
  name: string; templateId: string; listId: string; provider?: string;
  throttlePerSecond?: number; throttlePerHour?: number;
  projectId?: string;
  replyTo?: string;
  emailAccountId?: string;
  attachments?: File[];
  onProgress?: (state: UploadState) => void;
  signal?: AbortSignal;
}) {
  const formData = new FormData();
  formData.append('name', data.name);
  formData.append('templateId', data.templateId);
  formData.append('listId', data.listId);
  if (data.provider) formData.append('provider', data.provider);
  if (data.throttlePerSecond) formData.append('throttlePerSecond', String(data.throttlePerSecond));
  if (data.throttlePerHour) formData.append('throttlePerHour', String(data.throttlePerHour));
  if (data.projectId) formData.append('projectId', data.projectId);
  if (data.replyTo) formData.append('replyTo', data.replyTo);
  if (data.emailAccountId) formData.append('emailAccountId', data.emailAccountId);
  if (data.attachments) {
    data.attachments.forEach((file) => formData.append('attachments', file));
  }

  // If there are attachments and a progress callback, use tracked upload
  if (data.attachments && data.attachments.length > 0 && data.onProgress) {
    const { promise } = createTrackedUpload<{ campaign: Campaign }>({
      url: '/campaigns',
      formData,
      onProgress: data.onProgress,
      signal: data.signal,
    });
    const result = await promise;
    return result.campaign;
  }

  const res = await apiClient.post('/campaigns', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    signal: data.signal,
  });
  return res.data.campaign as Campaign;
}

export async function updateCampaign(id: string, data: Record<string, unknown>) {
  const res = await apiClient.put(`/campaigns/${id}`, data);
  return res.data.campaign as Campaign;
}

export async function deleteCampaign(id: string, adminPassword: string) {
  return apiClient.delete(`/campaigns/${id}`, { data: { adminPassword } });
}

export async function bulkDeleteCampaigns(ids: string[], adminPassword: string) {
  return apiClient.delete('/campaigns/bulk', { data: { ids, adminPassword } });
}

export async function scheduleCampaign(id: string, scheduledAt: string) {
  const res = await apiClient.post(`/campaigns/${id}/schedule`, { scheduledAt });
  return res.data;
}

export async function sendCampaign(id: string) {
  const res = await apiClient.post(`/campaigns/${id}/send`);
  return res.data;
}

export async function pauseCampaign(id: string) {
  const res = await apiClient.post(`/campaigns/${id}/pause`);
  return res.data;
}

export async function resumeCampaign(id: string) {
  const res = await apiClient.post(`/campaigns/${id}/resume`);
  return res.data;
}

export async function getCampaignRecipients(id: string, params: Record<string, string> = {}) {
  const res = await apiClient.get(`/campaigns/${id}/recipients`, { params });
  return res.data;
}

export function addAttachmentsTracked(
  id: string,
  files: File[],
  onProgress?: (state: UploadState) => void,
  signal?: AbortSignal,
): { promise: Promise<CampaignAttachment[]>; abort: () => void } {
  const formData = new FormData();
  files.forEach((file) => formData.append('attachments', file));

  const tracked = createTrackedUpload<{ attachments: CampaignAttachment[] }>({
    url: `/campaigns/${id}/attachments`,
    formData,
    onProgress,
    signal,
  });

  return {
    promise: tracked.promise.then((res) => res.attachments),
    abort: tracked.abort,
  };
}

export async function addAttachments(id: string, files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append('attachments', file));
  const res = await apiClient.post(`/campaigns/${id}/attachments`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.attachments as CampaignAttachment[];
}

export async function removeAttachment(id: string, index: number) {
  const res = await apiClient.delete(`/campaigns/${id}/attachments/${index}`);
  return res.data;
}

export async function duplicateCampaign(id: string) {
  const res = await apiClient.post(`/campaigns/${id}/duplicate`);
  return res.data.campaign;
}

export async function toggleStar(id: string) {
  const res = await apiClient.put(`/campaigns/${id}/star`);
  return res.data.campaign;
}

export async function toggleArchive(id: string) {
  const res = await apiClient.put(`/campaigns/${id}/archive`);
  return res.data.campaign;
}

export async function updateCampaignLabel(id: string, label: { name?: string; color?: string }) {
  const res = await apiClient.put(`/campaigns/${id}/label`, label);
  return res.data.campaign;
}

export interface CampaignLabel {
  id: string;
  name: string;
  color: string;
}

export async function listCampaignLabels() {
  const res = await apiClient.get('/campaign-labels');
  return res.data.labels as CampaignLabel[];
}

export async function createCampaignLabel(data: { name: string; color: string }) {
  const res = await apiClient.post('/campaign-labels', data);
  return res.data.label as CampaignLabel;
}

export async function deleteCampaignLabel(id: string) {
  return apiClient.delete(`/campaign-labels/${id}`);
}

// ── Dynamic Variables ──

export interface DynamicVariable {
  key: string;
  type: 'counter' | 'date' | 'pattern' | 'random' | 'text';
  startValue?: number;
  increment?: number;
  padding?: number;
  prefix?: string;
  suffix?: string;
  format?: string;
  values?: string[];
  value?: string;
}

export async function updateDynamicVariables(campaignId: string, dynamicVariables: DynamicVariable[]) {
  const res = await apiClient.put(`/campaigns/${campaignId}/dynamic-variables`, { dynamicVariables });
  return res.data;
}

export async function previewDynamicVariables(campaignId: string) {
  const res = await apiClient.post(`/campaigns/${campaignId}/dynamic-variables/preview`);
  return res.data.previews as Array<{ position: number; variables: Record<string, string> }>;
}

export async function resendToNonOpeners(id: string, data?: { subject?: string }): Promise<Campaign> {
  const res = await apiClient.post(`/campaigns/${id}/resend-non-openers`, data || {});
  return res.data.campaign as Campaign;
}

export async function resendTransientBounced(id: string): Promise<Campaign> {
  const res = await apiClient.post(`/campaigns/${id}/resend-transient-bounced`);
  return res.data.campaign as Campaign;
}

export async function suppressPermanentBounces(id: string): Promise<{ added: number; total: number }> {
  const res = await apiClient.post(`/campaigns/${id}/suppress-permanent-bounces`);
  return res.data;
}

export async function createCampaignFromEmails(data: {
  name: string;
  emails: string[];
  templateId?: string;
  provider?: string;
}): Promise<Campaign> {
  const res = await apiClient.post('/campaigns/from-emails', data);
  return res.data.campaign as Campaign;
}

export async function exportCampaignRecipients(id: string, params?: Record<string, string>) {
  const res = await apiClient.get(`/campaigns/${id}/recipients/export`, { params, responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recipients-export-${id}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function estimateSendCount(listId: string): Promise<{ total: number; suppressed: number; invalid: number; willSend: number }> {
  const res = await apiClient.get('/campaigns/estimate-send-count', { params: { listId } });
  return res.data;
}
