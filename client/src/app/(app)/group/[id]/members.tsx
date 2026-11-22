import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Card, Field, Header, Label, Notice, Pager, ResourceError, Screen, Skeletons, styles } from '@/components/ui/app-ui';
import { useResource } from '@/hooks/use-resource';
import { formatINR } from '@/lib/format';
import type { Balance, Group, Member } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
export default function Members() {
  const { id } = useLocalSearchParams<{ id: string }>(); const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const { colors } = useApp();
  const group = useResource<Group>(`/groups/${id}`); const balances = useResource<Balance[]>(`/groups/${id}/balances`); const members = useResource<Member[]>(`/groups/${id}/members?page=${page}&limit=25&search=${encodeURIComponent(search.trim())}`);
  return <Screen><Header back title="Your people" subtitle="Members and their balances within this group." /><Field label="Search members" placeholder="Search by name" value={search} onChangeText={value => { setSearch(value); setPage(1); }} maxLength={80} />{members.saved && <Notice text="Showing saved members. Offline searches only find previously saved results." />}{!!members.error && <ResourceError message={members.error} retry={() => void members.reload()} />}{!!balances.error && <ResourceError message={balances.error} retry={() => void balances.reload()} />}
    {members.loading && !members.data ? <Skeletons /> : members.data?.map(member => { const balance = balances.data?.find(item => item.userId === member.id)?.balanceCents; return <Card key={member.id}><View style={styles.row}><View style={{ flex: 1 }}><Label bold>{member.name}</Label>{group.data?.createdBy === member.id && <Label size={12} color={colors.primary}>Group creator</Label>}</View><View style={{ alignItems: 'flex-end' }}><Label bold>{balance === undefined ? 'Unavailable' : formatINR(Math.abs(balance))}</Label><Label muted size={12}>{balance === undefined ? 'Balance not loaded' : balance < 0 ? 'Owes' : balance > 0 ? 'Should receive' : 'Settled'}{balances.saved && balance !== undefined ? ' · saved' : ''}</Label></View></View></Card>; })}{members.data?.length === 0 && <Label muted>No matching members.</Label>}<Pager pagination={members.pagination} onPage={setPage} disabled={members.loading} />
  </Screen>;
}
