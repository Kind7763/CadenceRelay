import { useQuery } from '@tanstack/react-query';
import { getDashboardData } from '../api/analytics.api';

export function useDashboard(filters: Record<string, string> = {}) {
  return useQuery({
    queryKey: ['dashboard', filters],
    queryFn: () => getDashboardData(filters),
  });
}
