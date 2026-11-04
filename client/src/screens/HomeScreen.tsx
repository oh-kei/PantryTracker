import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FoodItem, Recipe } from '../services/api';

interface HomeScreenProps {
  inventory: FoodItem[];
  recipes: Recipe[];
  onNavigateScan: () => void;
  onNavigateInventory: () => void;
  onNavigateRecipes: () => void;
}

export default function HomeScreen({
  inventory,
  recipes,
  onNavigateScan,
  onNavigateInventory,
  onNavigateRecipes
}: HomeScreenProps) {
  const urgentCount = inventory.filter(item => item.urgency === 'URGENT' || item.urgency === 'WARNING').length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Smart Food Tracker</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Expiring Soon Summary Card */}
        <View style={[styles.card, urgentCount > 0 ? styles.alertCard : styles.successCard]}>
          <Text style={styles.cardTitle}>
            {urgentCount > 0 ? `⚠️ ${urgentCount} items need attention!` : '🎉 Your pantry is fresh!'}
          </Text>
          <Text style={styles.cardDesc}>
            Snap a photo of your fridge or ingredients to automatically update inventory and find waste-free recipes.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={onNavigateScan}>
            <Ionicons name="camera" size={20} color="#fff" />
            <Text style={styles.buttonText}>Scan Fridge / Food Photo</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.row}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#e0f2fe' }]} onPress={onNavigateInventory}>
            <Ionicons name="basket" size={24} color="#0284c7" />
            <Text style={[styles.actionText, { color: '#0369a1' }]}>Pantry ({inventory.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#f0fdf4' }]} onPress={onNavigateRecipes}>
            <Ionicons name="restaurant" size={24} color="#16a34a" />
            <Text style={[styles.actionText, { color: '#15803d' }]}>Recipes ({recipes.length})</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Items Expiring Soon</Text>
        {inventory
          .filter(item => item.urgency !== 'SAFE')
          .map(item => (
            <View key={item.id} style={styles.itemCard}>
              <View>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemExpiry}>Expires: {item.expiryDate}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: item.urgency === 'URGENT' ? '#ef4444' : '#f59e0b' }]}>
                <Text style={styles.badgeText}>{item.urgency}</Text>
              </View>
            </View>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#0f172a' },
  content: { padding: 16 },
  card: { padding: 20, borderRadius: 16, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 2 },
  alertCard: { backgroundColor: '#fee2e2' },
  successCard: { backgroundColor: '#dcfce7' },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 6 },
  cardDesc: { fontSize: 14, color: '#475569', marginBottom: 16, lineHeight: 20 },
  primaryButton: { flexDirection: 'row', backgroundColor: '#2563eb', padding: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  actionBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', marginHorizontal: 6, flexDirection: 'row', justifyContent: 'center' },
  actionText: { fontWeight: 'bold', fontSize: 15, marginLeft: 8 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginBottom: 12 },
  itemCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  itemName: { fontSize: 16, fontWeight: '600', color: '#1e293b' },
  itemExpiry: { fontSize: 13, color: '#ef4444', marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' }
});
