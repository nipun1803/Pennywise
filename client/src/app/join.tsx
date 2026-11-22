import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Card, Field, Header, Label, Notice, Screen } from '@/components/ui/app-ui';
import { errorMessage, request } from '@/lib/api';
import { isJoinCode } from '@/lib/format';
import type { Group } from '@/lib/types';
import { useApp } from '@/providers/app-provider';

export default function Join() {
  const { session, offline, pendingCode, setPendingCode, invalidate, notify } = useApp();
  // A scanned QR or invite link arrives as ?code=…
  const { code: linked } = useLocalSearchParams<{ code?: string }>();
  const linkedCode = typeof linked === 'string' && isJoinCode(linked) ? linked.trim().toUpperCase() : '';
  const [code, setCode] = useState(linkedCode || pendingCode); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const attempted = useRef(false); const submitting = useRef(false);
  const join = useCallback(async (value = code) => {
    if (submitting.current) return;
    setError('');
    const normalized = value.trim().toUpperCase();
    if (!isJoinCode(normalized)) { setError('Enter a valid six-character group code.'); return; }
    if (!session) { setPendingCode(normalized); router.push('/signup'); return; }
    if (offline) { setError("You're offline. Connect to join a group."); return; }
    submitting.current = true; setBusy(true);
    try {
      const result = await request<Group>('/groups/join', { method: 'POST', body: { code: normalized } });
      setPendingCode(''); invalidate(); notify(result.alreadyMember ? 'You’re already a member.' : `Joined ${result.data.name}`);
      router.replace({ pathname: '/group/[id]', params: { id: result.data.id } });
    } catch (error) { setError(errorMessage(error)); }
    finally { submitting.current = false; setBusy(false); }
  }, [code, session, offline, setPendingCode, invalidate, notify]);
  // Auth screens can sit above this mounted screen. Only the visible Join
  // screen may consume the retained or linked code once signed in.
  useFocusEffect(useCallback(() => { const target = pendingCode || linkedCode; if (session && target && !attempted.current) { attempted.current = true; void join(target); } }, [session, pendingCode, linkedCode, join]));
  const paste = async () => {
    try { const value = (await Clipboard.getStringAsync()).trim().toUpperCase(); if (isJoinCode(value)) { setCode(value); setError(''); } else setError('The clipboard does not contain a valid six-character code.'); }
    catch { setError('Could not read the clipboard. You can enter the code manually.'); }
  };
  return <Screen><Header back title="Join a group" subtitle="Scan the group’s QR, or enter the code someone shared with you." />
    <Button title="Scan QR code" secondary icon="qr-code-outline" disabled={busy} onPress={() => router.push('/scan')} />
    <Card><Field label="Group code" placeholder="K7M2QX" value={code} onChangeText={value => setCode(value.toUpperCase())} maxLength={6} autoCapitalize="characters" autoCorrect={false} editable={!busy} style={{ fontSize: 28, letterSpacing: 7, textAlign: 'center' }} /><Button title="Paste code" secondary icon="clipboard-outline" disabled={busy} onPress={() => void paste()} /><Label size={13} muted>We only read your clipboard when you tap Paste code.</Label></Card>
    {!session && <Notice text="You’ll sign in or create an account before joining. Your code will be kept." />}
    {!!error && <Notice text={error} error />}
    <View style={{ gap: 14 }}><Button title={session ? 'Join group' : 'Continue to sign up'} busy={busy} disabled={offline} onPress={() => void join()} />
      {!session && <Button title="Already have an account? Sign in" secondary disabled={offline || busy} onPress={() => { if (!isJoinCode(code)) { setError('Enter a valid six-character code first.'); return; } setPendingCode(code.trim().toUpperCase()); router.push('/login'); }} />}</View>
  </Screen>;
}
