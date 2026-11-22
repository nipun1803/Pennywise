import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Button, Card, Field, Header, Icon, Label, Notice, Pager, ResourceError, Screen, Skeletons, styles } from '@/components/ui/app-ui';
import { useResource } from '@/hooks/use-resource';
import type { Member } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
export function MemberPicker({ groupId, label, selected, onChange, multiple = false, disabled = false }: { groupId: string; label: string; selected: Member[]; onChange: (members: Member[]) => void; multiple?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false); const [search, setSearch] = useState(''); const [page, setPage] = useState(1); const { colors } = useApp();
  const resource = useResource<Member[]>(open ? `/groups/${groupId}/members?page=${page}&limit=25&search=${encodeURIComponent(search.trim())}` : null);
  return <View style={{ gap: 10 }}><Label bold size={13}>{label}</Label><Button title={selected.length ? selected.map(member => member.name).join(', ') : multiple ? 'Choose members' : 'Choose a member'} secondary disabled={disabled} onPress={() => setOpen(true)} />
    <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}><Screen><Header title={label} action={<Button title="Done" secondary onPress={() => setOpen(false)} />} /><Field label="Search members" value={search} onChangeText={value => { setSearch(value); setPage(1); }} maxLength={80} placeholder="Search by name" />
      {selected.length > 0 && <Card><Label bold size={13}>Selected ({selected.length})</Label>{selected.map(member => <Pressable key={member.id} accessibilityRole="button" accessibilityLabel={`Remove ${member.name}`} onPress={() => onChange(selected.filter(item => item.id !== member.id))} style={styles.row}><View style={{ flex: 1 }}><Label>{member.name}</Label></View><Icon name="close-circle-outline" color={colors.primary} /></Pressable>)}</Card>}
      {resource.saved && <Notice text="Showing saved members. Offline searches cannot find members that haven’t been saved." />}{!!resource.error && <ResourceError message={resource.error} retry={() => void resource.reload()} />}
      {resource.loading && !resource.data ? <Skeletons /> : resource.data?.map(member => { const checked = selected.some(item => item.id === member.id); return <Pressable key={member.id} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => { onChange(checked ? selected.filter(item => item.id !== member.id) : multiple ? [...selected, member] : [member]); if (!multiple) setOpen(false); }}><Card><View style={styles.row}><View style={{ flex: 1 }}><Label>{member.name}</Label></View><Icon name={checked ? 'checkbox' : 'square-outline'} color={colors.primary} /></View></Card></Pressable>; })}
      {resource.data?.length === 0 && <Label muted>No matching members on this page.</Label>}<Pager pagination={resource.pagination} onPage={setPage} disabled={resource.loading} />
    </Screen></Modal>
  </View>;
}
