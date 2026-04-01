import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  listSuppressed,
  addToSuppression,
  bulkAddToSuppression,
  removeFromSuppression,
  getSuppressionCount,
} from '../api/suppression.api';

export function useSuppressionList(params: Record<string, string> = {}) {
  return useQuery({
    queryKey: ['suppression', params],
    queryFn: () => listSuppressed(params),
  });
}

export function useSuppressionCount() {
  return useQuery({
    queryKey: ['suppression-count'],
    queryFn: getSuppressionCount,
  });
}

export function useAddToSuppression() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, reason }: { email: string; reason?: string }) =>
      addToSuppression(email, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppression'] });
      queryClient.invalidateQueries({ queryKey: ['suppression-count'] });
      toast.success('Email added to suppression list');
    },
    onError: () => {
      toast.error('Failed to add email to suppression list');
    },
  });
}

export function useBulkAddToSuppression() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ emails, reason }: { emails: string[]; reason?: string }) =>
      bulkAddToSuppression(emails, reason),
    onSuccess: (_data) => {
      queryClient.invalidateQueries({ queryKey: ['suppression'] });
      queryClient.invalidateQueries({ queryKey: ['suppression-count'] });
      toast.success(`${_data.added} emails added to suppression list`);
    },
    onError: () => {
      toast.error('Failed to add emails to suppression list');
    },
  });
}

export function useRemoveFromSuppression() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeFromSuppression(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppression'] });
      queryClient.invalidateQueries({ queryKey: ['suppression-count'] });
      toast.success('Email removed from suppression list');
    },
    onError: () => {
      toast.error('Failed to remove email from suppression list');
    },
  });
}
