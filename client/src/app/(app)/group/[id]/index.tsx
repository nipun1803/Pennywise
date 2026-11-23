import Feather from '@expo/vector-icons/Feather';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Avatar, Button, Card, categoryGlyph, Empty, Header, Label, Notice, Pager, ResourceError, Screen, Skeletons, SummaryCard, Tabs, styles } from '@/components/ui/app-ui';
import { useResource } from '@/hooks/use-resource';
import { formatAmount, shortDate } from '@/lib/format';
import type { Balance, Expense, Group, Settlement, Suggestion } from '@/lib/types';
import { useApp } from '@/providers/app-provider';

type Tab = 'expenses' | 'settlements' | 'members';
export default function GroupOverview() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { session, colors, offline } = useApp();
  const [tab, setTab] = useState<Tab>('expenses'); const [page, setPage] = useState(1);
  const me = session!.user.id;
  const group = useResource<Group>(`/groups/${id}`); const balances = useResource<Balance[]>(`/groups/${id}/balances`);
  const spending = useResource<{ overallBalanceCents: number }>(`/groups/${id}/statements?view=spending&userId=${me}&page=1&limit=1`);
  const expenses = useResource<Expense[]>(tab === 'expenses' ? `/groups/${id}/expenses?page=${page}&limit=25` : null);
  const payments = useResource<Settlement[]>(tab === 'settlements' ? `/groups/${id}/settlements?page=${page}&limit=25` : null);
  const suggestions = useResource<Suggestion[]>(tab === 'settlements' ? `/groups/${id}/settle-up` : null);
  const mine = balances.data?.find(balance => balance.userId === me);
  const name = (userId: string) => userId === me ? 'You' : balances.data?.find(balance => balance.userId === userId)?.name ?? 'Member';
  // First names keep compact rows on one line.
  const short = (userId: string) => name(userId).split(/\s+/)[0];
  const repayments = [...(suggestions.data ?? [])].sort((a, b) => Number(b.fromUser === me || b.toUser === me) - Number(a.fromUser === me || a.toUser === me));
  const active = tab === 'expenses' ? expenses : tab === 'settlements' ? payments : balances;
  const refresh = () => { void group.reload(); void balances.reload(); void spending.reload(); void active.reload(); if (tab === 'settlements') void suggestions.reload(); };
  const alone = (group.data?.memberCount ?? 1) <= 1; const count = spending.pagination?.total ?? 0;
  const goInvite = () => router.push({ pathname: '/group/[id]/invite', params: { id } });
  const goExpense = () => router.push({ pathname: '/group/[id]/expense', params: { id } });
  return <Screen onRefresh={refresh} refreshing={active.loading && !!active.data}>
    <Header back title={group.data?.name ?? 'Your group'} action={<Pressable accessibilityRole="button" accessibilityLabel="Group options" hitSlop={8} onPress={() => router.push({ pathname: '/group/[id]/options', params: { id } })} style={styles.iconButton}><Feather name="more-vertical" size={26} color={colors.muted} /></Pressable>} />
    {group.data && (group.data.createdBy === me
      ? <Pressable accessibilityRole="button" accessibilityLabel="Change group photo" style={{ alignSelf: 'center' }} onPress={() => router.push({ pathname: '/group/[id]/settings', params: { id } })}><Avatar name={group.data.name} color={group.data.color} image={group.data.image} size={72} /></Pressable>
      : <View style={{ alignSelf: 'center' }}><Avatar name={group.data.name} color={group.data.color} image={group.data.image} size={72} /></View>)}
    {!!group.error && <ResourceError message={group.error} retry={() => void group.reload()} />}
    <SummaryCard items={[
      { label: 'Group spending', value: spending.data ? formatAmount(spending.data.overallBalanceCents) : '—', caption: `${count} ${count === 1 ? 'expense' : 'expenses'}` },
      { label: 'Your balance', value: mine ? formatAmount(Math.abs(mine.balanceCents)) : '—', caption: !mine ? (balances.loading ? 'Loading…' : 'Unavailable') : mine.balanceCents > 0 ? 'You’re owed' : mine.balanceCents < 0 ? 'You owe' : 'All settled', tone: mine && mine.balanceCents > 0 ? colors.positive : mine && mine.balanceCents < 0 ? colors.danger : colors.muted },
    ]} />
    {!!balances.error && <ResourceError message={balances.error} retry={() => void balances.reload()} />}
    {group.data && <View style={[styles.row, { gap: 12 }]}>
      <View style={{ flex: 1 }}>{alone ? <Button title="Invite people" onPress={goInvite} /> : <Button title="Add expense" disabled={offline} onPress={goExpense} />}</View>
      <View style={{ flex: 1 }}>{alone ? <Button title="Add Member" secondary onPress={goInvite} /> : <Button title="Invite people" secondary onPress={goInvite} />}</View>
    </View>}
    <Tabs value={tab} onChange={value => { setTab(value); setPage(1); }} options={[{ value: 'expenses', label: 'Expenses' }, { value: 'settlements', label: 'Settlements' }, { value: 'members', label: 'Members' }]} />
    {active.saved && <Notice text="Showing saved data. These balances or records may have changed." />}
    {!!active.error && tab !== 'members' && <ResourceError message={active.error} retry={() => void active.reload()} />}
    {active.loading && !active.data && <Skeletons />}
    {tab === 'expenses' && expenses.data?.map(expense => <Pressable accessibilityRole="button" key={expense.id} onPress={() => router.push({ pathname: '/group/[id]/expense-detail', params: { id, eid: expense.id } })}><Card style={{ paddingVertical: 16 }}><View style={[styles.row, { gap: 14 }]}><View style={[styles.iconBox, { width: 44, height: 44, backgroundColor: colors.tint }]}><Feather name={categoryGlyph(expense.category?.icon)} size={20} color={colors.link} /></View><View style={{ flex: 1, gap: 3 }}><Label weight={600} size={16} lines={1}>{expense.description}</Label><Label muted size={14} lines={1}>Paid by {short(expense.paidBy)} · {shortDate(expense.createdAt)}</Label></View><Label weight={600} size={16}>{formatAmount(expense.amountCents)}</Label></View></Card></Pressable>)}
    {tab === 'expenses' && expenses.data?.length === 0 && (alone ? <Empty title="No expenses yet" description="Add your people first, then start recording what you share."><Button title="Add Member" secondary compact onPress={goInvite} /></Empty> : <Empty title="No expenses yet" description="Record what you’ve spent together. Everyone’s share updates right away."><Button title="Add expense" secondary compact disabled={offline} onPress={goExpense} /></Empty>)}
    {tab === 'settlements' && <>
      {repayments.map((payment, i) => <Card key={i}><View style={[styles.row, { gap: 14 }]}><Avatar name={name(payment.fromUser)} image={balances.data?.find(member => member.userId === payment.fromUser)?.image} size={40} /><View style={{ flex: 1, gap: 3 }}><Label weight={600} size={16} lines={1}>{short(payment.fromUser)} → {short(payment.toUser)}</Label><Label muted size={14}>Suggested repayment</Label></View><Label weight={600} size={16}>{formatAmount(payment.amountCents)}</Label></View><Button title="Record payment" secondary disabled={offline} onPress={() => router.push({ pathname: '/group/[id]/payment', params: { id, from: payment.fromUser, to: payment.toUser, amount: String(payment.amountCents) } })} /></Card>)}
      {!!suggestions.error && <ResourceError message={suggestions.error} retry={() => void suggestions.reload()} />}
      {payments.data?.map(payment => <Card key={payment.id}><View style={[styles.row, { gap: 14 }]}><View style={{ flex: 1, gap: 3 }}><Label weight={600} size={16} lines={1}>{short(payment.fromUser)} paid {short(payment.toUser)}</Label><Label muted size={13}>Recorded by {short(payment.createdBy)} · {shortDate(payment.createdAt)}{payment.updatedBy ? ` · Corrected by ${short(payment.updatedBy)}` : ''}</Label></View><Label weight={600} size={16} color={payment.deletedAt ? colors.muted : colors.text}>{formatAmount(payment.amountCents)}{payment.deletedAt ? ' · Deleted' : ''}</Label></View>{!payment.deletedAt && <Button title="Correct payment" secondary disabled={offline} onPress={() => router.push({ pathname: '/group/[id]/payment', params: { id, sid: payment.id, from: payment.fromUser, to: payment.toUser, amount: String(payment.amountCents) } })} />}</Card>)}
      {payments.data?.length === 0 && suggestions.data?.length === 0 && <Empty title="All settled" description="When someone pays a member back outside the app, record it here." />}
      {payments.data && <Button title="Record a payment" secondary disabled={offline || alone} onPress={() => router.push({ pathname: '/group/[id]/payment', params: { id } })} />}
      <Label muted size={13}>Payments are records of money moved outside the app—not verified transfers.</Label>
    </>}
    {tab === 'members' && <>{balances.data?.map(balance => <Card key={balance.userId} style={{ paddingVertical: 14 }}><View style={[styles.row, { gap: 14 }]}><Avatar name={balance.name} image={balance.image} size={40} /><View style={{ flex: 1, gap: 2 }}><Label weight={600} size={16}>{balance.name}{balance.userId === me ? ' (you)' : ''}</Label>{group.data?.createdBy === balance.userId && <Label size={13} color={colors.link}>Group creator</Label>}</View><View style={{ alignItems: 'flex-end', gap: 2 }}><Label weight={600} size={16} color={balance.balanceCents > 0 ? colors.positive : balance.balanceCents < 0 ? colors.danger : colors.text}>{formatAmount(Math.abs(balance.balanceCents))}</Label><Label muted size={13}>{balance.balanceCents < 0 ? 'Owes' : balance.balanceCents > 0 ? 'Gets back' : 'Settled'}</Label></View></View></Card>)}
      <Button title="Add Member" secondary onPress={goInvite} /></>}
    {tab !== 'members' && <Pager pagination={active.pagination} onPage={setPage} disabled={active.loading} />}
  </Screen>;
}
