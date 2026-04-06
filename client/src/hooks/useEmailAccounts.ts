import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  listEmailAccounts,
  createEmailAccount,
  updateEmailAccount,
  deleteEmailAccount,
  testEmailAccount,
} from '../api/emailAccounts.api';

export function useEmailAccounts() {
  return useQuery({
    queryKey: ['email-accounts'],
    queryFn: () => listEmailAccounts().then((d) => d.accounts),
  });
}

export function useCreateEmailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createEmailAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-accounts'] });
      toast.success('Email account created');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to create account'),
  });
}

export function useUpdateEmailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateEmailAccount>[1] }) =>
      updateEmailAccount(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-accounts'] });
      toast.success('Email account updated');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update account'),
  });
}

export function useDeleteEmailAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteEmailAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-accounts'] });
      toast.success('Email account deleted');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to delete account'),
  });
}

export function useTestEmailAccount() {
  return useMutation({
    mutationFn: ({ id, to }: { id: string; to?: string }) => testEmailAccount(id, to),
    onSuccess: () => toast.success('Connection test passed!'),
    onError: (err: Error) => toast.error(err.message || 'Connection test failed'),
  });
}
