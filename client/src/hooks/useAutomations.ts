import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  listAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  activateAutomation,
  pauseAutomation,
  enrollContacts,
  getEnrollments,
} from '../api/automations.api';

export function useAutomationsList(params: { page?: number; status?: string; search?: string }) {
  const queryParams: Record<string, string> = {};
  if (params.page) queryParams.page = String(params.page);
  if (params.status) queryParams.status = params.status;
  if (params.search) queryParams.search = params.search;

  return useQuery({
    queryKey: ['automations', queryParams],
    queryFn: () => listAutomations(queryParams),
  });
}

export function useAutomation(id: string | undefined) {
  return useQuery({
    queryKey: ['automation', id],
    queryFn: () => getAutomation(id!),
    enabled: !!id,
  });
}

export function useCreateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createAutomation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Automation created');
    },
    onError: () => {
      toast.error('Failed to create automation');
    },
  });
}

export function useUpdateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateAutomation>[1] }) =>
      updateAutomation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['automation'] });
      toast.success('Automation updated');
    },
    onError: () => {
      toast.error('Failed to update automation');
    },
  });
}

export function useDeleteAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Automation deleted');
    },
    onError: () => {
      toast.error('Failed to delete automation');
    },
  });
}

export function useActivateAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['automation'] });
      toast.success('Automation activated');
    },
    onError: () => {
      toast.error('Failed to activate automation');
    },
  });
}

export function usePauseAutomation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pauseAutomation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      queryClient.invalidateQueries({ queryKey: ['automation'] });
      toast.success('Automation paused');
    },
    onError: () => {
      toast.error('Failed to pause automation');
    },
  });
}

export function useEnrollContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { contactIds?: string[]; listId?: string } }) =>
      enrollContacts(id, data),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({ queryKey: ['automation'] });
      toast.success(`${_data.enrolled} contact(s) enrolled`);
    },
    onError: () => {
      toast.error('Failed to enroll contacts');
    },
  });
}

export function useEnrollments(id: string | undefined, params: { page?: number } = {}) {
  const queryParams: Record<string, string> = {};
  if (params.page) queryParams.page = String(params.page);

  return useQuery({
    queryKey: ['automation', id, 'enrollments', queryParams],
    queryFn: () => getEnrollments(id!, queryParams),
    enabled: !!id,
  });
}
