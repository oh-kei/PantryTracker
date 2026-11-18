import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { colours } from '../components/ui';
import ConfirmationScreen from '../screens/ConfirmationScreen';
import HomeScreen from '../screens/HomeScreen';
import InventoryScreen from '../screens/InventoryScreen';
import RecipeDetailScreen from '../screens/RecipeDetailScreen';
import RecipeListScreen from '../screens/RecipeListScreen';
import ScanScreen from '../screens/ScanScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useInventoryStore } from '../store/inventoryStore';
import { urgencyOf } from '../domain/expiry';
import type { RootStackParamList, TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Inventory: 'basket',
  Recipes: 'restaurant',
  Settings: 'settings',
};

const Tabs = () => {
  const urgentCount = useInventoryStore(s => s.items.filter(i => urgencyOf(i) === 'URGENT').length);
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colours.primary,
        tabBarIcon: ({ color, size }) => <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />,
        headerTitleStyle: { fontWeight: '800' },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Smart Recipe Planner' , tabBarLabel: 'Home' }} />
      <Tab.Screen name="Inventory" component={InventoryScreen} options={{ tabBarBadge: urgentCount > 0 ? urgentCount : undefined }} />
      <Tab.Screen name="Recipes" component={RecipeListScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

export default function RootNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Scan food', headerShown: false }} />
      <Stack.Screen name="Confirm" component={ConfirmationScreen} options={{ title: 'Confirm items' }} />
      <Stack.Screen name="RecipeDetail" component={RecipeDetailScreen} options={{ title: 'Recipe' }} />
    </Stack.Navigator>
  );
}
