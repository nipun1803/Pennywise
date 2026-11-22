import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ComponentProps, type PropsWithChildren, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApp } from '@/providers/app-provider';
import { avatarIcons, avatarTones, fonts } from '@/theme/palette';
import { initials } from '@/lib/format';
import type { Accent, Avatar as AvatarKind, Group, Pagination } from '@/lib/types';

export const GUTTER = 28;
// Leaves room for the floating tab bar on tab screens.
export const TAB_BAR_SPACE = 118;
export type IconName = ComponentProps<typeof Ionicons>['name'];
export type GlyphName = ComponentProps<typeof Feather>['name'];
type Weight = keyof typeof fonts;
export const font = (weight: Weight = 400): TextStyle => ({ fontFamily: fonts[weight] });

// API category icons → Feather line icons used in expense rows.
const categoryGlyphs: Record<string, GlyphName> = { food: 'coffee', cart: 'shopping-cart', bus: 'navigation', home: 'home', bulb: 'zap', bag: 'shopping-bag', game: 'film', airplane: 'send', heart: 'heart', grid: 'grid' };
export const categoryGlyph = (icon?: string | null): GlyphName => (icon && categoryGlyphs[icon]) || 'file-text';
export function Icon({ name, color, size = 22 }: { name: IconName; color?: ComponentProps<typeof Ionicons>['color']; size?: number }) { const { colors } = useApp(); return <Ionicons name={name} size={size} color={color ?? colors.text} />; }
// Line icons in the screenshots use Feather's 2px rounded stroke.
export function Glyph({ name, color, size = 22 }: { name: GlyphName; color?: string; size?: number }) { const { colors } = useApp(); return <Feather name={name} size={size} color={color ?? colors.text} />; }
export function Label({ children, muted = false, size = 15, bold = false, weight, color, align, lines, fit = false }: PropsWithChildren<{ muted?: boolean; size?: number; bold?: boolean; weight?: Weight; color?: string; align?: TextStyle['textAlign']; lines?: number; fit?: boolean }>) {
  const { colors } = useApp(); const display = size >= 22;
  return <Text numberOfLines={fit ? 1 : lines} adjustsFontSizeToFit={fit} minimumFontScale={0.6} style={[font(weight ?? (bold ? 700 : 400)), { color: color ?? (muted ? colors.muted : colors.text), fontSize: size, lineHeight: Math.round(size * (display ? 1.16 : 1.42)), letterSpacing: display ? -size * 0.03 : 0, textAlign: align }]}>{children}</Text>;
}
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => { const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true)); const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false)); return () => { show.remove(); hide.remove(); }; }, []);
  return open;
}
export function Screen({ children, refreshing = false, onRefresh, footer, tabs = false, center = false }: PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void; footer?: ReactNode; tabs?: boolean; center?: boolean }>) {
  const { colors, offline, message } = useApp(); const keyboardOpen = useKeyboardOpen();
  // Show the spinner only for a pull, not for the background reload each screen does on focus.
  const [pulled, setPulled] = useState(false); const started = useRef(false);
  useEffect(() => {
    if (!pulled) return;
    if (refreshing) { started.current = true; return; }
    if (started.current) { started.current = false; setPulled(false); return; }
    const timer = setTimeout(() => setPulled(false), 1500); return () => clearTimeout(timer);
  }, [pulled, refreshing]);
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={tabs ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
    <ScrollView keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={pulled} onRefresh={() => { setPulled(true); onRefresh(); }} tintColor={colors.primary} colors={[colors.primary]} /> : undefined} contentContainerStyle={[styles.screen, tabs && { paddingBottom: TAB_BAR_SPACE }, center && { justifyContent: 'center' }]}>
      {offline && <Notice text="You're offline. Showing saved data where available. Changes are disabled." />}
      {!!message && <Notice text={message} />}
      {children}
    </ScrollView>
    {/* The pinned footer steps aside while typing so it never covers the focused field. */}
    {footer && !keyboardOpen && <View style={styles.footer}>{footer}</View>}
  </KeyboardAvoidingView></SafeAreaView>;
}
export function BackButton({ onPress, onMedia = false }: { onPress?: () => void; onMedia?: boolean }) {
  const { colors } = useApp();
  return <Pressable accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} onPress={onPress ?? (() => router.canGoBack() ? router.back() : router.replace('/home'))} style={[styles.iconButton, onMedia && { borderRadius: 22, backgroundColor: 'rgba(0, 0, 0, 0.45)' }]}><Glyph name="arrow-left" size={26} color={onMedia ? '#FFFFFF' : colors.muted} /></Pressable>;
}
export function Header({ title, subtitle, back = false, action }: { title: string; subtitle?: string; back?: boolean; action?: ReactNode }) {
  if (back) return <View style={{ gap: 10 }}><View style={[styles.row, { gap: 18, marginLeft: -10 }]}><BackButton /><View style={{ flex: 1 }}><Label size={26} weight={600} lines={1}>{title}</Label></View>{action}</View>{!!subtitle && <Label muted size={16}>{subtitle}</Label>}</View>;
  return <View style={[styles.row, { alignItems: 'flex-start' }]}><View style={{ flex: 1, gap: 12 }}><Label size={34} bold>{title}</Label>{!!subtitle && <Label muted size={16}>{subtitle}</Label>}</View>{action}</View>;
}
// Pennywise mark: a rounded stem with a coin-like ring for the bowl of the "P".
function LogoP({ size }: { size: number }) {
  const stroke = size * 0.15;
  return <View style={{ width: size * 0.5, height: size * 0.6 }}>
    <View style={{ position: 'absolute', left: 0, top: 0, width: stroke, height: size * 0.6, borderRadius: stroke, backgroundColor: '#FFFFFF' }} />
    <View style={{ position: 'absolute', left: 0, top: 0, width: size * 0.5, height: size * 0.4, borderRadius: size * 0.2, borderWidth: stroke, borderColor: '#FFFFFF' }} />
  </View>;
}
export function Brand({ size = 22 }: { size?: number }) {
  const { colors, dark } = useApp(); const mark = Math.round(size * 1.45);
  return <View accessibilityRole="header" accessibilityLabel="Pennywise" style={[styles.row, { gap: 11 }]}>
    <View style={{ width: mark, height: mark, borderRadius: mark * 0.24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
      <LogoP size={mark} />
    </View>
    <Text style={[font(500), { fontSize: size, letterSpacing: -size * 0.03, color: colors.text }]}>Penny<Text style={{ color: dark ? colors.link : colors.primary }}>wise</Text></Text>
  </View>;
}
export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) { const { colors } = useApp(); return <View style={[styles.card, { backgroundColor: colors.surface }, style]}>{children}</View>; }
export function Button({ title, onPress, secondary = false, disabled = false, busy = false, icon, trailing, danger = false, compact = false }: { title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; busy?: boolean; icon?: IconName; trailing?: GlyphName; danger?: boolean; compact?: boolean }) {
  const { colors } = useApp(); const off = disabled && !busy;
  const foreground = off ? colors.onDisabled : secondary ? (danger ? colors.danger : colors.link) : colors.onPrimary;
  const background = off ? colors.disabled : secondary ? (danger ? colors.dangerTint : colors.tint) : danger ? colors.danger : colors.primary;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: disabled || busy, busy }} onPress={onPress} disabled={disabled || busy} style={({ pressed }) => [styles.button, compact && { alignSelf: 'center', paddingHorizontal: 36 }, { backgroundColor: background, opacity: pressed ? 0.85 : 1 }]}>
    {busy ? <ActivityIndicator color={foreground} /> : icon && <Icon name={icon} color={foreground} size={20} />}<Label size={17} weight={600} color={foreground}>{title}</Label>
    {trailing && <View style={styles.trailing}><Glyph name={trailing} size={26} color={foreground} /></View>}
  </Pressable>;
}
export function Field({ label, hint, error, trailing, ...props }: TextInputProps & { label: string; hint?: string; error?: string; trailing?: ReactNode }) {
  const { colors } = useApp(); const [focused, setFocused] = useState(false);
  return <View style={{ gap: 12 }}><Label weight={600} size={15}>{label}</Label>
    <View style={[styles.input, { backgroundColor: colors.surface, borderColor: error ? colors.danger : focused ? colors.link : colors.border }, props.multiline && { minHeight: 104, alignItems: 'flex-start' }]}>
      <TextInput accessibilityLabel={label} accessibilityHint={error} placeholderTextColor={colors.muted} {...props} onFocus={event => { setFocused(true); props.onFocus?.(event); }} onBlur={event => { setFocused(false); props.onBlur?.(event); }} style={[font(400), styles.inputText, { color: colors.text }, props.multiline && { minHeight: 80, textAlignVertical: 'top' }, props.style]} />
      {trailing}
    </View>
    {error ? <View accessibilityLiveRegion="polite"><Label size={14} color={colors.danger}>{error}</Label></View> : !!hint && <Label size={14} muted>{hint}</Label>}</View>;
}
export function PasswordField(props: TextInputProps & { label: string; hint?: string; error?: string }) {
  const { colors } = useApp(); const [visible, setVisible] = useState(false);
  return <Field {...props} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} trailing={<Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'} hitSlop={10} onPress={() => setVisible(value => !value)} style={{ paddingLeft: 10 }}><Glyph name={visible ? 'eye-off' : 'eye'} size={22} color={colors.muted} /></Pressable>} />;
}
export function Notice({ text, error = false }: { text: string; error?: boolean }) { const { colors } = useApp(); return <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: error ? colors.warningBg : colors.tint }]}><Icon name={error ? 'alert-circle-outline' : 'information-circle-outline'} color={error ? colors.warning : colors.link} size={19} /><View style={{ flex: 1 }}><Label size={14} color={error ? colors.warning : colors.text}>{text}</Label></View></View>; }
export function Empty({ title, description, children }: PropsWithChildren<{ title: string; description: string; icon?: IconName }>) { return <View style={{ paddingVertical: 36, paddingHorizontal: 8, alignItems: 'center', gap: 14 }}><Label size={26} weight={600} align="center">{title}</Label><Label muted size={16} align="center">{description}</Label>{children && <View style={{ marginTop: 14, alignSelf: 'stretch' }}>{children}</View>}</View>; }
export function Skeletons({ count = 3 }: { count?: number }) { const { colors } = useApp(); return <View accessibilityLabel="Loading" style={{ gap: 12 }}>{Array.from({ length: count }, (_, i) => <Card key={i}><View style={{ width: '55%', height: 18, borderRadius: 6, backgroundColor: colors.skeleton }} /><View style={{ width: '30%', height: 12, borderRadius: 6, backgroundColor: colors.skeleton }} /></Card>)}</View>; }
export function ResourceError({ message, retry }: { message: string; retry: () => void }) { const { offline } = useApp(); return <View style={{ gap: 10 }}><Notice text={message} error /><Button title="Try again" secondary onPress={retry} disabled={offline} /></View>; }
const toneFor = (color?: Accent) => color === 'emerald' ? 'emerald' : color === 'amber' ? 'amber' : color === 'blue' ? 'blue' : color === 'rose' ? 'rose' : 'violet';
export function Avatar({ name, color, size = 44, label, image }: { name: string; color?: Accent; size?: number; label?: string; image?: string | null }) {
  const { dark } = useApp(); const [background, foreground] = avatarTones[dark ? 'dark' : 'light'][toneFor(color)];
  const [failed, setFailed] = useState<string | null>(null);
  const presets: Record<string, IconName> = { people: 'people-outline', airplane: 'airplane-outline', home: 'home-outline', restaurant: 'restaurant-outline', briefcase: 'briefcase-outline', heart: 'heart-outline' };
  if (image?.startsWith('preset:') && presets[image.slice(7)]) return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}><Icon name={presets[image.slice(7)]} color={foreground} size={size * 0.48} /></View>;
  if (image && image !== failed) return <Image source={{ uri: image }} accessibilityLabel={`${name} photo`} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" onError={() => setFailed(image)} />;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}><Label size={Math.round(size * 0.36)} weight={600} color={foreground}>{label ?? initials(name)}</Label></View>;
}
export function GroupCard({ group, subtitle, onPress }: { group: Group; subtitle?: string; onPress: () => void }) {
  const members = `${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${group.name}, ${members}`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}><Card style={{ paddingVertical: 16 }}><View style={[styles.row, { gap: 16 }]}><Avatar name={group.name} color={group.color} image={group.image} /><View style={{ flex: 1, gap: 4 }}><Label weight={600} size={16} lines={1}>{group.name}</Label><Label muted size={14} lines={1}>{subtitle ? `${members} · ${subtitle}` : members}</Label></View></View></Card></Pressable>;
}
export function AvatarBadge({ name, avatar = 'initials', color, size = 44, image }: { name: string; avatar?: AvatarKind; color?: Accent; size?: number; image?: string | null }) {
  const { dark } = useApp(); const [background, foreground] = avatarTones[dark ? 'dark' : 'light'][toneFor(color)];
  if (image || avatar === 'initials') return <Avatar name={name} image={image} color={color} size={size} />;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}><Icon name={avatarIcons[avatar]} color={foreground} size={size * 0.48} /></View>;
}
export function Chips<T extends string>({ options, value, onChange, disabled = false }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; disabled?: boolean }) { const { colors } = useApp(); return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(option => <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: value === option.value, disabled }} disabled={disabled} onPress={() => onChange(option.value)} style={[styles.chip, { backgroundColor: value === option.value ? colors.primary : colors.tint }]}><Label size={14} weight={600} color={value === option.value ? colors.onPrimary : colors.link}>{option.label}</Label></Pressable>)}</View>; }
// Underlined text tabs from the group and activity screens; `inset` narrows the indicator.
export function Tabs<T extends string>({ options, value, onChange, inset = false }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; inset?: boolean }) {
  const { colors } = useApp();
  return <View accessibilityRole="tablist" style={{ flexDirection: 'row' }}>{options.map(option => { const active = option.value === value; return <Pressable key={option.value} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(option.value)} style={{ flex: 1, alignItems: 'center' }}>
    <View style={{ paddingVertical: 12 }}><Label size={16} weight={active ? 600 : 400} color={active ? colors.link : colors.muted}>{option.label}</Label></View>
    <View style={{ height: 3, borderRadius: 2, alignSelf: 'stretch', marginHorizontal: inset ? 13 : 0, marginTop: 4, backgroundColor: active ? colors.link : 'transparent' }} />
  </Pressable>; })}</View>;
}
// Two-column figure card used for group totals and reports.
export function SummaryCard({ items }: { items: { label: string; value: string; caption: string; tone?: string }[] }) {
  const { colors } = useApp();
  return <View style={[styles.summary, { backgroundColor: colors.raised }]}>{items.map((item, i) => <View key={item.label} style={[{ flex: 1, gap: 10, paddingVertical: 2 }, i > 0 && { borderLeftWidth: 1, borderLeftColor: colors.border, paddingLeft: 18 }]}>
    <Label muted size={15}>{item.label}</Label><Label size={30} bold fit>{item.value}</Label><Label size={15} weight={i > 0 ? 600 : 400} color={item.tone ?? colors.muted}>{item.caption}</Label>
  </View>)}</View>;
}
export function Pager({ pagination, onPage, disabled = false }: { pagination?: Pagination; onPage: (page: number) => void; disabled?: boolean }) { if (!pagination || pagination.totalPages <= 1) return null; return <View style={{ gap: 10 }}><Label muted size={12}>Page {pagination.page} of {pagination.totalPages} · {pagination.total} total</Label><View style={styles.row}><View style={{ flex: 1 }}><Button secondary title="Previous" disabled={disabled || pagination.page <= 1} onPress={() => onPage(pagination.page - 1)} /></View><View style={{ flex: 1 }}><Button secondary title="Next" disabled={disabled || pagination.page >= pagination.totalPages} onPress={() => onPage(pagination.page + 1)} /></View></View></View>; }
export const styles = StyleSheet.create({ screen: { paddingHorizontal: GUTTER, paddingTop: 16, paddingBottom: 32, gap: 24, width: '100%', maxWidth: 620, alignSelf: 'center', flexGrow: 1 }, footer: { paddingHorizontal: GUTTER, paddingBottom: 14, paddingTop: 8, width: '100%', maxWidth: 620, alignSelf: 'center' }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, card: { padding: 18, borderRadius: 22, gap: 14 }, summary: { flexDirection: 'row', borderRadius: 26, paddingVertical: 24, paddingHorizontal: 18, gap: 18 }, button: { minHeight: 54, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, trailing: { position: 'absolute', right: 22 }, input: { borderWidth: 1, borderRadius: 18, minHeight: 56, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center' }, inputText: { flex: 1, fontSize: 17, paddingVertical: 14 }, notice: { borderRadius: 16, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, iconBox: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, chip: { minHeight: 40, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, justifyContent: 'center' } });
