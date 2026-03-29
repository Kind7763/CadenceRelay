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
  attachments?: CampaignAttachment[];
  is_starred?: boolean;
  is_archived?: boolean;
  label_name?: string;
  label_color?: string;
  created_at: string;
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
