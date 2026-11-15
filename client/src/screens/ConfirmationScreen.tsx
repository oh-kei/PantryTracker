import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip, colours, StorageSelector, Stepper, styles as ui } from '../components/ui';
import { LOW_CONFIDENCE } from '../config';
import { api } from '../data/api';
import { daysUntil, EXPIRY_DISCLAIMER, estimateExpiry, isValidDate, todayString } from '../domain/expiry';
import { DraftItem, draftFromDetection, draftToItem, mergeDrafts, newId, rangeFor } from '../domain/inventory';
import type { RootStackParamList } from '../navigation/types';
import { useInventoryStore } from '../store/inventoryStore';
import { useSessionStore } from '../store/sessionStore';

const formatShort = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

const emptyDraft = (): DraftItem => ({
  key: newId('draft'),
  name: '',
  canonicalId: '',
  category: 'Other',
  quantity: 1,
  unit: 'unit',
  storageLocation: 'FRIDGE',
  ranges: null,
});

const ExpiryPreview = ({ draft }: { draft: DraftItem }) => {
  if (draft.labelDate && isValidDate(draft.labelDate)) {
    return <Text style={local.expiry}>Printed date: {formatShort(draft.labelDate)} ({daysUntil(draft.labelDate)} days)</Text>;
  }
  const range = draft.ranges ? rangeFor(draft.ranges, draft.storageLocation) : null;
  if (draft.ranges && !range) {
    return <Text style={[local.expiry, { color: colours.danger }]}>Not recommended to store here — pick another location.</Text>;
  }
  const window = estimateExpiry(todayString(), range);
  return (
    <Text style={local.expiry}>
      Estimated expiry: {formatShort(window.earliest)} – {formatShort(window.latest)}
      {!draft.ranges ? ' (generic estimate)' : ''}
    </Text>
  );
};

