import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Sheet, SheetRow } from '@/components/sheet';
import { Label } from '@/components/ui/app-ui';
import { useResource } from '@/hooks/use-resource';
import type { Group } from '@/lib/types';

type Target = '/group/[id]/settings' | '/group/[id]/invite' | '/group/[id]/records' | '/group/[id]/categories';
export default function GroupOptions() {
  const { id } = useLocalSearchParams<{ id: string }>(); const group = useResource<Group>(`/groups/${id}`);
  // Replace the sheet so Back from the next screen returns to the group, not the sheet.
  const go = (pathname: Target) => router.replace({ pathname, params: { id } });
  const members = group.data ? `${group.data.memberCount} ${group.data.memberCount === 1 ? 'member' : 'members'} · INR` : '';
  return <Sheet title={group.data?.name ?? 'Group'} subtitle={<View style={{ marginTop: 18, marginBottom: 14 }}><Label muted size={16}>{members}</Label></View>}>
    <SheetRow title="Edit group" icon="edit-2" onPress={() => go('/group/[id]/settings')} />
    <SheetRow title="Invite people" icon="user-plus" onPress={() => go('/group/[id]/invite')} />
    <SheetRow title="Activity & statements" icon="clock" onPress={() => go('/group/[id]/records')} />
    <SheetRow title="Categories" icon="tag" onPress={() => go('/group/[id]/categories')} last />
  </Sheet>;
}
