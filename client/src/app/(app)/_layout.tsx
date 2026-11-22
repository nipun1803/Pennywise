import { Stack } from 'expo-router';
import { useApp } from '@/providers/app-provider';
export const unstable_settings = { anchor: '(tabs)' };
const sheet = { presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } } as const;
export default function AppLayout() {
  const { colors } = useApp();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
    <Stack.Screen name="(tabs)" />
    <Stack.Screen name="group/[id]/options" options={sheet} />
    <Stack.Screen name="group/[id]/invite" options={sheet} />
  </Stack>;
}
