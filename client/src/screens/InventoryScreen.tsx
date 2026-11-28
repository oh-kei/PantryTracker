import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { InventoryItem, StorageLocation } from '../../../shared/types';
import { ExpiryDateField } from '../components/ExpiryDateField';
import { UnitPicker } from '../components/UnitPicker';
import { minFor, quantityForUnit, stepFor } from '../domain/units';
import { Button, Chip, colours, EmptyState, StorageSelector, Stepper, styles as ui, UrgencyBadge } from '../components/ui';
import { api } from '../data/api';
import { EXPIRY_DISCLAIMER, estimateExpiry, isValidDate, todayString, urgencyOf } from '../domain/expiry';
import { groupByStorage, rangeFor } from '../domain/inventory';
import { useInventoryStore } from '../store/inventoryStore';

type Filter = 'ALL' | 'SOON';

const ItemRow = ({ item, onEdit }: { item: InventoryItem; onEdit: (item: InventoryItem) => void }) => {
  const consume = useInventoryStore(s => s.consume);
  const removeItem = useInventoryStore(s => s.removeItem);
  const swipeRef = useRef<SwipeableMethods>(null);

  const action = (label: string, icon: keyof typeof Ionicons.glyphMap, colour: string, onPress: () => void) => (
    <Pressable
      accessibilityLabel={`${label} ${item.name}`}
      onPress={() => { swipeRef.current?.close(); onPress(); }}
      style={[local.swipeAction, { backgroundColor: colour }]}
    >
      <Ionicons name={icon} size={20} color="#fff" />
      <Text style={local.swipeText}>{label}</Text>
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      renderRightActions={() => (
        <View style={local.swipeRow}>
          {action('Edit', 'create-outline', colours.primary, () => onEdit(item))}
          {action('Use 1', 'remove-circle-outline', colours.success, () => consume(item.id, Math.min(1, item.quantity)))}
          {action('Delete', 'trash-outline', colours.danger, () => removeItem(item.id))}
        </View>
      )}
    >
      <Pressable testID={`item-${item.name}`} onPress={() => onEdit(item)} style={local.row}>
        <View style={{ flex: 1 }}>
          <Text style={local.name}>{item.name}</Text>
          <Text style={local.meta}>{item.quantity} {item.unit} · {item.category}</Text>
        </View>
        <UrgencyBadge item={item} />
      </Pressable>
    </Swipeable>
  );
};

