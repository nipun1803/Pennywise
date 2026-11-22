import Feather from '@expo/vector-icons/Feather';
import { router } from 'expo-router';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GUTTER, Label, styles as ui, type GlyphName } from '@/components/ui/app-ui';
import { useApp } from '@/providers/app-provider';

const close = () => router.canGoBack() ? router.back() : router.replace('/home');

// Bottom sheet shown by transparent-modal routes; tapping the scrim or the close button dismisses it.
export function Sheet({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: ReactNode }>) {
  const { colors } = useApp(); const insets = useSafeAreaInsets();
  return <View style={{ flex: 1, justifyContent: 'flex-end' }}>
    <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}><Pressable accessibilityLabel="Close" style={{ flex: 1 }} onPress={close} /></Animated.View>
    <Animated.View accessibilityViewIsModal entering={SlideInDown.duration(260)} style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.handle, { backgroundColor: colors.handle }]} />
      <View style={[ui.row, { marginTop: 26 }]}><View style={{ flex: 1 }}><Label size={28} weight={600} lines={1}>{title}</Label></View><Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={close} style={ui.iconButton}><Feather name="x" size={28} color={colors.muted} /></Pressable></View>
      {typeof subtitle === 'string' ? <View style={{ marginTop: 18 }}><Label muted size={16}>{subtitle}</Label></View> : subtitle}
      {children}
    </Animated.View>
  </View>;
}
export function SheetRow({ title, icon, onPress, danger = false, last = false }: { title: string; icon: GlyphName; onPress: () => void; danger?: boolean; last?: boolean }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [ui.row, { gap: 14, opacity: pressed ? 0.75 : 1 }]}>
    <View style={[styles.tile, { backgroundColor: danger ? colors.dangerTint : colors.raised }]}><Feather name={icon} size={20} color={danger ? colors.danger : colors.link} /></View>
    <View style={[styles.rowBody, !last && { borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: colors.separator }]}><View style={{ flex: 1 }}><Label size={17} weight={500} color={danger ? colors.danger : colors.text}>{title}</Label></View><Feather name="chevron-right" size={22} color={colors.muted} /></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingHorizontal: GUTTER, width: '100%', maxWidth: 620, alignSelf: 'center' },
  handle: { alignSelf: 'center', width: 52, height: 4, borderRadius: 2, marginTop: 12 },
  tile: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
