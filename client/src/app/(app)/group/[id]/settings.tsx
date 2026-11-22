import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Button, Header, Label, Notice, ResourceError, Screen, Skeletons } from '@/components/ui/app-ui';
import { useMutation } from '@/hooks/use-mutation';
import { useResource } from '@/hooks/use-resource';
import { errorMessage } from '@/lib/api';
import type { Group } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
import { GroupDetailsForm, IllustrationPanel, type GroupDraft } from '@/screens/group-details-form';
import { illustrations } from '@/theme/illustrations';

export default function EditGroup() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { session, offline, notify, colors } = useApp(); const group = useResource<Group>(`/groups/${id}`); const { busy, mutate } = useMutation();
  const [edited, setDraft] = useState<GroupDraft | null>(null); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const draft: GroupDraft = edited ?? { name: group.data?.name ?? '', description: group.data?.description ?? '', image: group.data?.image ?? null };
  const creator = group.data?.createdBy === session?.user.id;
  const save = async (rotate = false) => {
    if (!rotate && !draft.name.trim()) { setError('Enter a group name.'); return; }
    setError('');
    try { await mutate(rotate ? `/groups/${id}/join-code` : `/groups/${id}`, rotate ? 'POST' : 'PATCH', rotate ? undefined : { name: draft.name.trim(), description: draft.description.trim(), image: draft.image ?? null }); setConfirm(false); if (!rotate) setDraft(null); notify(rotate ? 'Invite code changed. The old code no longer works.' : 'Changes saved.'); }
    catch (error) { setError(errorMessage(error)); }
  };
  return <Screen><Header back title="Edit group" />
    <View style={{ marginTop: -8 }}><IllustrationPanel source={illustrations.squad.source} ratio={illustrations.squad.ratio} top="22.8%" bottom="1.1%" label="Five friends laughing together" /></View>
    <View style={{ gap: 12 }}><Label size={34} bold>Your group, your way.</Label><Label muted size={16}>Fine-tune the details for your people.</Label></View>
    {!!group.error && <ResourceError message={group.error} retry={() => void group.reload()} />}
    {group.loading && !group.data ? <Skeletons count={2} /> : group.data && <>
      {!creator && <Notice text="Only the group creator can change these details." />}
      <GroupDetailsForm key={group.data.id} value={draft} onChange={setDraft} color={group.data.color} disabled={!creator || busy || offline} onBusy={setUploading} />
      {!!error && <Notice text={error} error />}
      {creator && <View style={{ marginTop: 18, gap: 18 }}>
        <Button title="Save changes" disabled={offline || !edited || uploading} busy={busy && !confirm} onPress={() => void save()} />
        {confirm ? <View style={{ gap: 12 }}><Notice text="The current invite code and QR will stop working. Existing members stay in the group." error /><Button title="Change invite code" danger disabled={offline} busy={busy} onPress={() => void save(true)} /><Button title="Keep current code" secondary disabled={busy} onPress={() => setConfirm(false)} /></View>
          : <Pressable accessibilityRole="button" disabled={offline || busy} onPress={() => setConfirm(true)} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}><Label size={16} weight={600} color={colors.danger}>Change invite code</Label></Pressable>}
      </View>}
    </>}
  </Screen>;
}
