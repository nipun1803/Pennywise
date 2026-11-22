import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, Chips, Field, Header, Label, Notice, ResourceError, Screen } from '@/components/ui/app-ui';
import { SplitPreview } from '@/components/split-preview';
import { MemberPicker } from '@/components/member-picker';
import { useMutation } from '@/hooks/use-mutation';
import { useResource } from '@/hooks/use-resource';
import { errorMessage } from '@/lib/api';
import { parseINR } from '@/lib/format';
import type { Balance, Category, Expense, Group, Member } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
import { CategoryPicker } from '@/screens/category-manager';
export default function ExpenseForm() {
  const { id, eid } = useLocalSearchParams<{ id: string; eid?: string }>(); const { session, offline, notify } = useApp(); const { busy, mutate } = useMutation();
  const existing = useResource<Expense>(eid ? `/groups/${id}/expenses/${eid}` : null); const group = useResource<Group>(`/groups/${id}`); const balances = useResource<Balance[]>(`/groups/${id}/balances`);
  const [description, setDescription] = useState(''); const [amount, setAmount] = useState(''); const [payer, setPayer] = useState<Member[]>([{ id: session!.user.id, name: session!.user.name }]);
  const [mode, setMode] = useState<'all' | 'selected' | 'keep' | 'custom'>('all'); const [shares, setShares] = useState<Record<string, string>>({}); const [participants, setParticipants] = useState<Member[]>([]); const [excluded, setExcluded] = useState<Member[]>([]); const [category, setCategory] = useState<Pick<Category, 'id' | 'name' | 'icon' | 'color'> | null>(null); const [error, setError] = useState(''); const initialized = useRef('');
  useEffect(() => {
    if (existing.data && initialized.current !== eid && balances.data) {
      initialized.current = eid!; const expense = existing.data; const name = (userId: string) => balances.data!.find(item => item.userId === userId)?.name ?? 'Member';
      setDescription(expense.description); setAmount(`${Math.floor(expense.amountCents / 100)}.${String(expense.amountCents % 100).padStart(2, '0')}`); setPayer([{ id: expense.paidBy, name: name(expense.paidBy) }]); setMode('keep'); setParticipants(expense.splits.map(split => ({ id: split.userId, name: name(split.userId) }))); setCategory(expense.category);
      setMode('custom'); setShares(Object.fromEntries(expense.splits.map(s => [s.userId, `${Math.floor(s.shareCents / 100)}.${String(s.shareCents % 100).padStart(2, '0')}`])));
    }
  }, [existing.data, eid, balances.data]);
  const submit = async () => {
    setError('');
    try {
      if (!description.trim()) throw new Error('Describe this expense.'); if (!category && !eid) throw new Error('Choose a category before saving.'); if (!payer[0]) throw new Error('Choose who paid.');
      if ((mode === 'selected' || mode === 'custom') && !participants.length) throw new Error('Include at least one participant.');
      if (mode === 'all' && group.data && excluded.length >= group.data.memberCount) throw new Error('Include at least one participant.');
      const amountCents = parseINR(amount);
      const customSplits = mode === 'custom' ? participants.map(member => ({ userId: member.id, shareCents: /^0+(\.0{1,2})?$/.test(shares[member.id]?.trim() ?? '') ? 0 : parseINR(shares[member.id] ?? '') })) : undefined;
      if (customSplits && customSplits.reduce((sum, s) => sum + BigInt(s.shareCents), 0n) !== BigInt(amountCents)) throw new Error('Custom shares must add up exactly to the expense amount.');
      const body = { description: description.trim(), amountCents, paidBy: payer[0].id, ...(category ? { categoryId: category.id } : {}),
        ...(mode === 'custom' ? { splitMode: 'custom', customSplits } : mode === 'selected' ? { splitMode: 'selected', splitUserIds: participants.map(member => member.id).sort() } : mode === 'all' ? excluded.length ? { splitMode: 'allExcept', excludedUserIds: excluded.map(member => member.id).sort() } : { splitMode: 'all' } : {}) };
      const result = await mutate<Expense>(eid ? `/groups/${id}/expenses/${eid}` : `/groups/${id}/expenses`, eid ? 'PUT' : 'POST', body, !eid); notify(eid ? 'Expense updated. Balances have been recalculated.' : 'Expense added.'); router.dismissTo({ pathname: '/group/[id]/expense-detail', params: { id, eid: result.data.id } });
    } catch (error) { setError(errorMessage(error)); }
  };
  const disabled = busy || offline || (!!eid && (!existing.data || !balances.data));
  let total = 0; try { total = parseINR(amount); } catch {}
  const previewMembers = mode === 'all' ? (balances.data ?? []).filter(b => !excluded.some(e => e.id === b.userId)).map(b => ({ id: b.userId, name: b.name })) : participants;
  return <Screen><Header back title={eid ? 'Edit expense' : 'Add expense'} subtitle={group.data?.name ?? 'Shared equally. Calculated exactly.'} />{!!existing.error && !!eid && <ResourceError message={existing.error} retry={() => void existing.reload()} />}{!!balances.error && !!eid && <ResourceError message={balances.error} retry={() => void balances.reload()} />}
    <Card><Field label="Amount (₹ INR)" placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!disabled} style={{ fontSize: 36 }} /><Field label="Description" placeholder="e.g. Dinner at the beach" value={description} onChangeText={setDescription} maxLength={200} editable={!disabled} /></Card>
    <CategoryPicker groupId={id} selected={category} onChange={setCategory} disabled={disabled} /><MemberPicker groupId={id} label="Paid by" selected={payer} onChange={setPayer} disabled={disabled} />
    <Label bold>How should we split it?</Label><Chips value={mode} onChange={setMode} disabled={disabled} options={[...(eid ? [{ value: 'keep' as const, label: 'Keep original people' }] : []), { value: 'all', label: 'Evenly' }, { value: 'selected', label: 'Selected people' }, { value: 'custom', label: 'Custom amounts' }]} />
    {mode === 'all' && <><Notice text={excluded.length ? `Everyone except ${excluded.length} selected member(s). New members are included only when this expense is saved.` : 'Everyone currently in this group is included when you save.'} /><MemberPicker groupId={id} label="Exclude members (optional)" selected={excluded} onChange={setExcluded} multiple disabled={disabled} /></>}
    {(mode === 'selected' || mode === 'custom') && <MemberPicker groupId={id} label="Included members" selected={participants} onChange={setParticipants} multiple disabled={disabled} />}{mode === 'keep' && <Notice text={`Keep the original ${participants.length} participants, even if other members joined later.`} />}
    {mode !== 'keep' && <SplitPreview members={previewMembers} custom={mode === 'custom'} values={shares} onChange={setShares} disabled={disabled} total={total} />}
    <Label muted size={12}>Shares are checked exactly in paise before saving. The payer can be excluded.</Label>{!!error && <Notice text={error} error />}<Button title={eid ? 'Save changes' : 'Save expense'} disabled={disabled} busy={busy} onPress={() => void submit()} />
  </Screen>;
}
