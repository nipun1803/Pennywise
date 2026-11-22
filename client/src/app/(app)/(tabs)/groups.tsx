import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Empty, GroupCard, Header, Notice, Pager, ResourceError, Screen, Skeletons, styles } from '@/components/ui/app-ui';
import { useGroupSummaries } from '@/hooks/use-group-summaries';
import { useResource } from '@/hooks/use-resource';
import { formatAmount } from '@/lib/format';
import type { Group } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
export default function Groups() {
  const [page, setPage] = useState(1); const { offline } = useApp();
  const resource = useResource<Group[]>(`/groups?page=${page}&limit=25`);
  const { summaries, reload } = useGroupSummaries(resource.data);
  return <Screen tabs onRefresh={() => { void resource.reload(); reload(); }} refreshing={resource.loading && !!resource.data}><Header title="Groups" subtitle="Trips, homes, and everyday plans." />
    <View style={[styles.row, { gap: 12 }]}><View style={{ flex: 1 }}><Button title="New group" disabled={offline} onPress={() => router.push('/create-group')} /></View><View style={{ flex: 1 }}><Button secondary title="Join group" disabled={offline} onPress={() => router.push('/join')} /></View></View>
    {resource.saved && <Notice text="Showing saved data for this page. Other pages may not be saved." />}
    {!!resource.error && <ResourceError message={resource.error} retry={() => void resource.reload()} />}
    {resource.loading && !resource.data ? <Skeletons /> : resource.data?.length ? <View style={{ gap: 12 }}>{resource.data.map(group => { const summary = summaries[group.id]; return <GroupCard key={group.id} group={group} subtitle={summary ? summary.expenseCount ? `${formatAmount(summary.spendingCents)} spent` : 'No expenses yet' : undefined} onPress={() => router.push({ pathname: '/group/[id]', params: { id: group.id } })} />; })}</View> : resource.data && <Empty title={page === 1 ? 'No groups yet' : 'No groups on this page'} description={page === 1 ? 'Create a group, or join one with a code from a friend.' : 'Refresh or return to the previous page.'} />}
    <Pager pagination={resource.pagination} onPage={setPage} disabled={resource.loading} />
  </Screen>;
}
