import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Header, Label, Notice, ResourceError, Screen, Skeletons, styles } from '@/components/ui/app-ui';
import { useMutation } from '@/hooks/use-mutation';
import { useResource } from '@/hooks/use-resource';
import { errorMessage } from '@/lib/api';
import { formatDate, formatINR } from '@/lib/format';
import type { Balance, Expense, Group } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
export default function ExpenseDetail() {
  const { id, eid } = useLocalSearchParams<{ id: string; eid: string }>(); const { session, offline, notify } = useApp(); const expense = useResource<Expense>(`/groups/${id}/expenses/${eid}`); const group = useResource<Group>(`/groups/${id}`); const members = useResource<Balance[]>(`/groups/${id}/balances`); const { busy, mutate } = useMutation(); const [confirm, setConfirm] = useState(false); const [error, setError] = useState('');
  const name = (userId: string) => members.data?.find(member => member.userId === userId)?.name ?? 'Member'; const canEdit = expense.data?.createdBy === session?.user.id || group.data?.createdBy === session?.user.id;
  const remove = async () => { try { await mutate(`/groups/${id}/expenses/${eid}`, 'DELETE'); notify('Expense deleted. Recorded payments remain unchanged.'); router.dismissTo({ pathname: '/group/[id]', params: { id } }); } catch (error) { setError(errorMessage(error)); } };
  return <Screen><Header back title="Expense details" subtitle={group.data?.name} />
    {!!expense.error && <ResourceError message={expense.error} retry={() => void expense.reload()} />}
    {expense.loading && !expense.data && <Skeletons />}
    {expense.data && <><Card><Label bold size={21}>{expense.data.description}</Label><Label bold size={34}>{formatINR(expense.data.amountCents)}</Label><Label muted>{expense.data.category?.name ?? 'Uncategorized'} · {formatDate(expense.data.createdAt)}</Label><Label>Paid by {name(expense.data.paidBy)}</Label><Label size={12} muted>Added by {name(expense.data.createdBy)}</Label></Card><Label bold size={19}>Individual shares</Label>{expense.data.splits.map(split => <Card key={split.userId}><View style={styles.row}><View style={{ flex: 1 }}><Label>{name(split.userId)}{split.userId === session?.user.id ? ' (you)' : ''}</Label></View><Label bold>{formatINR(split.shareCents)}</Label></View></Card>)}{canEdit && <><Button title="Edit expense" secondary disabled={offline || busy} onPress={() => router.push({ pathname: '/group/[id]/expense', params: { id, eid } })} /><Button title="Delete expense" secondary danger disabled={offline || busy} onPress={() => setConfirm(true)} />{confirm && <><Notice text="Delete this expense? It will stop counting toward balances. Payments already recorded remain. This cannot be undone." error /><Button title="Confirm deletion" danger disabled={offline} busy={busy} onPress={() => void remove()} /><Button title="Cancel" secondary onPress={() => setConfirm(false)} /></>}</>}</>}
    {!!error && <Notice text={error} error />}
  </Screen>;
}
