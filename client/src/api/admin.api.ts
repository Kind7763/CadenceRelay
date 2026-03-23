import apiClient from './client';

export async function clearHistory(type: 'campaigns' | 'contacts' | 'all', adminPassword: string) {
  const res = await apiClient.post('/admin/clear-history', { type, adminPassword });
  return res.data;
}
