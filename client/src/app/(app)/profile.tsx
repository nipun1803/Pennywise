import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Chips, Field, Header, Label, Notice, Screen } from '@/components/ui/app-ui';
import { useMutation } from '@/hooks/use-mutation';
import { errorMessage } from '@/lib/api';
import { greeting } from '@/lib/format';
import type { Avatar, User } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
import { ImageChoice } from '@/components/image-choice';
import { NotificationSettings } from '@/components/notification-settings';
export default function Profile() {
  const { session, offline, themeMode, setThemeMode, updateUser, logout, notify } = useApp();
  const user = session!.user;
  const [draft, setDraft] = useState<{ name?: string }>({});
  const [saving, setSaving] = useState(false); const saveLock = useRef(false);
  const [uploading, setUploading] = useState(false);
  const name = draft.name ?? user.name; const color = user.avatarColor ?? 'emerald';
  const setName = (name: string) => setDraft(previous => ({ ...previous, name }));
  const { busy, mutate } = useMutation(); const [error, setError] = useState('');
  const savePhoto = async (image: string | null) => {
    const result = await mutate<User>('/me', 'PATCH', { image, avatar: 'initials' });
    await updateUser(result.data); notify(image ? 'Profile photo updated.' : 'Profile photo removed.');
  };
  const saveAvatar = async (avatar: Avatar) => {
    const result = await mutate<User>('/me', 'PATCH', { avatar, image: null });
    await updateUser(result.data); notify('Profile avatar updated.');
  };
  const save = async () => {
    if (saveLock.current || offline || uploading) return;
    if (!name.trim()) { setError('Enter your name.'); return; }
    saveLock.current = true; setSaving(true); setError('');
    try {
      const result = await mutate<User>('/me', 'PATCH', { name: name.trim() }); await updateUser(result.data); setDraft({}); notify('Profile updated.');
    }
    catch (error) { setError(errorMessage(error)); }
    finally { saveLock.current = false; setSaving(false); }
  };
  return <Screen><Header back title="Your profile" subtitle="A few details that make Pennywise yours." /><Card>
    <ImageChoice name={name} value={user.image} avatar={user.avatar} color={color} onSave={savePhoto} onAvatarSave={saveAvatar} disabled={busy || saving || offline} onBusy={setUploading} />
    <View style={{ gap: 4 }}><Label size={20} bold align="center">{greeting(user.name)}</Label><Label size={13} muted align="center">{user.email}</Label></View>
  </Card>
    <Field label="Display name" value={name} onChangeText={setName} maxLength={80} editable={!busy && !saving && !uploading && !offline} />
    <Button title={saving ? 'Saving profile…' : 'Save profile'} busy={saving} disabled={busy || offline || uploading || name === user.name} onPress={() => void save()} />
    {!!error && <Notice text={error} error />}
    <Card><Label bold>Appearance</Label><Label size={13} muted>Choose a theme, or follow your device. This preference is saved on this device.</Label><Chips value={themeMode} onChange={setThemeMode} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></Card>
    <NotificationSettings />
    <Button title="Log out" secondary danger disabled={busy || saving || uploading} onPress={() => { void logout().catch(error => setError(errorMessage(error))); }} /><Label size={12} muted>Logging out removes your session and saved account data from this device.</Label>
  </Screen>;
}
