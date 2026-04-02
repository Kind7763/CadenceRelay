import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getSettings,
  updateProvider,
  updateGmailConfig,
  updateSesConfig,
  updateThrottleDefaults,
  updateReplyTo,
  updateDailyLimits,
  sendTestEmail,
  getDomainHealth,
  DomainHealthData,
  getSesQuota,
  SesQuotaData,
  getSnsStatus,
  SnsStatusData,
  setupSns,
  SnsSetupResult,
  getSesStats,
  SesStatsData,
  getBouncedEmails,
  BouncedEmailsResponse,
} from '../api/settings.api';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });
}

export function useUpdateProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: 'gmail' | 'ses') => updateProvider(provider),
    onSuccess: (_data, provider) => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success(`Switched to ${provider.toUpperCase()}`);
    },
    onError: () => {
      toast.error('Failed to switch provider');
    },
  });
}

export function useUpdateGmailConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: { user: string; pass: string; host?: string; port?: number }) =>
      updateGmailConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Gmail config saved');
    },
    onError: () => {
      toast.error('Failed to save Gmail config');
    },
  });
}

export function useUpdateSesConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: { region: string; accessKeyId: string; secretAccessKey: string; fromEmail: string; fromName?: string }) =>
      updateSesConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('SES config saved');
    },
    onError: () => {
      toast.error('Failed to save SES config');
    },
  });
}

export function useUpdateThrottleDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: { perSecond: number; perHour: number }) =>
      updateThrottleDefaults(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Throttle defaults saved');
    },
    onError: () => {
      toast.error('Failed to save throttle config');
    },
  });
}

export function useUpdateReplyTo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (replyTo: string) => updateReplyTo(replyTo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Reply-To address saved');
    },
    onError: () => {
      toast.error('Failed to save Reply-To address');
    },
  });
}

export function useUpdateDailyLimits() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: { gmailDailyLimit: number; sesDailyLimit: number }) =>
      updateDailyLimits(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Daily send limits saved');
    },
    onError: () => {
      toast.error('Failed to save daily send limits');
    },
  });
}

export function useDomainHealth(enabled = false) {
  return useQuery<DomainHealthData>({
    queryKey: ['domain-health'],
    queryFn: getDomainHealth,
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: (to: string) => sendTestEmail(to),
    onSuccess: (_data, to) => {
      toast.success(`Test email sent to ${to}`);
    },
    onError: () => {
      toast.error('Failed to send test email');
    },
  });
}

// ─── SES Quota ────────────────────────────────────────────────────────────────

export function useSesQuota(enabled = false) {
  return useQuery<SesQuotaData>({
    queryKey: ['ses-quota'],
    queryFn: getSesQuota,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ─── SNS Status & Setup ──────────────────────────────────────────────────────

export function useSnsStatus(enabled = false) {
  return useQuery<SnsStatusData>({
    queryKey: ['sns-status'],
    queryFn: getSnsStatus,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useSetupSns() {
  const queryClient = useQueryClient();
  return useMutation<SnsSetupResult>({
    mutationFn: setupSns,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sns-status'] });
      toast.success('SNS bounce & complaint notifications configured successfully');
    },
    onError: (err) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to set up SNS notifications';
      toast.error(message);
    },
  });
}

// ─── SES Account Statistics ──────────────────────────────────────────────────

export function useSesStats(enabled = false) {
  return useQuery<SesStatsData>({
    queryKey: ['ses-stats'],
    queryFn: getSesStats,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// ─── Bounced Emails Not in Suppression ───────────────────────────────────────

export function useBouncedEmails(params: { page?: number; limit?: number } = {}, enabled = true) {
  return useQuery<BouncedEmailsResponse>({
    queryKey: ['bounced-emails', params],
    queryFn: () => getBouncedEmails(params),
    enabled,
    staleTime: 30 * 1000,
  });
}
