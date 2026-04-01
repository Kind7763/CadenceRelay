import apiClient from './client';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  is_archived: boolean;
  campaign_count: number;
  template_count: number;
  list_count: number;
  total_sent: number;
  total_opens: number;
  created_at: string;
  updated_at: string;
}

export async function listProjects(params: Record<string, string> = {}) {
  const res = await apiClient.get('/projects', { params });
  return res.data.projects as Project[];
}

export async function createProject(data: { name: string; description?: string; color?: string; icon?: string }) {
  const res = await apiClient.post('/projects', data);
  return res.data.project as Project;
}

export async function getProject(id: string) {
  const res = await apiClient.get(`/projects/${id}`);
  return res.data.project as Project;
}

export async function updateProject(id: string, data: { name?: string; description?: string; color?: string; icon?: string }) {
  const res = await apiClient.put(`/projects/${id}`, data);
  return res.data.project as Project;
}

export async function deleteProject(id: string) {
  return apiClient.delete(`/projects/${id}`);
}

export async function toggleArchiveProject(id: string) {
  const res = await apiClient.put(`/projects/${id}/archive`);
  return res.data.project as Project;
}

export async function moveItemsToProject(id: string, items: { campaignIds?: string[]; templateIds?: string[]; listIds?: string[] }) {
  const res = await apiClient.post(`/projects/${id}/move`, items);
  return res.data;
}

export async function unlinkItemsFromProject(id: string, items: { campaignIds?: string[]; templateIds?: string[]; listIds?: string[] }) {
  const res = await apiClient.post(`/projects/${id}/unlink`, items);
  return res.data;
}
