import { View } from 'react-native';
import { Card, Field, Label } from '@/components/ui/app-ui';
import type { Member } from '@/lib/types';
import { formatINR } from '@/lib/format';

export function SplitPreview({ members, custom, values, onChange, disabled, total }: { members: Member[]; custom: boolean; values: Record<string, string>; onChange: (values: Record<string, string>) => void; disabled?: boolean; total: number }) {
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
  return <Card><Label bold>{custom ? 'Exact shares' : 'Split preview'}</Label>{sorted.map((member, i) => custom ? <Field key={member.id} label={`${member.name}’s share (₹)`} value={values[member.id] ?? ''} onChangeText={value => onChange({ ...values, [member.id]: value })} keyboardType="decimal-pad" placeholder="0.00" editable={!disabled} /> : <View key={member.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label>{member.name}</Label><Label>{formatINR(Math.floor(total / sorted.length) + (i < total % sorted.length ? 1 : 0))}</Label></View>)}
    {members.length === 0 && <Label muted>Select people to preview their shares.</Label>}
  </Card>;
}
