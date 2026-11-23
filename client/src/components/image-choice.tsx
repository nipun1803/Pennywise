import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AvatarBadge, Button, Chips, Glyph, Label, Notice, styles } from '@/components/ui/app-ui';
import { errorMessage } from '@/lib/api';
import { uploadPhoto } from '@/lib/photos';
import type { Accent, Avatar as AvatarKind } from '@/lib/types';
import { PhotoCrop, type CropSource } from '@/components/photo-crop';
import { useApp } from '@/providers/app-provider';

type PhotoAction = 'camera' | 'gallery' | 'remove';
type AvatarSelection = { image: string | null } | { avatar: AvatarKind };
const avatarOptions: { value: AvatarKind; label: string }[] = [{ value: 'initials', label: 'Initials' }, { value: 'leaf', label: 'Leaf' }, { value: 'sun', label: 'Sun' }, { value: 'sparkles', label: 'Sparkles' }, { value: 'coffee', label: 'Coffee' }];
const groupOptions = [{ value: '', label: 'Initials' }, { value: 'preset:people', label: 'Friends' }, { value: 'preset:airplane', label: 'Trip' }, { value: 'preset:home', label: 'Home' }, { value: 'preset:restaurant', label: 'Food' }, { value: 'preset:briefcase', label: 'Work' }, { value: 'preset:heart', label: 'Family' }];

