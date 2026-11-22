import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Empty, GroupCard, Header, Pager, ResourceError, Screen, Skeletons } from '@/components/ui/app-ui';
import { useResource } from '@/hooks/use-resource';
import type { Group } from '@/lib/types';
export default function ChooseGroup() {
  const [page, setPage] = useState(1); const resource = useResource<Group[]>(`/groups?page=${page}&limit=25`);
  useEffect(() => { if (!resource.loading && !resource.error && resource.pagination?.total === 1 && resource.data?.[0]) router.replace({ pathname: '/group/[id]/expense', params: { id: resource.data[0].id } }); }, [resource.loading, resource.error, resource.pagination?.total, resource.data]);
  return <Screen><Header back title="Which group?" subtitle="Choose where this expense belongs." />{!!resource.error && <ResourceError message={resource.error} retry={() => void resource.reload()} />}{resource.loading && !resource.data ? <Skeletons /> : resource.data?.map(group => <GroupCard key={group.id} group={group} onPress={() => router.replace({ pathname: '/group/[id]/expense', params: { id: group.id } })} />)}{resource.pagination?.total === 0 && <Empty title="Create or join a group first" description="Expenses belong to a shared group." />}<Pager pagination={resource.pagination} onPage={setPage} disabled={resource.loading} /></Screen>;
}
