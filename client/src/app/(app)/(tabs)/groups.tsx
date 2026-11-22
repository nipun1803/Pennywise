import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Empty, GroupCard, Header, Notice, Pager, ResourceError, Screen, Skeletons, styles } from '@/components/ui/app-ui';
import { useDashboard } from '@/hooks/use-dashboard';
import { formatAmount } from '@/lib/format';
import { useApp } from '@/providers/app-provider';

const PAGE_SIZE = 25;

export default function Groups() {
  const [page, setPage] = useState(1); const { offline } = useApp();
  // The dashboard returns every group plus its totals, so this tab paginates locally
  // instead of fetching /groups and /dashboard separately.
  const dashboard = useDashboard();
  const groups = dashboard.data ?? [];
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const visible = groups.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const pagination = groups.length > PAGE_SIZE ? { page: current, limit: PAGE_SIZE, total: groups.length, totalPages } : undefined;
  return <Screen tabs onRefresh={() => void dashboard.reload()} refreshing={dashboard.loading && !!dashboard.data}><Header title="Groups" subtitle="Trips, homes, and everyday plans." />
    <View style={[styles.row, { gap: 12 }]}><View style={{ flex: 1 }}><Button title="New group" disabled={offline} onPress={() => router.push('/create-group')} /></View><View style={{ flex: 1 }}><Button secondary title="Join group" disabled={offline} onPress={() => router.push('/join')} /></View></View>
    {dashboard.saved && <Notice text="Showing saved data. Refresh to check for updates." />}
    {!!dashboard.error && <ResourceError message={dashboard.error} retry={() => void dashboard.reload()} />}
    {dashboard.loading && !dashboard.data ? <Skeletons /> : visible.length ? <View style={{ gap: 12 }}>{visible.map(group => { const summary = dashboard.summaries[group.id]; return <GroupCard key={group.id} group={group} subtitle={summary ? summary.expenseCount ? `${formatAmount(summary.spendingCents)} spent` : 'No expenses yet' : undefined} onPress={() => router.push({ pathname: '/group/[id]', params: { id: group.id } })} />; })}</View> : dashboard.data && <Empty title="No groups yet" description="Create a group, or join one with a code from a friend." />}
    <Pager pagination={pagination} onPage={setPage} disabled={dashboard.loading} />
  </Screen>;
}