const EditModal = ({ item, onClose }: { item: InventoryItem; onClose: () => void }) => {
  const updateItem = useInventoryStore(s => s.updateItem);
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [unit, setUnit] = useState(item.unit);
  const [storage, setStorage] = useState<StorageLocation>(item.storageLocation);
  const [labelDate, setLabelDate] = useState<string | undefined>(item.expirySource === 'label' ? item.expiryDate : undefined);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    if (labelDate && !isValidDate(labelDate)) {
      Alert.alert('Check the date', 'Use the format 2026-12-31.');
      return;
    }
    const patch: Partial<InventoryItem> = { name: name.trim(), quantity, unit: unit.trim() || 'unit', storageLocation: storage };
    if (labelDate) {
      Object.assign(patch, { expiryDate: labelDate, expiryEarliest: labelDate, expirySource: 'label' });
    } else if (storage !== item.storageLocation || item.expirySource === 'label' || name.trim() !== item.name) {
      // Moving food (e.g. into the freezer) restarts its clock from today.
      setSaving(true);
      try {
        const result = await api.shelfLife(name.trim(), storage);
        const range = rangeFor(result.ranges, storage);
        if (!range) {
          Alert.alert('Storage location', `${name} shouldn't be kept in the ${storage.toLowerCase()}.`);
          setSaving(false);
          return;
        }
        const window = estimateExpiry(todayString(), range);
        Object.assign(patch, { canonicalId: result.canonicalId, category: result.category, expiryEarliest: window.earliest, expiryDate: window.latest, expirySource: 'estimate' });
      } catch {
        // Offline: keep the current dates.
      }
      setSaving(false);
    }
    updateItem(item.id, patch);
    onClose();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={local.overlay}>
        <ScrollView style={local.sheet} contentContainerStyle={local.sheetContent} keyboardShouldPersistTaps="handled">
          <Text style={local.sheetTitle}>Edit item</Text>
          <Text style={ui.label}>Name</Text>
          <TextInput style={ui.input} value={name} onChangeText={setName} />
          <Text style={ui.label}>Amount</Text>
          <Stepper value={quantity} min={Math.min(minFor(unit), 0.5)} step={item.quantity % 1 === 0 ? stepFor(unit) : 0.5} onChange={setQuantity} />
          <View style={{ marginTop: 8 }}>
            <UnitPicker value={unit} onChange={next => { setQuantity(q => quantityForUnit(q, unit, next)); setUnit(next); }} />
          </View>
          <Text style={ui.label}>Storage</Text>
          <StorageSelector value={storage} onChange={setStorage} />
          <Text style={ui.label}>Printed expiry date</Text>
          <ExpiryDateField value={labelDate} onChange={setLabelDate} />
          <Text style={[ui.muted, { fontSize: 12, marginTop: 8 }]}>{EXPIRY_DISCLAIMER}</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Button title="Cancel" variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title="Save" onPress={save} loading={saving} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

/** Inventory grouped by storage location, sorted by expiry, with swipe to edit / consume. */
export default function InventoryScreen() {
  const navigation = useNavigation();
  const items = useInventoryStore(s => s.items);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [editing, setEditing] = useState<InventoryItem | null>(null);

  const soonCount = items.filter(i => urgencyOf(i) !== 'SAFE').length;
  const sections = useMemo(
    () => groupByStorage(filter === 'SOON' ? items.filter(i => urgencyOf(i) !== 'SAFE') : items),
    [items, filter],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <View style={local.filters}>
        <Chip label={`All (${items.length})`} selected={filter === 'ALL'} onPress={() => setFilter('ALL')} />
        <Chip label={`Expiring soon (${soonCount})`} selected={filter === 'SOON'} onPress={() => setFilter('SOON')} />
        <View style={{ flex: 1 }} />
        <Pressable accessibilityLabel="Add items" onPress={() => navigation.navigate('Scan')} style={local.add}>
          <Ionicons name="add" size={22} color="#fff" />
        </Pressable>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <ItemRow item={item} onEdit={setEditing} />}
        renderSectionHeader={({ section }) => (
          <Text style={local.sectionHeader}>{section.title} · {section.data.length}</Text>
        )}
        contentContainerStyle={sections.length === 0 ? { flexGrow: 1 } : { paddingBottom: 24 }}
        ListHeaderComponent={sections.length > 0 ? <Text style={local.tip}>Tip: swipe an item left to edit, use or delete it.</Text> : undefined}
        ListEmptyComponent={
          <EmptyState
            icon="basket-outline"
            title={filter === 'SOON' ? 'Nothing is expiring soon' : 'Your pantry is empty'}
            message={filter === 'SOON' ? 'Nice — no food at risk right now.' : 'Scan your fridge or add items manually to start tracking.'}
            action={filter === 'ALL' ? <Button title="Scan or add food" icon="camera" onPress={() => navigation.navigate('Scan')} /> : undefined}
          />
        }
      />
      {editing && <EditModal item={editing} onClose={() => setEditing(null)} />}
    </View>
  );
}

const local = StyleSheet.create({
  filters: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colours.border },
  add: { width: 36, height: 36, borderRadius: 18, backgroundColor: colours.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  tip: { fontSize: 12, color: colours.muted, paddingHorizontal: 16, paddingTop: 10 },
  sectionHeader: { fontSize: 13, fontWeight: '800', color: colours.muted, textTransform: 'uppercase', letterSpacing: 0.6, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6, backgroundColor: colours.bg },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colours.border },
  name: { fontSize: 16, fontWeight: '700', color: colours.text },
  meta: { fontSize: 13, color: colours.muted, marginTop: 2 },
  swipeRow: { flexDirection: 'row' },
  swipeAction: { width: 72, alignItems: 'center', justifyContent: 'center' },
  swipeText: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 2 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, flexGrow: 0, maxHeight: '90%' },
  sheetContent: { padding: 20, paddingBottom: 32 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colours.text },
});
