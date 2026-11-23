import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Card, Field, Header, Label, Notice, Screen } from '@/components/ui/app-ui';
import { View } from 'react-native';
import { MemberPicker } from '@/components/member-picker';
import { useMutation } from '@/hooks/use-mutation';
import { useResource } from '@/hooks/use-resource';
import { errorMessage } from '@/lib/api';
import { formatINR, parseINR } from '@/lib/format';
import type { Balance, Member, Settlement, Suggestion } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
export default function PaymentForm() {
  const { id, sid, from, to, amount: initialAmount } = useLocalSearchParams<{ id: string; sid?: string; from?: string; to?: string; amount?: string }>(); const { session, offline, notify } = useApp(); const balances = useResource<Balance[]>(`/groups/${id}/balances`); const suggestions = useResource<Suggestion[]>(`/groups/${id}/settle-up`);
  const [sender, setSender] = useState<Member[]>([{ id: from ?? session!.user.id, name: from ? 'Member' : session!.user.name, image: from ? null : session!.user.image }]); const [receiver, setReceiver] = useState<Member[]>(to ? [{ id: to, name: 'Member' }] : []); const [amount, setAmount] = useState(initialAmount ? `${Math.floor(Number(initialAmount) / 100)}.${String(Number(initialAmount) % 100).padStart(2, '0')}` : ''); const [error, setError] = useState(''); const [warning, setWarning] = useState(''); const [deleteConfirm, setDeleteConfirm] = useState(false); const { busy, mutate } = useMutation(); const initialized = useRef(false);
  useEffect(() => { if (balances.data && !initialized.current) { initialized.current = true; const profile = (member: Member) => { const balance = balances.data!.find(item => item.userId === member.id); return { ...member, name: balance?.name ?? 'Member', image: balance?.image ?? member.image }; }; setSender(previous => previous.map(profile)); setReceiver(previous => previous.map(profile)); } }, [balances.data]);
  const save = async (confirmed = false) => {
    setError('');
    try {
      if (!sender[0] || !receiver[0]) throw new Error('Choose a sender and recipient.'); if (sender[0].id === receiver[0].id) throw new Error('Sender and recipient must be different people.');
      const amountCents = parseINR(amount);
      if (!confirmed && sid) { setWarning('Correct this external payment record? Balances already include the previous record; a correction may overpay or reverse a debt. No real transfer will be changed.'); return; }
      const suggestion = suggestions.data?.find(payment => payment.fromUser === sender[0].id && payment.toUser === receiver[0].id)?.amountCents ?? 0; const unavailable = suggestions.data === undefined || suggestions.saved || suggestions.loading || !!suggestions.error;
      if (!confirmed && !sid && (unavailable || amountCents > suggestion)) { setWarning(unavailable ? 'Suggested balances are unavailable. This payment may overpay or reverse a debt. Confirm the external payment record?' : `This exceeds the suggested payment (${formatINR(suggestion)}). It may reverse a debt. Record it anyway?`); return; }
      const result = await mutate<Settlement>(sid ? `/groups/${id}/settlements/${sid}` : `/groups/${id}/settlements`, sid ? 'PUT' : 'POST', { fromUser: sender[0].id, toUser: receiver[0].id, amountCents }, !sid); notify(`Payment ${sid ? 'corrected' : 'recorded'}—no money was transferred by Pennywise.`); setWarning(''); if (result.data) router.dismissTo({ pathname: '/group/[id]', params: { id } });
    } catch (error) { setError(errorMessage(error)); }
  };
  const remove = async () => { try { await mutate(`/groups/${id}/settlements/${sid}`, 'DELETE'); notify('Payment record deleted. This does not reverse the real payment.'); router.dismissTo({ pathname: '/group/[id]', params: { id } }); } catch (error) { setError(errorMessage(error)); } };
  const changed = () => setWarning('');
  return <Screen><Header back title={sid ? 'Correct payment' : 'Record payment'} subtitle="A record of money already transferred outside Pennywise." />
    <Card><View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}><View style={{ alignItems: 'center', gap: 8 }}><Avatar name={sender[0]?.name ?? '?'} image={sender[0]?.image} size={56} /><Label>{sender[0]?.name ?? 'Sender'}</Label></View><Label size={28}>→</Label><View style={{ alignItems: 'center', gap: 8 }}><Avatar name={receiver[0]?.name ?? '?'} image={receiver[0]?.image} size={56} /><Label>{receiver[0]?.name ?? 'Recipient'}</Label></View></View><Label muted align="center">Record a payment already made. No money moves here.</Label></Card>
    <MemberPicker label="Who sent the money?" groupId={id} selected={sender} onChange={value => { setSender(value); changed(); }} disabled={busy || offline} />
    <MemberPicker label="Who received it?" groupId={id} selected={receiver} onChange={value => { setReceiver(value); changed(); }} disabled={busy || offline} />
    <Card><Field label="Amount (₹ INR)" keyboardType="decimal-pad" placeholder="0.00" value={amount} onChangeText={value => { setAmount(value); changed(); }} editable={!busy && !offline} style={{ fontSize: 36 }} /></Card>
    {!!error && <Notice text={error} error />}
    {warning ? <><Notice text={warning} error /><Button title="Confirm payment record" busy={busy} disabled={offline} onPress={() => void save(true)} /><Button title="Cancel confirmation" secondary onPress={() => setWarning('')} /></> : <Button title={sid ? 'Save correction' : 'Record payment'} busy={busy} disabled={offline} onPress={() => void save()} />}
    {!!sid && <><Button title="Delete payment record" secondary danger disabled={busy || offline} onPress={() => setDeleteConfirm(true)} />{deleteConfirm && <><Notice text="Remove this payment from balances? It stays marked as deleted in history. This does not reverse any real transfer." error /><Button title="Confirm deletion" danger busy={busy} disabled={offline} onPress={() => void remove()} /></>}</>}
  </Screen>;
}
