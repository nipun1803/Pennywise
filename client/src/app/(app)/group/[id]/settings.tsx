import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
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
  // Show successful patches immediately, even while the resource refresh is pending.
  const [saved, setSaved] = useState<{ base: Group; data: Group } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false); const saveLock = useRef(false);
  const current = saved && saved.base === group.data ? saved.data : group.data;
  const draft: GroupDraft = { name: edited?.name ?? current?.name ?? '', description: edited?.description ?? current?.description ?? '', image: current?.image ?? null };
  const creator = group.data?.createdBy === session?.user.id;
  const savePhoto = async (image: string | null) => {
    if (!creator) throw new Error('Only the group creator can change the group photo.');
    const result = await mutate<Group>(`/groups/${id}`, 'PATCH', { image });
    setSaved({ base: group.data!, data: result.data });
    notify(image ? 'Group photo updated.' : 'Group photo removed.');
  };
  const save = async (rotate = false) => {
    if (!creator || saveLock.current || offline || uploading) return;
    if (!rotate && !draft.name.trim()) { setError('Enter a group name.'); return; }
    saveLock.current = true; setSaving(true); setError('');
    try {
      if (rotate) await mutate(`/groups/${id}/join-code`, 'POST');
      else {
        const result = await mutate<Group>(`/groups/${id}`, 'PATCH', { name: draft.name.trim(), description: draft.description.trim() });
        setSaved({ base: group.data!, data: result.data }); setDraft(null);
      }
      setConfirm(false); notify(rotate ? 'Invite code changed. The old code no longer works.' : 'Changes saved.');
    }
    catch (error) { setError(errorMessage(error)); }
    finally { saveLock.current = false; setSaving(false); }
  };
  return <Screen><Header back title="Edit group" />
    <View style={{ marginTop: -8 }}><IllustrationPanel source={illustrations.squad.source} ratio={illustrations.squad.ratio} top="22.8%" bottom="1.1%" label="Five friends laughing together" /></View>
    <View style={{ gap: 12 }}><Label size={34} bold>Your group, your way.</Label><Label muted size={16}>Fine-tune the details for your people.</Label></View>
    {!!group.error && <ResourceError message={group.error} retry={() => void group.reload()} />}
    {group.loading && !group.data ? <Skeletons count={2} /> : group.data && <>
      {!creator && <Notice text="Only the group creator can change the group photo, preset avatar, name, description, or invite code." />}
      <GroupDetailsForm key={group.data.id} value={draft} onChange={setDraft} color={group.data.color} disabled={!creator || busy || saving || uploading || offline} photoReadOnly={!creator} photoDisabled={!creator || busy || saving || offline} onBusy={setUploading} onPhotoSave={savePhoto} formAction={creator && <Button title={saving && !confirm ? 'Saving changes…' : 'Save changes'} disabled={offline || uploading || busy || draft.name === current?.name && draft.description === (current?.description ?? '')} busy={saving && !confirm} onPress={() => void save()} />} />
      {!!error && <Notice text={error} error />}
      {creator && <View style={{ marginTop: 18, gap: 18 }}>
        {confirm ? <View style={{ gap: 12 }}><Notice text="The current invite code and QR will stop working. Existing members stay in the group." error /><Button title="Change invite code" danger disabled={offline || uploading} busy={busy || saving} onPress={() => void save(true)} /><Button title="Keep current code" secondary disabled={busy || saving} onPress={() => setConfirm(false)} /></View>
          : <Pressable accessibilityRole="button" disabled={offline || busy || saving || uploading} onPress={() => setConfirm(true)} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}><Label size={16} weight={600} color={colors.danger}>Change invite code</Label></Pressable>}
      </View>}
    </>}
  </Screen>;
}
