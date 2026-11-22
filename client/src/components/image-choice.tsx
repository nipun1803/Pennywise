import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { Avatar, Button, Chips, Label, Notice } from '@/components/ui/app-ui';
import { errorMessage, request } from '@/lib/api';

export function ImageChoice({ name, value, onChange, disabled, onBusy }: { name: string; value?: string | null; onChange: (image: string | null) => void; disabled?: boolean; onBusy?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const lock = useRef(false);
  const upload = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusy?.(true); setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64 || asset.base64.length > 7_000_000) throw new Error('Choose an image smaller than 5 MB.');
      const response = await request<{ image: string }>('/media/images', { method: 'POST', body: { image: `data:image/jpeg;base64,${asset.base64}` } });
      onChange(response.data.image);
    } catch (error) { setError(errorMessage(error)); }
    finally { lock.current = false; setBusy(false); onBusy?.(false); }
  };
  return <View style={{ gap: 14 }}><View style={{ alignItems: 'center', gap: 10 }}><Avatar name={name || 'New group'} image={value} size={72} /><Label muted size={13}>Choose a photo, a preset, or name initials.</Label></View>
    <Button title="Upload photo" secondary busy={busy} disabled={disabled} onPress={() => void upload()} />
    <Chips disabled={disabled || busy} value={value ?? ''} onChange={v => onChange(v || null)} options={[{ value: '', label: 'Initials' }, { value: 'preset:people', label: 'Friends' }, { value: 'preset:airplane', label: 'Trip' }, { value: 'preset:home', label: 'Home' }, { value: 'preset:restaurant', label: 'Food' }, { value: 'preset:briefcase', label: 'Work' }, { value: 'preset:heart', label: 'Family' }]} />
    {!!error && <Notice text={error} error />}
  </View>;
}
