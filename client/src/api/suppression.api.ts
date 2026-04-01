import apiClient from './client';

export interface SuppressionEntry {
  id: string;
  email: string;
  reason: string;
  added_by: string;
  created_at: string;
}

export async function listSuppressed(params: Record<string, string> = {}) {
  const res = await apiClient.get('/suppression', { params });
  return res.data;
}

export async function addToSuppression(email: string, reason?: string) {
  const res = await apiClient.post('/suppression', { email, reason });
  return res.data;
}

export async function bulkAddToSuppression(emails: string[], reason?: string) {
  const res = await apiClient.post('/suppression/bulk', { emails, reason });
  return res.data;
}

export async function removeFromSuppression(id: string) {
  const res = await apiClient.delete(`/suppression/${id}`);
  return res.data;
}

export async function getSuppressionCount() {
  const res = await apiClient.get('/suppression/count');
  return res.data;
}
