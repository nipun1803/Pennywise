import { useLocalSearchParams } from 'expo-router';
import { Header, Screen } from '@/components/ui/app-ui';
import { CategoryManager } from '@/screens/category-manager';
export default function Categories() { const { id } = useLocalSearchParams<{ id: string }>(); return <Screen><Header back title="Group categories" subtitle="Members can add custom categories. The creator can rename or archive them." /><CategoryManager groupId={id} /></Screen>; }
