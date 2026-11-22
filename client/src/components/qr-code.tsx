import createQr from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';

// Draws the QR matrix with plain Views; each dark run in a row becomes one rectangle.
export function QrCode({ value, size, color = '#1B1A33', background = '#FFFFFF' }: { value: string; size: number; color?: string; background?: string }) {
  const { count, runs } = useMemo(() => {
    const qr = createQr(0, 'M'); qr.addData(value); qr.make();
    const count = qr.getModuleCount(); const runs: { row: number; start: number; length: number }[] = [];
    for (let row = 0; row < count; row++) {
      let start = -1;
      for (let col = 0; col <= count; col++) {
        const dark = col < count && qr.isDark(row, col);
        if (dark && start < 0) start = col;
        if (!dark && start >= 0) { runs.push({ row, start, length: col - start }); start = -1; }
      }
    }
    return { count, runs };
  }, [value]);
  const quiet = 3; const cell = Math.floor(size / (count + quiet * 2)); const offset = (size - cell * count) / 2;
  return <View accessible accessibilityRole="image" accessibilityLabel="Group invite QR code" style={{ width: size, height: size, backgroundColor: background, borderRadius: 4 }}>
    {runs.map(run => <View key={`${run.row}:${run.start}`} style={{ position: 'absolute', top: offset + run.row * cell, left: offset + run.start * cell, width: run.length * cell, height: cell, backgroundColor: color }} />)}
  </View>;
}