// Existing records persist on Done. New groups use onChange for a local draft.
export function ImageChoice({ name, value, avatar = 'initials', onChange, onSave, onAvatarSave, disabled, onBusy, color, saveLabel = 'Create group' }: { name: string; value?: string | null; avatar?: AvatarKind; onChange?: (image: string | null) => void; onSave?: (image: string | null) => Promise<void>; onAvatarSave?: (avatar: AvatarKind) => Promise<void>; disabled?: boolean; onBusy?: (busy: boolean) => void; color?: Accent; saveLabel?: string }) {
  const { colors } = useApp();
  const [phase, setPhase] = useState<'idle' | 'picking' | 'saving'>('idle'); const [error, setError] = useState(''); const lock = useRef(false);
  const [menu, setMenu] = useState(false); const menuAction = useRef<PhotoAction | null>(null);
  const [pending, setPending] = useState<AvatarSelection | null>(null);
  const [source, setSource] = useState<CropSource | null>(null);
  const busy = phase !== 'idle';
  const commit = async (selection: AvatarSelection) => {
    if (lock.current || disabled) return;
    lock.current = true; setSource(null); setPhase('saving'); onBusy?.(true); setError(''); setPending(selection);
    try {
      if ('avatar' in selection) await onAvatarSave?.(selection.avatar);
      else if (onSave) {
        const uploaded = await uploadPhoto(selection.image);
        // Retry the record update with this URL if it fails; do not upload twice.
        setPending({ image: uploaded });
        await onSave(uploaded);
      } else onChange?.(selection.image);
      setPending(null);
    } catch (error) { setError(errorMessage(error)); }
    finally { lock.current = false; setPhase('idle'); onBusy?.(false); }
  };
  const pick = async (camera: boolean) => {
    if (lock.current || disabled || source) return;
    lock.current = true; setPhase('picking'); onBusy?.(true); setError(''); setPending(null);
    let cropping = false;
    try {
      if (camera && Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error('Camera access is needed to take a photo. Enable it in your device settings, or choose a photo from your device.');
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1 };
      const result = await (camera ? ImagePicker.launchCameraAsync(options) : ImagePicker.launchImageLibraryAsync(options));
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset?.uri) throw new Error('The photo could not be opened. Try another image.');
      // Normalize orientation/format and downsample before editing camera-sized images.
      const rendered = await ImageManipulator.manipulate(asset.uri, { maxWidth: 2048, maxHeight: 2048 }).renderAsync();
      const normalized = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
      if (!normalized.width || !normalized.height) throw new Error('The photo could not be opened. Try another image.');
      setSource(normalized); cropping = true;
    } catch (error) { setError(errorMessage(error)); }
    finally { lock.current = false; setPhase('idle'); if (!cropping) onBusy?.(false); }
  };
  const closeCrop = () => { setSource(null); onBusy?.(false); };
  const runMenuAction = () => {
    const action = menuAction.current; menuAction.current = null;
    if (action === 'remove') void commit({ image: null });
    else if (action) void pick(action === 'camera');
  };
  const dismissMenu = (action: PhotoAction | null = null) => {
    menuAction.current = action; setMenu(false);
    // iOS must finish dismissing our modal before presenting the native picker.
    // Web must launch it directly from this press to preserve user activation.
    if (Platform.OS !== 'ios') runMenuAction();
  };
  return <View style={{ gap: 14 }}><View style={{ alignItems: 'center', gap: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Change photo" accessibilityHint="Take a photo, choose from gallery, or remove the photo" accessibilityState={{ disabled: !!disabled || busy || !!source, busy }} disabled={disabled || busy || !!source} onPress={() => setMenu(true)} style={{ padding: 4 }}>
      <AvatarBadge name={name || 'New group'} avatar={avatar} image={value} color={color} size={88} />
      {busy ? <View style={{ position: 'absolute', inset: 4, borderRadius: 44, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#FFFFFF" /></View>
        : <View style={{ position: 'absolute', bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.background, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Glyph name="camera" color={colors.onPrimary} size={17} /></View>}
    </Pressable>
    <View accessibilityLiveRegion="polite"><Label muted size={13}>{phase === 'saving' ? pending && ('avatar' in pending || pending.image?.startsWith('preset:')) ? 'Saving avatar…' : pending && 'image' in pending && pending.image === null ? 'Removing photo…' : 'Saving photo…' : phase === 'picking' ? 'Opening photo…' : 'Tap to change photo'}</Label></View>
  </View>
    <View style={{ gap: 10 }}><Label bold>{onAvatarSave ? 'Avatar' : 'Preset avatar'}</Label><Label muted size={13}>Choose a built-in avatar instead of a photo. No upload needed.</Label>
      {onAvatarSave ? <Chips<AvatarKind | ''> disabled={!!disabled || busy || !!source} value={value ? '' : avatar} options={avatarOptions} onChange={avatar => { if (avatar) void commit({ avatar }); }} />
        : <Chips disabled={!!disabled || busy || !!source} value={value ?? ''} options={groupOptions} onChange={image => { void commit({ image: image || null }); }} />}
    </View>
    {!onSave && value?.startsWith('data:') && <Label muted size={13} align="center">Photo selected. It will save when you tap {saveLabel}.</Label>}
    {!!error && <Notice text={error} error />}
    {!!error && pending && <Button title="Retry" secondary disabled={disabled || busy || !!source} onPress={() => void commit(pending)} />}
    <Modal testID="photo-menu" visible={menu} transparent animationType="fade" onDismiss={runMenuAction} onRequestClose={() => dismissMenu()}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo menu" onPress={() => dismissMenu()} style={{ flex: 1 }} />
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
          <ScrollView contentContainerStyle={[styles.footer, { paddingTop: 22, gap: 12 }]}>
            <Label size={22} bold align="center">Change photo</Label>
            <Button title="Take photo" icon="camera-outline" secondary disabled={disabled || busy} onPress={() => dismissMenu('camera')} />
            <Button title="Choose from gallery" icon="images-outline" secondary disabled={disabled || busy} onPress={() => dismissMenu('gallery')} />
            <Button title="Remove photo" icon="trash-outline" secondary danger disabled={!value || disabled || busy} onPress={() => dismissMenu('remove')} />
            <Button title="Cancel" secondary onPress={() => dismissMenu()} />
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
    {source && <PhotoCrop source={source} disabled={disabled} onCancel={closeCrop} onDone={image => { void commit({ image }); }} />}
  </View>;
}
