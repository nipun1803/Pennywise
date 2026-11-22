import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Card, categoryGlyph, Empty, Header, Label, Notice, Pager, ResourceError, Screen, Skeletons, Tabs, styles } from '@/components/ui/app-ui';
import { useResource } from '@/hooks/use-resource';
import { formatAmount, shortDate } from '@/lib/format';
import type { Group } from '@/lib/types';
import { useApp } from '@/providers/app-provider';

interface Event { id: string; action: string; actorId: string; actorName: string; at: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; group: Group; fromName?: string; toName?: string }
type Kind = 'all' | 'expenses' | 'payments';
const verbs: Record<string, string> = { 'expense.created': 'added', 'expense.updated': 'edited', 'expense.deleted': 'deleted', 'payment.created': 'recorded a payment', 'payment.updated': 'corrected a payment', 'payment.deleted': 'deleted a payment' };

// One globally sorted, paginated API feed scoped to the current user's groups.
export default function Activity() {
  const { colors, session } = useApp(); const [kind, setKind] = useState<Kind>('all'); const [page, setPage] = useState(1);
  const feeds = useResource<Event[]>(`/activity?kind=${kind}&page=${page}&limit=25`);
  const events = feeds.data ?? []; const loading = feeds.loading && !feeds.data;
  return <Screen tabs onRefresh={() => { void feeds.reload(); }} refreshing={feeds.loading && !!feeds.data}>
    <Header title="Activity" subtitle="Shared expenses and recorded payments." />
    <View style={{ marginTop: 8 }}><Tabs inset value={kind} onChange={value => { setKind(value); setPage(1); }} options={[{ value: 'all', label: 'All' }, { value: 'expenses', label: 'Expenses' }, { value: 'payments', label: 'Settlements' }]} /></View>
    {feeds.saved && <Notice text="Showing saved activity. Refresh to check for updates." />}
    {!!feeds.error && <ResourceError message={feeds.error} retry={() => { void feeds.reload(); }} />}
    {loading ? <Skeletons /> : events.length === 0 ? <View style={{ flex: 1, justifyContent: 'center', paddingBottom: 60 }}><Empty title="No activity yet" description={'Your shared expenses and recorded\npayments will appear here.'} /></View>
      : <View style={{ gap: 12 }}>{events.map(event => {
        const data = event.after ?? event.before ?? {}; const payment = event.action.startsWith('payment.');
        const amount = typeof data.amountCents === 'number' ? data.amountCents : null; const description = typeof data.description === 'string' ? data.description : '';
        const actor = event.actorId === session?.user.id ? 'You' : event.actorName.split(/\s+/)[0]; const category = data.category as { icon?: string } | null | undefined;
        return <Pressable key={`${event.group.id}:${event.id}`} accessibilityRole="button" onPress={() => router.push({ pathname: '/group/[id]', params: { id: event.group.id } })}><Card style={{ paddingVertical: 16 }}><View style={[styles.row, { gap: 14 }]}>
          <View style={[styles.iconBox, { width: 44, height: 44, backgroundColor: colors.tint }]}><Feather name={payment ? 'repeat' : categoryGlyph(category?.icon)} size={20} color={colors.link} /></View>
          <View style={{ flex: 1, gap: 3 }}><Label size={15} lines={2}>{payment && event.fromName && event.toName ? `${event.fromName.split(/\s+/)[0]} paid ${event.toName.split(/\s+/)[0]}${event.action.endsWith('updated') ? ' · corrected' : event.action.endsWith('deleted') ? ' · deleted' : ''}` : `${actor} ${verbs[event.action]}${description ? ` “${description}”` : ''}`}</Label><Label muted size={13} lines={1}>{event.group.name} · {shortDate(event.at)}</Label></View>
          {amount !== null && <Label size={16} weight={600} color={event.action.endsWith('deleted') ? colors.muted : colors.text}>{formatAmount(amount)}</Label>}
        </View></Card></Pressable>;
      })}</View>}
    <Pager pagination={feeds.pagination} onPage={setPage} disabled={feeds.loading} />
  </Screen>;
}
