import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, ScrollView, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Label, Notice, styles } from '@/components/ui/app-ui';
import { errorMessage } from '@/lib/api';
import { squareCrop } from '@/lib/photos';
import { useApp } from '@/providers/app-provider';

export interface CropSource { uri: string; width: number; height: number }

interface CropTransform { zoom: number; position: { x: number; y: number } }
interface TouchFrame { x: number; y: number; distance: number; count: number }
function touchFrame(event: GestureResponderEvent): TouchFrame | null {
  const touches = event.nativeEvent.touches;
  if (!touches.length) return null;
  const [a, b] = touches;
  return b ? { x: (a.locationX + b.locationX) / 2, y: (a.locationY + b.locationY) / 2, distance: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY), count: touches.length }
    : { x: a.locationX, y: a.locationY, distance: 0, count: 1 };
}

// Keep the responder stable during a pinch; restarting it on each zoom loses touches.
function createCropPan(enabled: boolean, onMove: (previous: TouchFrame, next: TouchFrame) => void) {
  let previous: TouchFrame | null = null;
  const capture = (event: GestureResponderEvent) => { previous = touchFrame(event); };
  return PanResponder.create({
    onStartShouldSetPanResponder: () => enabled,
    onMoveShouldSetPanResponder: () => enabled,
    onPanResponderGrant: capture,
    onPanResponderStart: capture,
    onPanResponderEnd: capture,
    onPanResponderMove: event => {
      const next = touchFrame(event);
      if (enabled && previous && next && previous.count === next.count) onMove(previous, next);
      previous = next;
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderRelease: () => { previous = null; },
    onPanResponderTerminate: () => { previous = null; },
  });
}

export function PhotoCrop({ source, onDone, onCancel, disabled }: { source: CropSource; onDone: (image: string) => void; onCancel: () => void; disabled?: boolean }) {
  const { colors } = useApp(); const window = useWindowDimensions();
  const size = Math.max(1, Math.min(window.width - 56, window.height - 280, 360));
  const [transform, setTransform] = useState<CropTransform>({ zoom: 1, position: { x: 0.5, y: 0.5 } });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  const crop = squareCrop(source.width, source.height, transform.zoom, transform.position);
  const scale = size / crop.width;
  const pan = useMemo(() => createCropPan(!busy, (previous, next) => setTransform(before => {
    const oldCrop = squareCrop(source.width, source.height, before.zoom, before.position);
    const zoom = Math.max(1, Math.min(3, before.zoom * (previous.distance > 0 && next.distance > 0 ? next.distance / previous.distance : 1)));
    const side = squareCrop(source.width, source.height, zoom, before.position).width;
    const originX = oldCrop.originX + previous.x * oldCrop.width / size - next.x * side / size;
    const originY = oldCrop.originY + previous.y * oldCrop.height / size - next.y * side / size;
    const position = { x: source.width === side ? 0.5 : Math.max(0, Math.min(1, originX / (source.width - side))), y: source.height === side ? 0.5 : Math.max(0, Math.min(1, originY / (source.height - side))) };
    return { zoom, position };
  })), [busy, size, source.width, source.height]);
  const zoomBy = (amount: number) => setTransform(before => ({ ...before, zoom: Math.max(1, Math.min(3, before.zoom + amount)) }));
  const confirmPhoto = async () => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const context = ImageManipulator.manipulate(source.uri);
      context.crop(crop).resize({ width: Math.min(768, crop.width) });
      const rendered = await context.renderAsync();
      const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
      if (!result.base64 || result.base64.length + 23 > 7_000_000) throw new Error('Choose an image smaller than 5 MB.');
      onDone(`data:image/jpeg;base64,${result.base64}`);
    } catch (error) { setError(errorMessage(error)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { if (!lock.current) onCancel(); }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={[styles.screen, { alignItems: 'center' }]}>
        <Label size={26} bold>Crop photo</Label><Label muted align="center">Drag to move. Pinch to zoom.</Label>
        <View testID="photo-crop-area" {...pan.panHandlers} style={{ width: size, height: size, overflow: 'hidden', backgroundColor: colors.raised, borderRadius: 20 }}>
          <Image pointerEvents="none" source={{ uri: source.uri }} contentFit="fill" accessibilityLabel="Photo crop preview" style={{ position: 'absolute', left: -crop.originX * scale, top: -crop.originY * scale, width: source.width * scale, height: source.height * scale }} />
          <View pointerEvents="none" style={{ position: 'absolute', inset: 0, borderWidth: 2, borderRadius: size / 2, borderColor: colors.primary }} />
        </View>
        <View style={styles.row}><Button title="Zoom out" secondary disabled={busy || transform.zoom <= 1} onPress={() => zoomBy(-0.25)} /><Button title="Zoom in" secondary disabled={busy || transform.zoom >= 3} onPress={() => zoomBy(0.25)} /></View>
        {!!error && <Notice text={error} error />}
      </ScrollView>
      <View style={[styles.footer, { gap: 10 }]}><Button title={busy ? 'Preparing photo…' : 'Done'} busy={busy} disabled={disabled} onPress={() => void confirmPhoto()} /><Button title="Cancel" secondary disabled={busy} onPress={onCancel} /></View>
    </SafeAreaView>
  </Modal>;
}
