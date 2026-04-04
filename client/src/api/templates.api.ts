import apiClient from './client';

export interface Template {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  text_body: string | null;
  variables: string[];
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listTemplates(params: Record<string, string> = {}) {
  const res = await apiClient.get('/templates', { params });
  return res.data.templates as Template[];
}

export async function getTemplate(id: string) {
  const res = await apiClient.get(`/templates/${id}`);
  return res.data.template as Template;
}

export async function createTemplate(data: { name: string; subject: string; htmlBody: string; textBody?: string; projectId?: string }) {
  const res = await apiClient.post('/templates', data);
  return res.data.template as Template;
}

export async function updateTemplate(id: string, data: { name?: string; subject?: string; htmlBody?: string; textBody?: string }) {
  const res = await apiClient.put(`/templates/${id}`, data);
  return res.data.template as Template;
}

export async function deleteTemplate(id: string) {
  return apiClient.delete(`/templates/${id}`);
}

export async function toggleArchiveTemplate(id: string) {
  const res = await apiClient.put(`/templates/${id}/archive`);
  return res.data;
}

export async function getTemplateVersions(id: string) {
  const res = await apiClient.get(`/templates/${id}/versions`);
  return res.data.versions;
}

export async function getTemplateVersion(id: string, version: number) {
  const res = await apiClient.get(`/templates/${id}/versions/${version}`);
  return res.data.version;
}

export async function restoreTemplateVersion(id: string, version: number) {
  const res = await apiClient.post(`/templates/${id}/versions/${version}/restore`);
  return res.data;
}

export async function updateVersionLabel(id: string, version: number, label: string) {
  const res = await apiClient.put(`/templates/${id}/versions/${version}/label`, { label });
  return res.data;
}

export async function previewTemplate(id: string, data?: Record<string, string>) {
  const res = await apiClient.post(`/templates/${id}/preview`, { data });
  return res.data.html as string;
}

// ── Spam Score Checker ──

export interface SpamIssue {
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  points: number;
}

export interface SpamCheckResult {
  score: number;
  grade: string;
  issues: SpamIssue[];
}

export async function checkSpamScore(data: { subject: string; html: string; hasPlainText?: boolean }): Promise<SpamCheckResult> {
  const res = await apiClient.post('/templates/spam-check', data);
  return res.data;
}

export async function checkTemplateSpamScore(id: string): Promise<SpamCheckResult> {
  const res = await apiClient.post(`/templates/${id}/spam-check`);
  return res.data;
}
