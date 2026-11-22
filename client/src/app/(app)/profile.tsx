import { useState } from 'react';
import { View } from 'react-native';
import { AvatarBadge, Button, Card, Chips, Field, Header, Label, Notice, Screen, styles } from '@/components/ui/app-ui';
import { useMutation } from '@/hooks/use-mutation';
import { errorMessage } from '@/lib/api';
import { greeting } from '@/lib/format';
import type { Accent, Avatar, User } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
import { accentOptions } from '@/screens/group-details-form';
import { ImageChoice } from '@/components/image-choice';
export default function Profile() {
  const { session, offline, themeMode, setThemeMode, updateUser, logout, notify } = useApp();
  const user = session!.user;
  const [draft, setDraft] = useState<{ name?: string; avatar?: Avatar; color?: Accent; image?: string | null }>({});
  const [uploading, setUploading] = useState(false); const image = draft.image === undefined ? user.image : draft.image;
  const name = draft.name ?? user.name; const avatar = draft.avatar ?? user.avatar ?? 'initials'; const color = draft.color ?? user.avatarColor ?? 'emerald';
  const setName = (name: string) => setDraft(previous => ({ ...previous, name }));
  const setAvatar = (avatar: Avatar) => setDraft(previous => ({ ...previous, avatar }));
  const setColor = (color: Accent) => setDraft(previous => ({ ...previous, color }));
  const { busy, mutate } = useMutation(); const [error, setError] = useState('');
  const save = async () => {
    if (!name.trim()) { setError('Enter your name.'); return; }
    setError('');
    try { const result = await mutate<User>('/me', 'PATCH', { name: name.trim(), avatar, avatarColor: color, image: image ?? null }); await updateUser(result.data); setDraft({}); notify('Profile updated.'); }
    catch (error) { setError(errorMessage(error)); }
  };
  return <Screen><Header back title="Your profile" subtitle="A few details that make Pennywise yours." /><Card><View style={styles.row}><AvatarBadge name={name} avatar={avatar} color={color} image={image} /><View style={{ flex: 1 }}><Label size={20} bold>{greeting(user.name)}</Label><Label size={13} muted>{user.email}</Label></View></View></Card>
    <ImageChoice name={name} value={image} onChange={image => setDraft(previous => ({ ...previous, image, avatar: 'initials' }))} disabled={busy || offline} onBusy={setUploading} />
    <Field label="Display name" value={name} onChangeText={setName} maxLength={80} editable={!busy && !offline} />
    <Label bold>Avatar</Label><Chips disabled={busy || offline} value={avatar} onChange={setAvatar} options={[{ value: 'initials', label: 'Initials' }, { value: 'leaf', label: 'Leaf' }, { value: 'sun', label: 'Sun' }, { value: 'sparkles', label: 'Sparkles' }, { value: 'coffee', label: 'Coffee' }]} />
    <Chips disabled={busy || offline} value={color} onChange={setColor} options={accentOptions} />
    {!!error && <Notice text={error} error />}<Button title="Save profile" busy={busy} disabled={offline || uploading || Object.keys(draft).length === 0} onPress={() => void save()} />
    <Card><Label bold>Appearance</Label><Label size={13} muted>Choose a theme, or follow your device. This preference is saved on this device.</Label><Chips value={themeMode} onChange={setThemeMode} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></Card>
    <Button title="Log out" secondary danger onPress={() => { void logout().catch(error => setError(errorMessage(error))); }} /><Label size={12} muted>Logging out removes your session and saved account data from this device.</Label>
  </Screen>;
}
