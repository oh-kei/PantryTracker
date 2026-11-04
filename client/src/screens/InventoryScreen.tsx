import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FoodItem } from '../services/api';

interface InventoryScreenProps {
  inventory: FoodItem[];
  onDeleteItem: (id: string) => void;
  onNavigateScan: () => void;
  onBack: () => void;
}

export default function InventoryScreen({
  inventory,
  onDeleteItem,
  onNavigateScan,
  onBack
}: InventoryScreenProps) {
  const [filter, setFilter] = useState<'ALL' | 'FRIDGE' | 'URGENT'>('ALL');

  const filtered = inventory.filter(item => {
    if (filter === 'FRIDGE') return item.storageLocation === 'FRIDGE';
    if (filter === 'URGENT') return item.urgency === 'URGENT' || item.urgency === 'WARNING';
    return true;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pantry Inventory</Text>
        <TouchableOpacity onPress={onNavigateScan}>
          <Ionicons name="add" size={24} color="#2563eb" />
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {(['ALL', 'FRIDGE', 'URGENT'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.activeChip]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.activeFilterText]}>
              {f === 'ALL' ? `All (${inventory.length})` : f === 'FRIDGE' ? 'Fridge' : 'Expiring Soon'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {filtered.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No inventory items found. Tap '+' to scan or add items.</Text>
          </View>
        ) : (
          filtered.map(item => {
            const bgCard = item.urgency === 'URGENT' ? '#fee2e2' : item.urgency === 'WARNING' ? '#fef3c7' : '#ffffff';
            return (
              <View key={item.id} style={[styles.itemCard, { backgroundColor: bgCard }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>Qty: {item.quantity} | Category: {item.category}</Text>
                  <Text style={styles.itemExpiry}>Expires: {item.expiryDate}</Text>
                </View>
                <TouchableOpacity onPress={() => onDeleteItem(item.id)}>
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingTop: 48 },
  backBtn: { marginRight: 8 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  filterRow: { flexDirection: 'row', padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f1f5f9', marginRight: 8 },
  activeChip: { backgroundColor: '#2563eb' },
  filterText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  activeFilterText: { color: '#ffffff' },
  content: { padding: 16 },
  center: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#94a3b8', fontSize: 14, textAlign: 'center' },
  itemCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  itemName: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
  itemMeta: { fontSize: 13, color: '#475569', marginVertical: 2 },
  itemExpiry: { fontSize: 12, fontWeight: '600', color: '#2563eb' }
});
