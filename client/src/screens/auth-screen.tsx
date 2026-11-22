import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { BackButton, Brand, Button, Field, Label, Notice, PasswordField, Screen } from '@/components/ui/app-ui';
import { errorMessage } from '@/lib/api';
import { useApp } from '@/providers/app-provider';

export function AuthScreen({ signup = false }: { signup?: boolean }) {
  const { authenticate, offline, pendingCode, colors } = useApp();
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  // Field problems show under the field; request failures (e.g. email already used) use the banner.
  const [problems, setProblems] = useState<{ name?: string; email?: string; password?: string }>({});
  const filled = (!signup || !!name.trim()) && !!email.trim() && !!password;
  const submit = async () => {
    setError('');
    const bytes = Array.from(password).reduce((sum, char) => sum + (char.codePointAt(0)! <= 0x7f ? 1 : char.codePointAt(0)! <= 0x7ff ? 2 : char.codePointAt(0)! <= 0xffff ? 3 : 4), 0);
    const found = {
      name: signup && !name.trim() ? 'Enter your name.' : undefined,
      email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Enter a valid email address, like you@example.com.' : undefined,
      password: !password || bytes > 72 || (signup && Array.from(password).length < 8) ? (signup ? 'Use at least 8 characters (up to 72 bytes).' : 'Enter your password.') : undefined,
    };
    setProblems(found);
    if (found.name || found.email || found.password) return;
    setBusy(true);
    try { await authenticate(signup, { ...(signup ? { name: name.trim() } : {}), email: email.trim(), password }); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  };
  const footer = <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}>
    <Label muted size={16}>{signup ? 'Already have an account?' : 'New to Pennywise?'}</Label>
    <Pressable accessibilityRole="button" hitSlop={12} disabled={busy} onPress={() => router.replace(signup ? '/login' : '/signup')}><Label size={17} weight={600} color={colors.link}>{signup ? 'Sign in' : 'Create account'}</Label></Pressable>
  </View>;
  return <Screen footer={footer}>
    <View style={{ height: 44, justifyContent: 'center', alignItems: 'center', marginTop: -16 }}><View style={{ position: 'absolute', left: -10 }}><BackButton onPress={() => router.canGoBack() ? router.back() : router.replace('/')} /></View><Brand /></View>
    <View style={{ gap: 14, marginTop: 21 }}><Label size={36} bold>{signup ? 'Better, together.' : 'Welcome back.'}</Label><Label muted size={16}>{signup ? 'Create an account. Start sharing the everyday.' : 'Sign in to pick up where you left off.'}</Label></View>
    {!!pendingCode && <Notice text={`Group code ${pendingCode} is saved. We’ll join after you sign in.`} />}
    {Platform.OS === 'web' && <Label size={12} muted>For security, web sessions last until this page is reloaded. Mobile sessions are stored securely.</Label>}
    <View style={{ gap: 19, marginTop: 24 }}>{signup && <Field label="Your name" placeholder="Your full name" value={name} error={problems.name} onChangeText={value => { setName(value); setProblems(previous => ({ ...previous, name: undefined })); }} maxLength={80} autoComplete="name" editable={!busy} />}
      <Field label="Email address" placeholder="you@example.com" value={email} error={problems.email} onChangeText={value => { setEmail(value); setProblems(previous => ({ ...previous, email: undefined })); }} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" maxLength={254} editable={!busy} />
      <PasswordField label={signup ? 'Create a password' : 'Password'} placeholder={signup ? 'At least 8 characters' : 'Your password'} value={password} error={problems.password} onChangeText={value => { setPassword(value); setProblems(previous => ({ ...previous, password: undefined })); }} autoComplete={signup ? 'new-password' : 'current-password'} hint={signup ? 'Use at least 8 characters.' : undefined} editable={!busy} />
    </View>
    {!!error && <Notice text={error} error />}
    <View style={{ marginTop: 8 }}><Button title={signup ? 'Create account' : 'Sign in'} busy={busy} disabled={offline || !filled} onPress={() => void submit()} /></View>
  </Screen>;
}
