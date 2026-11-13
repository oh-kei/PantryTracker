import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { inferCategory } from '../services/api';

interface CameraScanScreenProps {
  isLoading: boolean;
  onCapturePhoto: (base64Image: string) => void;
  onAddManualItem: (name: string, category: string, storage: 'FRIDGE' | 'FREEZER' | 'PANTRY', quantity: string, days: number) => void;
  onBack: () => void;
}

export default function CameraScanScreen({
  isLoading,
  onCapturePhoto,
  onAddManualItem,
  onBack
}: CameraScanScreenProps) {
  const [showManualModal, setShowManualModal] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Other');
  const [quantity, setQuantity] = useState('1 unit');
  const [days, setDays] = useState('7');

  const handleManualSubmit = () => {
    if (name.trim()) {
      onAddManualItem(name, category, 'FRIDGE', quantity, parseInt(days) || 7);
      setShowManualModal(false);
      onBack();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan or Add Food</Text>
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Gemini Vision is identifying items & estimating shelf-life...</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Ionicons name="camera-outline" size={80} color="#2563eb" style={styles.icon} />
            <Text style={styles.title}>Photograph Your Fridge or Items</Text>
            <Text style={styles.desc}>
              Capture a clear photo of your fridge interior or produce. Images are processed in-transit by Gemini Vision and never persisted on servers.
            </Text>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => onCapturePhoto('mock_base64_image')}>
              <Text style={styles.primaryBtnText}>Capture Photo & Analyze</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowManualModal(true)}>
              <Ionicons name="create-outline" size={20} color="#2563eb" />
              <Text style={styles.outlineBtnText}>Manual Entry Fallback</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Manual Entry Modal */}
      <Modal visible={showManualModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Item Manually</Text>

            <TextInput
              style={styles.input}
              placeholder="Food Item Name"
              placeholderTextColor="#94a3b8"
              value={name}
              onChangeText={value => {
                setName(value);
                setCategory(inferCategory(value));
              }}
            />
            <TextInput style={styles.input} placeholder="Category (e.g., Vegetables)" placeholderTextColor="#94a3b8" value={category} onChangeText={setCategory} />
            <TextInput style={styles.input} placeholder="Quantity (e.g., 2 units)" placeholderTextColor="#94a3b8" value={quantity} onChangeText={setQuantity} />
            <TextInput style={styles.input} placeholder="Shelf life in days (e.g., 7)" placeholderTextColor="#94a3b8" keyboardType="numeric" value={days} onChangeText={setDays} />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={() => setShowManualModal(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.saveBtn]} onPress={handleManualSubmit}>
                <Text style={styles.saveBtnText}>Add to Pantry</Text>
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
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingTop: 48 },
  backBtn: { marginRight: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#0f172a' },
  content: { flex: 1, justifyContent: 'center', padding: 20 },
  center: { alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 16, fontSize: 15, color: '#475569', textAlign: 'center', fontWeight: '500' },
  card: { backgroundColor: '#ffffff', padding: 24, borderRadius: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  icon: { marginBottom: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1e293b', marginBottom: 10, textAlign: 'center' },
  desc: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  primaryBtn: { backgroundColor: '#2563eb', width: '100%', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: '#ffffff', fontWeight: 'bold', fontSize: 16 },
  outlineBtn: { flexDirection: 'row', borderWidth: 1, borderColor: '#2563eb', width: '100%', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  outlineBtnText: { color: '#2563eb', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#ffffff', padding: 24, borderRadius: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#1e293b' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 16, color: '#1e293b' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  modalBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  cancelBtn: { backgroundColor: '#f1f5f9', marginRight: 8 },
  cancelBtnText: { color: '#475569', fontWeight: 'bold' },
  saveBtn: { backgroundColor: '#2563eb', marginLeft: 8 },
  saveBtnText: { color: '#ffffff', fontWeight: 'bold' }
});
