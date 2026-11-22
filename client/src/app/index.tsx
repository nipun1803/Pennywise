import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Brand, Button, GUTTER, Label } from '@/components/ui/app-ui';
import { formatAmount } from '@/lib/format';
import type { Accent } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
import { illustrations } from '@/theme/illustrations';

const slides = [
  { title: 'Your people.\nOne shared place.', body: 'Trips, flatmates, or everyday plans.\nKeep your shared expenses together.' },
  { title: 'One bill.\nFair shares.', body: 'Choose who’s included. Split evenly\nor adjust each person’s share.' },
  { title: 'Settle up.\nStay friends.', body: 'See who owes whom and record payments.\nEveryone stays on the same page.' },
];
const people: { name: string; color: Accent; even: number; custom: number }[] = [
  { name: 'You', color: 'violet', even: 50000, custom: 60000 }, { name: 'Jamie', color: 'emerald', even: 50000, custom: 50000 }, { name: 'Sam', color: 'amber', even: 50000, custom: 40000 },
];

function SplitExample() {
  const { colors } = useApp(); const [custom, setCustom] = useState(false);
  return <View style={[styles.example, { backgroundColor: colors.surface }]}>
    <Label muted size={15} weight={500}>Example · Lunch together</Label>
    <View style={{ marginTop: 8 }}><Label size={34} bold>{formatAmount(150000)}</Label></View>
    <View accessibilityRole="tablist" style={[styles.segment, { backgroundColor: colors.segment }]}>{[false, true].map(option => <Pressable key={String(option)} accessibilityRole="tab" accessibilityState={{ selected: custom === option }} onPress={() => setCustom(option)} style={[styles.segmentItem, custom === option && { backgroundColor: colors.background }]}>
      <Label size={16} weight={600} color={custom === option ? colors.link : colors.muted}>{option ? 'Custom' : 'Evenly'}</Label>
    </Pressable>)}</View>
    <View style={{ gap: 11, marginTop: 16 }}>{people.map(person => <View key={person.name} style={styles.person}><Avatar name={person.name} label={person.name[0]} color={person.color} size={32} /><View style={{ flex: 1 }}><Label size={17} weight={500}>{person.name}</Label></View><Label size={17} weight={600}>{formatAmount(custom ? person.custom : person.even)}</Label></View>)}</View>
  </View>;
}
function SettleExample() {
  const { colors } = useApp(); const [paid, setPaid] = useState(false);
  return <View style={[styles.example, { backgroundColor: colors.surface }]}>
    <Label muted size={15} weight={500}>Example · Weekend plans</Label>
    <View style={[styles.person, { marginTop: 20 }]}>
      <View style={styles.party}><Avatar name="You" label="Y" color="violet" size={48} /><Label size={16} weight={500}>You</Label></View>
      <View style={styles.arrow}><View style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.muted, opacity: 0.6 }} /><Feather name="chevron-right" size={22} color={colors.muted} style={{ marginLeft: -12, opacity: 0.8 }} /></View>
      <View style={[styles.party, { alignItems: 'flex-end' }]}><Avatar name="Jamie" label="J" color="emerald" size={48} /><Label size={16} weight={500}>Jamie</Label></View>
    </View>
    <View style={{ marginTop: 18, gap: 4 }}><Label size={34} bold>{formatAmount(paid ? 0 : 75000)}</Label><Label muted size={16}>{paid ? 'You and Jamie are settled up' : 'You owe Jamie'}</Label></View>
    <Pressable accessibilityRole="button" onPress={() => setPaid(value => !value)} style={({ pressed }) => [styles.tryButton, { backgroundColor: colors.tint, opacity: pressed ? 0.85 : 1 }]}><Label size={16} weight={600} color={colors.link}>{paid ? 'Undo payment' : 'Try recording a payment'}</Label></Pressable>
  </View>;
}

