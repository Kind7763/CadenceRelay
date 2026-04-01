import apiClient from './client';

export interface AutomationStep {
  id?: string;
  step_order: number;
  template_id: string;
  template_name?: string;
  subject_override?: string;
  delay_days: number;
  delay_hours: number;
  delay_minutes: number;
}

export interface Automation {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused' | 'archived';
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  provider: string;
  project_id?: string;
  total_enrolled: number;
  total_completed: number;
  step_count?: number;
  steps?: AutomationStep[];
  created_at: string;
  updated_at: string;
}

export interface AutomationEnrollment {
  id: string;
  contact_id: string;
  contact_email?: string;
  contact_name?: string;
  current_step: number;
  status: string;
  enrolled_at: string;
  next_step_at: string | null;
  completed_at: string | null;
  last_step_sent_at: string | null;
}

// CRUD functions
export async function listAutomations(params?: Record<string, string>): Promise<{ data: Automation[]; pagination: { total: number; page: number } }> {
  const res = await apiClient.get('/automations', { params });
  return res.data;
}

export async function getAutomation(id: string): Promise<Automation> {
  const res = await apiClient.get(`/automations/${id}`);
  return res.data.automation;
}

export async function createAutomation(data: {
  name: string; description?: string; triggerType: string; triggerConfig?: Record<string, unknown>;
  provider?: string; projectId?: string;
  steps: Array<{ templateId: string; subjectOverride?: string; delayDays?: number; delayHours?: number; delayMinutes?: number }>;
}): Promise<Automation> {
  const res = await apiClient.post('/automations', data);
  return res.data.automation;
}

export async function updateAutomation(id: string, data: Partial<{
  name: string; description: string; triggerType: string; triggerConfig: Record<string, unknown>;
  provider: string;
  steps: Array<{ templateId: string; subjectOverride?: string; delayDays?: number; delayHours?: number; delayMinutes?: number }>;
}>): Promise<Automation> {
  const res = await apiClient.put(`/automations/${id}`, data);
  return res.data.automation;
}

export async function deleteAutomation(id: string): Promise<void> {
  await apiClient.delete(`/automations/${id}`);
}

export async function activateAutomation(id: string): Promise<void> {
  await apiClient.post(`/automations/${id}/activate`);
}

export async function pauseAutomation(id: string): Promise<void> {
  await apiClient.post(`/automations/${id}/pause`);
}

export async function enrollContacts(id: string, data: { contactIds?: string[]; listId?: string }): Promise<{ enrolled: number }> {
  const res = await apiClient.post(`/automations/${id}/enroll`, data);
  return res.data;
}

export async function getEnrollments(id: string, params?: Record<string, string>): Promise<{ data: AutomationEnrollment[]; pagination: { total: number } }> {
  const res = await apiClient.get(`/automations/${id}/enrollments`, { params });
  return res.data;
}
