import { useResource } from '@/hooks/use-resource';
import type { Group } from '@/lib/types';
export interface GroupSummary { expenseCount: number; spendingCents: number; balanceCents: number | null }
export interface Dashboard { groups: Group[]; summaries: Record<string, GroupSummary>; totals: { spendingCents: number; balanceCents: number; expenseCount: number } }
export function useDashboard() {
  const resource = useResource<Dashboard>('/dashboard');
  return { ...resource, data: resource.data?.groups, summaries: resource.data?.summaries ?? {}, totals: resource.data?.totals };
}
export function useGroupSummaries(_groups: Group[] | undefined) {
  const resource = useDashboard();
  return { summaries: resource.summaries, loading: resource.loading, error: resource.error, reload: resource.reload };
}