const AUTO_ADVANCE_MS = 4500;
export default function Welcome() {
  const { colors } = useApp(); const [index, setIndex] = useState(0); const [width, setWidth] = useState(0);
  const [touched, setTouched] = useState(0); const [reduceMotion, setReduceMotion] = useState(false);
  const pager = useRef<ScrollViewInstance>(null);
  const last = index === slides.length - 1;
  const go = (next: number) => { const target = Math.max(0, Math.min(slides.length - 1, next)); setIndex(target); pager.current?.scrollTo({ x: target * width, animated: !reduceMotion }); };
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion); const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion); return () => sub.remove(); }, []);
  // Advance on a timer until the last slide; any touch or slide change restarts the wait.
  useEffect(() => {
    if (last || reduceMotion || !width) return;
    const timer = setTimeout(() => { const next = index + 1; setIndex(next); pager.current?.scrollTo({ x: next * width, animated: true }); }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [index, last, reduceMotion, width, touched]);
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={styles.page}>
      <View style={[styles.top, styles.gutter]}><Brand /><Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.push('/signup')}><Label size={17} weight={600} color={colors.link}>Skip</Label></Pressable></View>
      <View style={{ flex: 1 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
        <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onTouchStart={() => setTouched(value => value + 1)} onMomentumScrollEnd={event => { if (width) setIndex(Math.round(event.nativeEvent.contentOffset.x / width)); }}>
          {slides.map((slide, i) => <View key={slide.title} style={[styles.gutter, { width }]} accessibilityElementsHidden={i !== index} importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}>
            <View style={styles.stage}>{i === 0 ? <View style={[styles.hero, { backgroundColor: colors.raised }]}><Image source={illustrations.team.source} style={{ width: '100%', height: '100%' }} contentFit="contain" accessibilityLabel="Two friends standing back to back" /></View> : i === 1 ? <SplitExample /> : <SettleExample />}</View>
            <View style={{ gap: 15, marginTop: 9 + 44 + 17 }}><Label size={36} bold>{slide.title}</Label><Label muted size={16}>{slide.body}</Label></View>
          </View>)}
        </ScrollView>
        <View style={[styles.dots, styles.gutter]}>
          {slides.map((_, i) => <Pressable key={i} accessibilityRole="button" accessibilityLabel={`Go to step ${i + 1}`} accessibilityState={{ selected: i === index }} onPress={() => go(i)} style={styles.dotSlot}><View style={[styles.dot, { backgroundColor: i === index ? colors.link : colors.muted }, i === index && styles.dotActive]} /></Pressable>)}
          <View style={{ flex: 1 }} />
          {index > 0 && <Pressable accessibilityRole="button" hitSlop={12} onPress={() => go(index - 1)} style={{ marginRight: 30 }}><Label size={17} weight={600} color={colors.link}>Back</Label></Pressable>}
          <Label muted size={15}>{index + 1} of {slides.length}</Label>
        </View>
      </View>
      <View style={styles.gutter}><Button title={last ? 'Get started' : 'Continue'} trailing="arrow-right" onPress={() => last ? router.push('/signup') : go(index + 1)} /></View>
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 19, paddingBottom: 14, width: '100%', maxWidth: 620, alignSelf: 'center' },
  gutter: { paddingHorizontal: GUTTER },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stage: { height: 318, marginTop: 30, justifyContent: 'flex-end' },
  hero: { flex: 1, borderRadius: 28, overflow: 'hidden', paddingTop: 20, paddingHorizontal: 8 },
  example: { height: 306, borderRadius: 28, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 20 },
  segment: { flexDirection: 'row', borderRadius: 16, padding: 4, marginTop: 14, height: 44 },
  segmentItem: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  party: { gap: 10, alignItems: 'flex-start' },
  arrow: { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: 22, marginTop: -30 },
  tryButton: { height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  dots: { position: 'absolute', left: 0, right: 0, top: 30 + 318 + 9, flexDirection: 'row', alignItems: 'center', height: 44 },
  dotSlot: { width: 44, height: 44, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 20 },
});
