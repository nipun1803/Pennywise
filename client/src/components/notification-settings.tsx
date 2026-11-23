import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Card, Label, Notice } from '@/components/ui/app-ui';
import { useMutation } from '@/hooks/use-mutation';
import { errorMessage } from '@/lib/api';
import type { NotificationKind, User } from '@/lib/types';
import { useApp } from '@/providers/app-provider';

const kinds: { kind: NotificationKind; title: string; caption: string }[] = [
  { kind: 'expenses', title: 'Expenses', caption: 'Added, edited or deleted expenses you are part of.' },
  { kind: 'payments', title: 'Payments', caption: 'Payments you send or receive.' },
  { kind: 'members', title: 'New members', caption: 'Someone joins one of your groups.' },
];
export function NotificationSettings() {
  const { session, offline, colors, updateUser } = useApp();
  const { busy, mutate } = useMutation(); const [error, setError] = useState('');
  const prefs = session!.user.notifications;
  const toggle = async (kind: NotificationKind, enabled: boolean) => {
    setError('');
    try { updateUser((await mutate<User>('/me/notifications', 'PATCH', { [kind]: enabled })).data); }
    catch (failure) { setError(errorMessage(failure)); }
  };
  return <Card>
    <Label bold>Notifications</Label>
    <Label size={13} muted>Choose what Pennywise alerts you about. You are never notified about your own changes.</Label>
    {kinds.map(({ kind, title, caption }) => <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}><Label weight={600}>{title}</Label><Label size={13} muted>{caption}</Label></View>
      <Switch accessibilityLabel={`${title} notifications`} value={prefs?.[kind] ?? true} disabled={busy || offline} onValueChange={enabled => void toggle(kind, enabled)}
        trackColor={{ true: colors.primary }} />
    </View>)}
    {!!error && <Notice text={error} error />}
  </Card>;
}
