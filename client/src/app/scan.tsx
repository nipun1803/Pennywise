import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackButton, Button, GUTTER, Label, Notice } from '@/components/ui/app-ui';
import { codeFromScan } from '@/lib/invite';
import { useApp } from '@/providers/app-provider';

// Reads a group QR (invite link or bare code) and hands the code to the Join screen.
export default function Scan() {
  const { colors } = useApp(); const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState(''); const handled = useRef(false);
  const onScan = (data: string) => {
    if (handled.current) return;
    const code = codeFromScan(data);
    if (!code) { setError('That QR isn’t a Pennywise group code.'); return; }
    handled.current = true;
    router.replace({ pathname: '/join', params: { code } });
  };
  if (!permission?.granted) return <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
    <View style={styles.pad}><BackButton onPress={() => router.back()} /></View>
    <View style={[styles.pad, { flex: 1, justifyContent: 'center', gap: 14 }]}>
      <Label size={30} bold>Scan a group QR</Label>
      <Label muted size={16}>Pennywise uses the camera only to read the code. Nothing is recorded or saved.</Label>
      <View style={{ marginTop: 16 }}>{permission && !permission.canAskAgain ? <Button title="Open settings" onPress={() => void Linking.openSettings()} /> : <Button title="Allow camera" onPress={() => void requestPermission()} />}</View>
    </View>
  </SafeAreaView>;
  return <View style={[styles.fill, { backgroundColor: '#000000' }]}>
    <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={result => onScan(result.data)} />
    <SafeAreaView style={styles.fill} pointerEvents="box-none">
      <View style={styles.pad}><BackButton onMedia onPress={() => router.back()} /></View>
      <View style={styles.frameWrap} pointerEvents="none"><View style={[styles.frame, { borderColor: colors.onPrimary }]} /></View>
      <View style={[styles.pad, { gap: 12, paddingBottom: 24 }]}>
        {!!error && <Notice text={error} error />}
        <Label size={17} weight={600} color="#FFFFFF" align="center">Point at the QR in Invite to group</Label>
      </View>
    </SafeAreaView>
  </View>;
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { paddingHorizontal: GUTTER },
  frameWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { width: 240, height: 240, borderRadius: 28, borderWidth: 3 },
});
