import Feather from '@expo/vector-icons/Feather';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Avatar, Field, Label, font, styles } from '@/components/ui/app-ui';
import type { Accent } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
import { ImageChoice } from '@/components/image-choice';

export interface GroupDraft { name: string; description: string; image?: string | null }
// Still used by category editing; profile avatar color selection has been removed.
export const accentOptions: { value: Accent; label: string }[] = [{ value: 'emerald', label: 'Emerald' }, { value: 'blue', label: 'Blue' }, { value: 'amber', label: 'Amber' }, { value: 'violet', label: 'Violet' }, { value: 'rose', label: 'Rose' }];

// Illustration on a themed panel; panel bounds are fractions of the image height.
export function IllustrationPanel({ source, ratio, top, bottom, label }: { source: number; ratio: number; top: string; bottom: string; label: string }) {
  const { colors } = useApp();
  return <View style={{ width: '100%', aspectRatio: ratio }}>
    <View style={{ position: 'absolute', top: top as `${number}%`, bottom: bottom as `${number}%`, left: 0, right: 0, borderRadius: 28, backgroundColor: colors.raised }} />
    <Image source={source} style={{ width: '100%', height: '100%' }} contentFit="contain" accessibilityLabel={label} />
  </View>;
}

// Shared by New group and Edit group: name with monogram, fixed INR currency, optional description.
export function GroupDetailsForm({ value, onChange, color = 'violet', disabled = false, photoDisabled = disabled, photoReadOnly = false, saveLabel, onBusy, onPhotoSave, formAction }: { value: GroupDraft; onChange: (value: GroupDraft) => void; color?: Accent; disabled?: boolean; photoDisabled?: boolean; photoReadOnly?: boolean; saveLabel?: string; onBusy?: (busy: boolean) => void; onPhotoSave?: (image: string | null) => Promise<void>; formAction?: React.ReactNode }) {
  const { colors, notify } = useApp(); const [focused, setFocused] = useState(false); const [describing, setDescribing] = useState(!!value.description);
  return <View style={{ gap: 24 }}>
    {photoReadOnly ? <View style={{ alignItems: 'center' }}><Avatar name={value.name} image={value.image} color={color} size={88} /></View>
      : <ImageChoice name={value.name} value={value.image} color={color} saveLabel={saveLabel} onChange={image => onChange({ ...value, image })} onSave={onPhotoSave} disabled={photoDisabled} onBusy={onBusy} />}
    <View style={{ gap: 12 }}><Label weight={600} size={15}>Group name</Label>
      <View style={[styles.row, { gap: 12 }]}><Avatar name={value.name.trim() || 'New group'} color={color} image={value.image} size={48} />
        <View style={[styles.input, { flex: 1, backgroundColor: colors.surface, borderColor: focused ? colors.link : colors.border }]}><TextInput accessibilityLabel="Group name" placeholder="e.g. Weekend plans" placeholderTextColor={colors.muted} value={value.name} onChangeText={name => onChange({ ...value, name })} maxLength={80} editable={!disabled} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[font(400), styles.inputText, { color: colors.text }]} /></View>
      </View>
    </View>
    <View style={{ gap: 12 }}><Label weight={600} size={15}>Currency</Label>
      <Pressable accessibilityRole="button" accessibilityLabel="Currency, Indian Rupee" onPress={() => notify('Pennywise groups use Indian Rupee (INR).')} style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, gap: 12 }]}><View style={{ flex: 1 }}><Label size={17}>Indian Rupee</Label></View><Label muted size={15} weight={500}>INR</Label><Feather name="chevron-right" size={24} color={colors.muted} /></Pressable>
    </View>
    {describing ? <Field label="Description" placeholder="What brings this group together?" value={value.description} onChangeText={description => onChange({ ...value, description })} maxLength={200} multiline autoFocus={!value.description} hint={`${value.description.length}/200 characters`} editable={!disabled} />
      : <Pressable accessibilityRole="button" disabled={disabled} onPress={() => setDescribing(true)} style={[styles.row, { minHeight: 44 }]}><Feather name="plus" size={26} color={colors.link} /><View style={{ flex: 1 }}><Label size={17} weight={600} color={colors.link}>Add a description</Label></View><Label muted size={15}>Optional</Label></Pressable>}
    {formAction}
  </View>;
}
