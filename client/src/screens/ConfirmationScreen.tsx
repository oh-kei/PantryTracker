import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FoodItem, ScanResult } from '../services/api';

interface ConfirmationScreenProps {
  scannedResults: ScanResult[];
  onConfirmItems: (items: FoodItem[]) => void;
  onCancel: () => void;
}

export default function ConfirmationScreen({
  scannedResults,
  onConfirmItems,
  onCancel
}: ConfirmationScreenProps) {
  const [items, setItems] = useState<FoodItem[]>(
    scannedResults.map((scan, index) => {
      const today = new Date();
      const expiry = new Date();
      expiry.setDate(today.getDate() + scan.estimatedShelfLifeDays);
      return {
        id: `scan_${index}_${Date.now()}`,
        name: scan.name,
        category: scan.category,
        storageLocation: scan.storageLocation,
        quantity: '1 unit',
        buyDate: today.toISOString().split('T')[0],
        expiryDate: expiry.toISOString().split('T')[0],
        confidence: scan.confidence,
        urgency: 'SAFE'
      };
    })
  );

  const updateItem = (id: string, field: keyof FoodItem, value: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Confirm Detected Items</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Review and adjust items identified by Gemini Vision. You can edit names, quantities, or remove incorrect items.
        </Text>

        {items.length === 0 ? (
          <Text style={styles.emptyText}>No items detected. Tap cancel to retake.</Text>
        ) : (
          items.map(item => (
            <View key={item.id} style={styles.card}>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1, marginRight: 8 }]}
                  value={item.name}
                  onChangeText={val => updateItem(item.id, 'name', val)}
                  placeholder="Item Name"
                />
                <TouchableOpacity onPress={() => removeItem(item.id)}>
                  <Ionicons name="trash-outline" size={22} color="#ef4444" />
                </TouchableOpacity>
              </View>

              <View style={styles.row}>
                <TextInput
                  style={[styles.input, { flex: 1, marginRight: 8 }]}
                  value={item.quantity}
                  onChangeText={val => updateItem(item.id, 'quantity', val)}
                  placeholder="Quantity"
                />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={item.category}
                  onChangeText={val => updateItem(item.id, 'category', val)}
                  placeholder="Category"
                />
              </View>

              <Text style={styles.confidenceText}>
                Estimated Expiry: {item.expiryDate} {item.confidence ? `(Confidence: ${Math.round(item.confidence * 100)}%)` : ''}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>Retake / Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmBtn} onPress={() => onConfirmItems(items)}>
          <Ionicons name="checkmark" size={20} color="#fff" />
          <Text style={styles.confirmBtnText}>Confirm & Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: { padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingTop: 48 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  content: { padding: 16 },
  subtitle: { fontSize: 14, color: '#475569', marginBottom: 16, lineHeight: 20 },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
  card: { backgroundColor: '#ffffff', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', padding: 10, borderRadius: 8, fontSize: 15, color: '#1e293b' },
  confidenceText: { fontSize: 12, fontWeight: 'bold', color: '#2563eb', marginTop: 4 },
  footer: { flexDirection: 'row', padding: 16, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  cancelBtn: { flex: 1, padding: 14, backgroundColor: '#f1f5f9', borderRadius: 10, alignItems: 'center', marginRight: 8 },
  cancelBtnText: { color: '#475569', fontWeight: 'bold' },
  confirmBtn: { flex: 1, flexDirection: 'row', padding: 14, backgroundColor: '#2563eb', borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  confirmBtnText: { color: '#ffffff', fontWeight: 'bold', marginLeft: 6 }
});
