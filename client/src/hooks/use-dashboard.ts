import { useResource } from '@/hooks/use-resource';
import type { Group } from '@/lib/types';

export interface GroupSummary { expenseCount: number; spendingCents: number; balanceCents: number | null }
export interface Dashboard {
  groups: Group[];
  summaries: Record<string, GroupSummary>;
  totals: { spendingCents: number; balanceCents: number; expenseCount: number };
}

// One authenticated request covers every group, its summary, and the overall totals.
export function useDashboard() {
  const resource = useResource<Dashboard>('/dashboard');
  return { ...resource, data: resource.data?.groups, summaries: resource.data?.summaries ?? {}, totals: resource.data?.totals };
}
