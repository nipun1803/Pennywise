import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Header, Label, Notice, Screen } from '@/components/ui/app-ui';
import { errorMessage, request } from '@/lib/api';
import type { Group } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
import { GroupDetailsForm, IllustrationPanel, type GroupDraft } from '@/screens/group-details-form';
import { illustrations } from '@/theme/illustrations';

export default function CreateGroup() {
  const { offline, invalidate, notify } = useApp(); const [draft, setDraft] = useState<GroupDraft>({ name: '', description: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  const [uploading, setUploading] = useState(false);
  const submit = async () => {
    if (lock.current || offline) return;
    if (!draft.name.trim()) { setError('Give your group a name.'); return; }
    lock.current = true; setBusy(true); setError('');
    try { const result = await request<Group>('/groups', { method: 'POST', body: { name: draft.name.trim(), description: draft.description.trim(), image: draft.image ?? null, icon: 'people', color: 'violet' } }); invalidate(); notify('Group created. Invite your people to start sharing.'); router.replace({ pathname: '/group/[id]', params: { id: result.data.id } }); }
    catch (error) { setError(`${errorMessage(error)} If the response was lost, check Your Groups before creating again.`); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Screen><Header back title="New group" />
    <View style={{ marginTop: -8 }}><IllustrationPanel source={illustrations.crew.source} ratio={illustrations.crew.ratio} top="29.7%" bottom="5.2%" label="A group of friends posing together" /></View>
    <View style={{ gap: 12 }}><Label size={34} bold>Good plans start here.</Label><Label muted size={16}>Bring your people together.</Label></View>
    <GroupDetailsForm value={draft} onChange={setDraft} disabled={busy || offline} onBusy={setUploading} />
    {!!error && <Notice text={error} error />}
    <View style={{ marginTop: 18 }}><Button title="Create group" disabled={offline || uploading} busy={busy} onPress={() => void submit()} /></View>
  </Screen>;
}
