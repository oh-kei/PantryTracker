import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FoodItem, inferCategory } from '../services/api';

interface InventoryScreenProps {
  inventory: FoodItem[];
  onDeleteItem: (id: string) => void;
  onEditItem: (id: string, name: string, category: string, quantity: string, days: number) => void;
  onNavigateScan: () => void;
  onBack: () => void;
}

export default function InventoryScreen({
  inventory,
  onDeleteItem,
  onEditItem,
  onNavigateScan,
  onBack
}: InventoryScreenProps) {
  const [filter, setFilter] = useState<'ALL' | 'FRIDGE' | 'URGENT'>('ALL');
  const [editing, setEditing] = useState<FoodItem | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('');
  const [days, setDays] = useState('7');

  const openEdit = (item: FoodItem) => {
    setEditing(item);
    setName(item.name);
    setCategory(item.category);
    setQuantity(item.quantity);
    const remaining = Math.max(0, Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000));
    setDays(String(remaining));
  };

  const saveEdit = () => {
    if (!editing || !name.trim()) return;
    onEditItem(editing.id, name.trim(), category.trim() || 'Other', quantity.trim() || '1 unit', parseInt(days, 10) || 7);
    setEditing(null);
  };

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
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => openEdit(item)} style={styles.actionButton}>
                    <Ionicons name="create-outline" size={20} color="#2563eb" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onDeleteItem(item.id)} style={styles.actionButton}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <Modal visible={editing !== null} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Pantry Item</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={value => {
                setName(value);
                const detected = inferCategory(value);
                if (detected !== 'Other') setCategory(detected);
              }}
              placeholder="Food Item Name"
            />
            <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="Category" />
            <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} placeholder="Quantity" />
            <TextInput style={styles.input} value={days} onChangeText={setDays} placeholder="Days until expiry" keyboardType="numeric" />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setEditing(null)}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.saveButton]} onPress={saveEdit}>
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  ,actions: { flexDirection: 'row', alignItems: 'center' },
  actionButton: { padding: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#ffffff', padding: 24, borderRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#1e293b' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 16, color: '#1e293b' },
  modalButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  modalButton: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  cancelButton: { backgroundColor: '#f1f5f9' },
  saveButton: { backgroundColor: '#2563eb' },
  saveText: { color: '#ffffff', fontWeight: 'bold' }
});
