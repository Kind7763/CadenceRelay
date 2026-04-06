import apiClient from './client';

export interface EmailAccount {
  id: string;
  label: string;
  provider_type: 'gmail' | 'ses';
  config: Record<string, unknown>;
  daily_limit: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function listEmailAccounts(): Promise<{ accounts: EmailAccount[] }> {
  const res = await apiClient.get('/email-accounts');
  return res.data;
}

export async function getEmailAccount(id: string): Promise<{ account: EmailAccount }> {
  const res = await apiClient.get(`/email-accounts/${id}`);
  return res.data;
}

export async function createEmailAccount(data: {
  label: string;
  providerType: 'gmail' | 'ses';
  config: Record<string, unknown>;
  dailyLimit?: number;
}): Promise<{ account: EmailAccount }> {
  const res = await apiClient.post('/email-accounts', data);
  return res.data;
}

export async function updateEmailAccount(id: string, data: {
  label?: string;
  config?: Record<string, unknown>;
  dailyLimit?: number;
  isActive?: boolean;
}): Promise<{ account: EmailAccount }> {
  const res = await apiClient.put(`/email-accounts/${id}`, data);
  return res.data;
}

export async function deleteEmailAccount(id: string): Promise<{ message: string }> {
  const res = await apiClient.delete(`/email-accounts/${id}`);
  return res.data;
}

export async function testEmailAccount(id: string, to?: string): Promise<{ message: string; connected: boolean }> {
  const res = await apiClient.post(`/email-accounts/${id}/test`, { to });
  return res.data;
}
