import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { QrCode } from '@/components/qr-code';
import { Sheet } from '@/components/sheet';
import { Avatar, Button, Label, ResourceError, Skeletons, styles } from '@/components/ui/app-ui';
import { useResource } from '@/hooks/use-resource';
import { errorMessage } from '@/lib/api';
import { inviteLink, shareInvite } from '@/lib/invite';
import type { Group } from '@/lib/types';
import { useApp } from '@/providers/app-provider';

// Members join with the group code; "Add member" and "Invite people" both open this sheet.
export default function Invite() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { colors, notify } = useApp();
  const group = useResource<Group>(`/groups/${id}`); const data = group.data;
  const copy = async () => { try { if (await Clipboard.setStringAsync(data!.joinCode, { android: { isSensitive: true } })) notify('Join code copied.'); else notify('Could not copy the code.'); } catch (error) { notify(errorMessage(error)); } };
  return <Sheet title={`Invite to ${data?.name ?? 'group'}`} subtitle="Scan the QR or enter the code to join.">
    {!!group.error && <View style={{ marginTop: 16 }}><ResourceError message={group.error} retry={() => void group.reload()} /></View>}
    {group.loading && !data ? <View style={{ marginTop: 20 }}><Skeletons count={2} /></View> : data && <>
      <View style={[styles.row, { gap: 14, marginTop: 24 }]}><Avatar name={data.name} color={data.color} size={40} /><View style={{ flex: 1, gap: 2 }}><Label size={17} weight={500} lines={1}>{data.name}</Label><Label muted size={15}>{data.memberCount} {data.memberCount === 1 ? 'member' : 'members'} · INR</Label></View></View>
      <View style={{ alignSelf: 'center', marginTop: 24, padding: 12, borderRadius: 24, backgroundColor: colors.raised }}><QrCode value={inviteLink(data.joinCode)} size={180} /></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Join code ${data.joinCode}. Copy`} onPress={() => void copy()} style={({ pressed }) => [styles.input, { marginTop: 22, minHeight: 62, borderRadius: 20, backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}>
        <View style={{ flex: 1 }}><Label size={18} weight={600}>{data.joinCode.split('').join(' ')}</Label></View><Feather name="copy" size={24} color={colors.link} />
      </Pressable>
      <View style={{ marginTop: 10, marginBottom: 22 }}><Label muted size={15} align="center">Tap the code to copy it</Label></View>
      <Button title="Share group" onPress={() => shareInvite(data, notify)} />
    </>}
  </Sheet>;
}
