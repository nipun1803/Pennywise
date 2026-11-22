import { Tabs } from 'expo-router';
import { FloatingTabBar } from '@/components/floating-tab-bar';
export const unstable_settings = { anchor: 'home' };
export default function TabsLayout() {
  return <Tabs backBehavior="initialRoute" tabBar={props => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}>
    <Tabs.Screen name="home" options={{ title: 'Home' }} />
    <Tabs.Screen name="groups" options={{ title: 'Groups' }} />
    <Tabs.Screen name="activity" options={{ title: 'Activity' }} />
    <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
  </Tabs>;
}
