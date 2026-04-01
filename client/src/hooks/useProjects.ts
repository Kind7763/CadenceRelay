import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  toggleArchiveProject,
  moveItemsToProject,
  unlinkItemsFromProject,
} from '../api/projects.api';

export function useProjectsList(params: { archived?: string } = {}) {
  const queryParams: Record<string, string> = {};
  if (params.archived) queryParams.archived = params.archived;

  return useQuery({
    queryKey: ['projects', queryParams],
    queryFn: () => listProjects(queryParams),
  });
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => getProject(id!),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created');
    },
    onError: () => {
      toast.error('Failed to create project');
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string; color?: string; icon?: string } }) =>
      updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project updated');
    },
    onError: () => {
      toast.error('Failed to update project');
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
    },
    onError: () => {
      toast.error('Failed to delete project');
    },
  });
}

export function useToggleArchiveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => toggleArchiveProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project updated');
    },
    onError: () => {
      toast.error('Failed to update project');
    },
  });
}

export function useMoveItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, items }: { projectId: string; items: { campaignIds?: string[]; templateIds?: string[]; listIds?: string[] } }) =>
      moveItemsToProject(projectId, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      toast.success('Items moved to project');
    },
    onError: () => {
      toast.error('Failed to move items');
    },
  });
}

export function useUnlinkItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, items }: { projectId: string; items: { campaignIds?: string[]; templateIds?: string[]; listIds?: string[] } }) =>
      unlinkItemsFromProject(projectId, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      toast.success('Items unlinked from project');
    },
    onError: () => {
      toast.error('Failed to unlink items');
    },
  });
}
