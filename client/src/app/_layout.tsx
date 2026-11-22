import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppProvider, useApp } from '@/providers/app-provider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
function Navigator() {
  const { session, loading, dark, colors, pendingCode } = useApp();
  // A font error falls back to the system face rather than blocking the app.
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const ready = !loading && (fontsLoaded || !!fontError);
  useEffect(() => { if (ready) void SplashScreen.hideAsync(); }, [ready]);
  if (!ready) return null;
  const base = dark ? DarkTheme : DefaultTheme;
  return <ThemeProvider value={{ ...base, colors: { ...base.colors, background: colors.background, card: colors.surface, text: colors.text, primary: colors.primary, border: colors.border } }}>
    <StatusBar style={dark ? 'light' : 'dark'} />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={!session} redirectTo={pendingCode ? '/join' : '/home'}><Stack.Screen name="index" /><Stack.Screen name="login" /><Stack.Screen name="signup" /></Stack.Protected>
      <Stack.Protected guard={!!session} redirectTo="/"><Stack.Screen name="(app)" /></Stack.Protected>
      <Stack.Screen name="join" />
      <Stack.Screen name="scan" />
    </Stack>
  </ThemeProvider>;
}
export default function RootLayout() { return <AppProvider><Navigator /></AppProvider>; }
