import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Button, Card, Chips, Field, Header, Icon, Label, Notice, Pager, ResourceError, Screen, Skeletons, type IconName, styles } from '@/components/ui/app-ui';
import { useMutation } from '@/hooks/use-mutation';
import { useResource } from '@/hooks/use-resource';
import { errorMessage } from '@/lib/api';
import type { Accent, Category, Group } from '@/lib/types';
import { useApp } from '@/providers/app-provider';
import { accents } from '@/theme/palette';
import { accentOptions } from './group-details-form';
export const categoryIcons: Record<string, IconName> = { food: 'restaurant-outline', cart: 'cart-outline', bus: 'bus-outline', home: 'home-outline', bulb: 'bulb-outline', bag: 'bag-outline', game: 'game-controller-outline', airplane: 'airplane-outline', heart: 'heart-outline', grid: 'grid-outline' };
type CategorySummary = Pick<Category, 'id' | 'name' | 'icon' | 'color'>;
export function CategoryManager({ groupId, onSelect }: { groupId: string; onSelect?: (category: Category) => void }) {
  const { session, offline } = useApp(); const [page, setPage] = useState(1); const [search, setSearch] = useState('');
  const resource = useResource<Category[]>(`/groups/${groupId}/categories?page=${page}&limit=25&search=${encodeURIComponent(search.trim())}&includeArchived=${onSelect ? 'false' : 'true'}`);
  const group = useResource<Group>(`/groups/${groupId}`); const creator = group.data?.createdBy === session?.user.id;
  const { busy, mutate } = useMutation(); const [editing, setEditing] = useState<Category | 'new' | null>(null); const [name, setName] = useState(''); const [icon, setIcon] = useState('grid'); const [color, setColor] = useState<Accent>('emerald'); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false);
  const start = (category: Category | 'new') => { setEditing(category); setName(category === 'new' ? '' : category.name); setIcon(category === 'new' ? 'grid' : category.icon); setColor(category === 'new' ? 'emerald' : category.color); setError(''); setConfirm(false); };
  const save = async (archive = false) => {
    if (!archive && !name.trim()) { setError('Enter a category name.'); return; }
    if (!editing) return;
    try { const result = await mutate<Category>(editing === 'new' ? `/groups/${groupId}/categories` : `/groups/${groupId}/categories/${editing.id}`, editing === 'new' ? 'POST' : 'PATCH', archive ? { archived: true } : { name: name.trim(), icon, color }); setEditing(null); setConfirm(false); if (onSelect && !archive) onSelect(result.data); }
    catch (error) { setError(errorMessage(error)); }
  };
  return <View style={{ gap: 18 }}><Field label="Search categories" value={search} onChangeText={value => { setSearch(value); setPage(1); }} maxLength={80} placeholder="Find a category" /><Button title="Add custom category" secondary icon="add" disabled={offline || busy} onPress={() => start('new')} />
    {!!editing && <Card><Label bold>{editing === 'new' ? 'New custom category' : 'Edit custom category'}</Label><Field label="Category name" value={name} onChangeText={setName} maxLength={80} editable={!busy} /><Chips value={icon} onChange={setIcon} disabled={busy} options={Object.keys(categoryIcons).map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))} /><Chips value={color} onChange={setColor} disabled={busy} options={accentOptions} />{!!error && <Notice text={error} error />}<Button title="Save category" busy={busy} disabled={offline} onPress={() => void save()} /><Button title="Cancel" secondary disabled={busy} onPress={() => setEditing(null)} />{editing !== 'new' && !editing.archivedAt && creator && <><Button title="Archive category" secondary danger disabled={offline || busy} onPress={() => setConfirm(true)} />{confirm && <><Notice text="Hide this category from new expense choices? Existing expenses keep their category details." error /><Button title="Confirm archive" danger busy={busy} disabled={offline} onPress={() => void save(true)} /></>}</>}</Card>}
    {resource.saved && <Notice text="Showing saved categories for this page. Other categories may not be saved." />}{!!resource.error && <ResourceError message={resource.error} retry={() => void resource.reload()} />}{resource.loading && !resource.data ? <Skeletons /> : resource.data?.map(category => <Pressable accessibilityRole="button" key={category.id} disabled={!!category.archivedAt || (!onSelect && (category.standard || !creator))} onPress={() => onSelect ? onSelect(category) : start(category)}><Card><View style={styles.row}><Icon name={categoryIcons[category.icon] ?? 'grid-outline'} color={accents[category.color]} /><View style={{ flex: 1 }}><Label bold>{category.name}</Label><Label muted size={12}>{category.archivedAt ? 'Archived · preserved on old expenses' : category.standard ? 'Standard category · read-only' : 'Custom category'}</Label></View>{!!onSelect && <Icon name="chevron-forward" />}</View></Card></Pressable>)}{resource.data?.length === 0 && <Label muted>No matching categories.</Label>}<Pager pagination={resource.pagination} onPage={setPage} disabled={resource.loading} />
  </View>;
}
export function CategoryPicker({ groupId, selected, onChange, disabled }: { groupId: string; selected: CategorySummary | null; onChange: (category: CategorySummary) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 8 }}><Label bold size={13}>Category (required)</Label><Button title={selected?.name ?? 'Choose category'} secondary disabled={disabled} onPress={() => setOpen(true)} /><Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>{open && <Screen><Header title="Choose category" action={<Button title="Close" secondary onPress={() => setOpen(false)} />} /><CategoryManager groupId={groupId} onSelect={category => { onChange(category); setOpen(false); }} /></Screen>}</Modal></View>;
}
