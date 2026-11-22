import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Avatar, Card, Empty, Header, Label, Notice, ResourceError, Screen, Skeletons, SummaryCard, styles } from '@/components/ui/app-ui';
import { useDashboard } from '@/hooks/use-group-summaries';
import { formatAmount } from '@/lib/format';
import { useApp } from '@/providers/app-provider';

// One authenticated dashboard request covers all groups, including totals.
export default function Reports() {
  const { colors } = useApp();
  const groups = useDashboard();
  const { summaries, loading, error, reload } = groups;
  const rows = (groups.data ?? []).filter(group => summaries[group.id]?.expenseCount).map(group => ({ group, ...summaries[group.id] })).sort((a, b) => b.spendingCents - a.spendingCents);
  const total = groups.totals?.spendingCents ?? 0;
  const balance = groups.totals?.balanceCents ?? 0;
  const expenses = groups.totals?.expenseCount ?? 0;
  const pending = (groups.loading && !groups.data) || (loading && !!groups.data?.length && rows.length === 0 && Object.keys(summaries).length === 0);
  return <Screen tabs onRefresh={() => { void reload(); }} refreshing={loading && rows.length > 0}>
    <Header title="Reports" subtitle="Where your shared money goes." />
    {groups.saved && <Notice text="Showing saved figures. Refresh to check for updates." />}
    {!!(groups.error || error) && <ResourceError message={groups.error || error} retry={() => { void groups.reload(); reload(); }} />}
    {pending ? <Skeletons /> : rows.length === 0 ? <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}><Empty title="No reports yet" description={'Add a shared expense to see\nwhere your money goes.'} /></View> : <>
      <SummaryCard items={[{ label: 'Total spending', value: formatAmount(total), caption: `${expenses} ${expenses === 1 ? 'expense' : 'expenses'}` }, { label: 'Your balance', value: formatAmount(Math.abs(balance)), caption: balance > 0 ? 'You’re owed' : balance < 0 ? 'You owe' : 'All settled', tone: balance > 0 ? colors.positive : balance < 0 ? colors.danger : colors.muted }]} />
      <Label size={20} weight={600}>By group</Label>
      <View style={{ gap: 12, marginTop: -8 }}>{rows.map(row => { const share = total ? row.spendingCents / total : 0; const mine = row.balanceCents ?? 0; return <Pressable key={row.group.id} accessibilityRole="button" accessibilityLabel={`${row.group.name}, ${formatAmount(row.spendingCents)}, ${Math.round(share * 100)} percent of spending`} onPress={() => router.push({ pathname: '/group/[id]', params: { id: row.group.id } })}><Card>
        <View style={[styles.row, { gap: 14 }]}><Avatar name={row.group.name} color={row.group.color} size={40} /><View style={{ flex: 1, gap: 2 }}><Label size={16} weight={600} lines={1}>{row.group.name}</Label><Label muted size={13}>{row.balanceCents === null ? 'Balance unavailable' : mine > 0 ? `You’re owed ${formatAmount(mine)}` : mine < 0 ? `You owe ${formatAmount(-mine)}` : 'All settled'}</Label></View><View style={{ alignItems: 'flex-end', gap: 2 }}><Label size={16} weight={600}>{formatAmount(row.spendingCents)}</Label><Label muted size={13}>{Math.round(share * 100)}%</Label></View></View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.segment, overflow: 'hidden' }}><View style={{ width: `${Math.max(share * 100, 2)}%`, height: '100%', borderRadius: 4, backgroundColor: colors.primary }} /></View>
      </Card></Pressable>; })}</View>
    </>}
  </Screen>;
}
