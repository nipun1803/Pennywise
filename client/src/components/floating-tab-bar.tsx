import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Label } from '@/components/ui/app-ui';
import { useApp } from '@/providers/app-provider';

// expo-router's tab bar receives an emitter and navigateToTab rather than a navigation object.
type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

function TabIcon({ route, active, color }: { route: string; active: boolean; color: string }) {
  if (route === 'home') return <Ionicons name={active ? 'home' : 'home-outline'} size={25} color={color} />;
  if (route === 'groups') return <Feather name="users" size={25} color={color} />;
  if (route === 'activity') return <MaterialCommunityIcons name="history" size={27} color={color} />;
  return <Feather name="pie-chart" size={25} color={color} />;
}

// Keep every icon inside the pill so the selected tab cannot be clipped.
export function FloatingTabBar({ state, descriptors, emitter, navigateToTab }: TabBarProps) {
  const { colors, dark } = useApp(); const insets = useSafeAreaInsets();
  return <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 10) + 4 }]}>
    <View testID="floating-tab-bar" accessibilityRole="tablist" style={[styles.bar, { backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOpacity: dark ? 0.35 : 0.1 }]}>
      {state.routes.map((route, index) => {
        const active = state.index === index; const title = descriptors[route.key].options.title ?? route.name;
        const press = () => { const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }); if (!active && !event.defaultPrevented) navigateToTab(route.key); };
        return <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={title} accessibilityState={{ selected: active }} onPress={press} onLongPress={() => emitter.emit({ type: 'tabLongPress', target: route.key })} style={styles.item}>
          <View testID={`tab-icon-${route.name}`} style={[styles.icon, active && { backgroundColor: colors.primary }]}><TabIcon route={route.name} active={active} color={active ? colors.onPrimary : colors.muted} /></View>
          <Label size={14} weight={active ? 600 : 400} color={active ? colors.link : colors.muted}>{title}</Label>
        </Pressable>;
      })}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 20, right: 20, alignItems: 'center' },
  bar: { flexDirection: 'row', width: '100%', maxWidth: 580, minHeight: 84, borderRadius: 32, paddingHorizontal: 8, paddingVertical: 10, shadowOffset: { width: 0, height: 8 }, shadowRadius: 24, elevation: 10, overflow: 'visible' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, overflow: 'visible' },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
