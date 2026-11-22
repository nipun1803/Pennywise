import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { AvatarBadge, Brand, Button, GroupCard, Label, Notice, ResourceError, Screen, Skeletons, SummaryCard, styles } from '@/components/ui/app-ui';
import { useDashboard } from '@/hooks/use-group-summaries';
import { formatAmount, greeting } from '@/lib/format';
import { useApp } from '@/providers/app-provider';
import { illustrations } from '@/theme/illustrations';

const openGroup = (id: string) => router.push({ pathname: '/group/[id]', params: { id } });
export default function Home() {
  const { session, offline, colors } = useApp();
  const resource = useDashboard();
  const { summaries, loading: summarising, reload } = resource;
  const user = session!.user; const groups = resource.data ?? [];
  const summarised = groups.length > 0 && groups.every(group => summaries[group.id]);
  const active = groups.filter(group => summaries[group.id]?.expenseCount);
  const newest = groups[0];
  const refresh = () => { void reload(); };
  const balance = resource.totals?.balanceCents ?? 0;
  return <Screen tabs onRefresh={refresh} refreshing={resource.loading && !!resource.data}>
    <View style={[styles.row, { justifyContent: 'space-between' }]}><Brand /><Pressable accessibilityRole="button" accessibilityLabel="Your profile" onPress={() => router.push('/profile')}><AvatarBadge name={user.name} avatar={user.avatar} image={user.image} color={user.avatarColor ?? 'violet'} /></Pressable></View>
    <View style={{ marginTop: -6 }}><Label size={30} bold>{greeting(user.name)}.</Label></View>
    {resource.saved && !offline && <Notice text="Showing saved data. Refresh to check for updates." />}
    {!!resource.error && <ResourceError message={resource.error} retry={() => void resource.reload()} />}
    {(resource.loading && !resource.data) || (groups.length > 0 && !summarised && summarising) ? <Skeletons /> : resource.data && groups.length === 0 ? <>
      <View style={{ alignItems: 'center', marginTop: 24 }}><Image source={illustrations.friends.source} style={{ width: '92%', aspectRatio: illustrations.friends.ratio }} contentFit="contain" accessibilityLabel="Three friends smiling together" /></View>
      <View style={{ gap: 16, marginTop: 14, paddingHorizontal: 8 }}><Label size={32} weight={600} align="center">{'Your first group\nstarts here.'}</Label><Label muted size={16} align="center">{'A trip, a shared home, or just lunch.\nKeep the bills together in one place.'}</Label></View>
      <View style={{ gap: 14, marginTop: 4 }}><Button title="Create a group" disabled={offline} onPress={() => router.push('/create-group')} /><Button title="Join with a code" secondary disabled={offline} onPress={() => router.push('/join')} /></View>
    </> : newest && summarised && active.length === 0 ? <>
      <View style={{ gap: 26, marginTop: 30 }}><Label size={36} weight={600}>{'Make your first\nshared expense.'}</Label><Label muted size={16}>{newest.memberCount === 1 ? `Add people to ${newest.name}, then record what you’ve spent together.` : `Record what you’ve spent together in ${newest.name}.`}</Label></View>
      <View style={{ marginTop: 22 }}><GroupCard group={newest} subtitle="No expenses yet" onPress={() => openGroup(newest.id)} /></View>
      <View style={{ gap: 14, marginTop: 24 }}>
        {newest.memberCount === 1 ? <Button title="Add members" disabled={offline} onPress={() => router.push({ pathname: '/group/[id]/invite', params: { id: newest.id } })} /> : <Button title="Add expense" disabled={offline} onPress={() => router.push({ pathname: '/group/[id]/expense', params: { id: newest.id } })} />}
        <Button title="Invite people" secondary onPress={() => router.push({ pathname: '/group/[id]/invite', params: { id: newest.id } })} />
      </View>
    </> : groups.length > 0 && <>
      <SummaryCard items={[{ label: 'Group spending', value: formatAmount(resource.totals?.spendingCents ?? 0), caption: `${active.length} active ${active.length === 1 ? 'group' : 'groups'}` }, { label: 'Your balance', value: formatAmount(Math.abs(balance)), caption: balance > 0 ? 'You’re owed' : balance < 0 ? 'You owe' : 'All settled', tone: balance > 0 ? colors.positive : balance < 0 ? colors.danger : colors.muted }]} />
      <View style={[styles.row, { justifyContent: 'space-between', marginTop: 4 }]}><Label size={20} weight={600}>Your groups</Label><Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.push('/groups')}><Label size={16} weight={600} color={colors.link}>View all</Label></Pressable></View>
      <View style={{ gap: 12, marginTop: -8 }}>{groups.map(group => { const summary = summaries[group.id]; return <GroupCard key={group.id} group={group} subtitle={summary ? summary.expenseCount ? `${formatAmount(summary.spendingCents)} spent` : 'No expenses yet' : undefined} onPress={() => openGroup(group.id)} />; })}</View>
      <Button title="Add expense" disabled={offline} onPress={() => router.push('/choose-group')} />
    </>}
  </Screen>;
}