/** Scan & confirm (proposal 4.3): only items the user confirms are saved. */
export default function ConfirmationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Confirm'>>();
  const scan = useSessionStore(s => s.scan);
  const setScan = useSessionStore(s => s.setScan);
  const addItems = useInventoryStore(s => s.addItems);

  const [drafts, setDrafts] = useState<DraftItem[]>(() => {
    const fromScan = (scan?.items || []).map(draftFromDetection);
    return fromScan.length > 0 || !route.params?.manual ? fromScan : [emptyDraft()];
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [lookingUp, setLookingUp] = useState<string | null>(null);

  const update = (key: string, patch: Partial<DraftItem>) =>
    setDrafts(prev => prev.map(d => (d.key === key ? { ...d, ...patch } : d)));
  const remove = (key: string) => {
    setDrafts(prev => prev.filter(d => d.key !== key));
    setSelected(prev => prev.filter(k => k !== key));
  };
  const toggleSelected = (key: string) =>
    setSelected(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));

  /** Re-map an edited name onto the taxonomy to refresh its shelf-life data. */
  const lookup = async (draft: DraftItem) => {
    if (!draft.name.trim()) return;
    setLookingUp(draft.key);
    try {
      const result = await api.shelfLife(draft.name.trim());
      update(draft.key, {
        canonicalId: result.canonicalId,
        category: result.category,
        ranges: result.ranges,
        storageLocation: draft.ranges ? draft.storageLocation : result.defaultStorage,
      });
    } catch {
      // Offline: keep a generic estimate; the user can enter the printed date.
      update(draft.key, { canonicalId: draft.canonicalId || draft.name.trim().toLowerCase().replace(/\s+/g, '_') });
    } finally {
      setLookingUp(null);
    }
  };

  const save = () => {
    const valid = drafts.filter(d => d.name.trim());
    const badDate = valid.find(d => d.labelDate && !isValidDate(d.labelDate));
    if (badDate) {
      Alert.alert('Check the printed date', `"${badDate.labelDate}" for ${badDate.name} should look like 2026-12-31.`);
      return;
    }
    const unsafe = valid.find(d => d.ranges && !rangeFor(d.ranges, d.storageLocation) && !d.labelDate);
    if (unsafe) {
      Alert.alert('Storage location', `${unsafe.name} shouldn't be stored in the ${unsafe.storageLocation.toLowerCase()}. Choose another location or enter the printed date.`);
      return;
    }
    const items = valid.map(d => draftToItem({
      ...d,
      canonicalId: d.canonicalId || d.name.trim().toLowerCase().replace(/\s+/g, '_'),
    }));
    if (items.length === 0) {
      navigation.goBack();
      return;
    }
    addItems(items);
    setScan(null);
    navigation.navigate('Tabs', { screen: 'Inventory' });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colours.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={local.content} keyboardShouldPersistTaps="handled">
        {scan?.source === 'mock_fallback' && (
          <Card style={local.demo}>
            <Text style={local.demoText}>Demo mode: the backend has no Gemini key, so these are sample detections.</Text>
          </Card>
        )}
        <Text style={ui.muted}>
          {drafts.length > 0 && scan?.source !== 'manual'
            ? 'Check what was detected. Edit names, quantities and storage, remove mistakes, or merge duplicates. Items with low confidence are highlighted.'
            : 'Add items by hand. Shelf life is estimated from the name and storage location.'}
        </Text>

        {selected.length >= 2 && (
          <Button
            title={`Merge ${selected.length} items`}
            icon="git-merge-outline"
            variant="outline"
            onPress={() => { setDrafts(prev => mergeDrafts(prev, selected)); setSelected([]); }}
            style={{ marginTop: 12 }}
          />
        )}

        {drafts.map(draft => {
          const low = draft.confidence !== undefined && draft.confidence < LOW_CONFIDENCE;
          const isSelected = selected.includes(draft.key);
          return (
            <Card key={draft.key} style={[local.card, low && local.lowCard, isSelected && local.selectedCard]}>
              <View style={local.row}>
                <Pressable accessibilityLabel={`Select ${draft.name} to merge`} onPress={() => toggleSelected(draft.key)} style={local.check}>
                  <Ionicons name={isSelected ? 'checkbox' : 'square-outline'} size={22} color={isSelected ? colours.primary : '#94a3b8'} />
                </Pressable>
                <TextInput
                  style={[ui.input, { flex: 1 }]}
                  value={draft.name}
                  placeholder="Food name, e.g. spinach"
                  placeholderTextColor="#94a3b8"
                  onChangeText={name => update(draft.key, { name })}
                  onEndEditing={() => lookup(draft)}
                />
                <Pressable accessibilityLabel={`Remove ${draft.name}`} onPress={() => remove(draft.key)} style={local.check}>
                  <Ionicons name="trash-outline" size={22} color={colours.danger} />
                </Pressable>
              </View>

              <View style={[local.row, { marginTop: 8, flexWrap: 'wrap' }]}>
                {draft.confidence !== undefined && (
                  <Chip
                    icon={low ? 'alert-circle' : 'checkmark-circle'}
                    label={`${Math.round(draft.confidence * 100)}% confident${low ? ' — please check' : ''}`}
                    colour={low ? '#b45309' : '#15803d'}
                    background={low ? '#fef3c7' : '#dcfce7'}
                  />
                )}
                {draft.group && <Chip icon="cube-outline" label={draft.group} />}
                {draft.category !== 'Other' && <Chip label={draft.category} />}
                {lookingUp === draft.key && <Chip label="Looking up shelf life…" />}
              </View>

              <View style={[local.row, { marginTop: 8 }]}>
                <Stepper value={draft.quantity} min={1} onChange={quantity => update(draft.key, { quantity })} />
                <TextInput
                  style={[ui.input, { flex: 1, marginLeft: 8 }]}
                  value={draft.unit}
                  placeholder="unit"
                  onChangeText={unit => update(draft.key, { unit })}
                />
              </View>

              <Text style={ui.label}>Storage</Text>
              <StorageSelector value={draft.storageLocation} onChange={storageLocation => update(draft.key, { storageLocation })} />

              <Text style={ui.label}>Printed expiry date (optional)</Text>
              <TextInput
                style={ui.input}
                value={draft.labelDate || ''}
                placeholder="YYYY-MM-DD — overrides the estimate"
                placeholderTextColor="#94a3b8"
                keyboardType="numbers-and-punctuation"
                onChangeText={text => update(draft.key, { labelDate: text.trim() || undefined })}
              />
              <ExpiryPreview draft={draft} />
            </Card>
          );
        })}

        <Button title="Add another item" icon="add" variant="outline" onPress={() => setDrafts(prev => [...prev, emptyDraft()])} style={{ marginTop: 12 }} />
        <Text style={[ui.muted, { marginTop: 16, fontSize: 12 }]}>{EXPIRY_DISCLAIMER}</Text>
      </ScrollView>

      <View style={local.footer}>
        <Button title="Retake" variant="ghost" icon="camera-outline" onPress={() => navigation.replace('Scan')} style={{ flex: 1 }} />
        <Button
          testID="confirm-save"
          title={`Save ${drafts.filter(d => d.name.trim()).length} item(s)`}
          icon="checkmark"
          onPress={save}
          style={{ flex: 1.4 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const local = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  demo: { backgroundColor: '#ede9fe', borderColor: '#c4b5fd', marginBottom: 12 },
  demoText: { color: '#5b21b6', fontWeight: '600' },
  card: { marginTop: 12 },
  lowCard: { borderColor: '#f59e0b', borderWidth: 2 },
  selectedCard: { borderColor: colours.primary, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  check: { padding: 6 },
  expiry: { marginTop: 8, fontSize: 13, fontWeight: '600', color: colours.primary },
  footer: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colours.border },
});
