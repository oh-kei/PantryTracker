import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ShelfLifeEstimate } from '../../../shared/types';
import { ExpiryDateField } from '../components/ExpiryDateField';
import { UnitPicker } from '../components/UnitPicker';
import { Button, Card, Chip, colours, StorageSelector, Stepper, styles as ui } from '../components/ui';
import { LOW_CONFIDENCE } from '../config';
import { api } from '../data/api';
import { daysUntil, EXPIRY_DISCLAIMER, estimateExpiry, isValidDate, todayString } from '../domain/expiry';
import { DraftItem, draftFromDetection, draftToItem, duplicateOf, mergeDrafts, newId, rangeFor, RecentFood } from '../domain/inventory';
import { minFor, quantityForUnit, stepFor } from '../domain/units';
import type { RootStackParamList } from '../navigation/types';
import { useInventoryStore } from '../store/inventoryStore';
import { useSessionStore } from '../store/sessionStore';

/** Wait this long after the last keystroke before looking up a name. */
const SUGGEST_DELAY_MS = 250;
const LOOKUP_DELAY_MS = 600;

const formatShort = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

const emptyDraft = (storageLocation: DraftItem['storageLocation'] = 'FRIDGE'): DraftItem => ({
  key: newId('draft'),
  name: '',
  canonicalId: '',
  category: 'Other',
  quantity: 1,
  unit: 'unit',
  storageLocation,
  ranges: null,
});

/** Apply a shelf-life lookup to a draft; the user's own storage choice wins. */
const withEstimate = (draft: DraftItem, estimate: ShelfLifeEstimate): DraftItem => ({
  ...draft,
  canonicalId: estimate.canonicalId,
  category: estimate.category,
  ranges: estimate.ranges,
  estimateSource: estimate.source,
  storageLocation: draft.storageTouched ? draft.storageLocation : estimate.defaultStorage,
});

const ExpiryPreview = ({ draft, pending }: { draft: DraftItem; pending: boolean }) => {
  if (draft.labelDate && isValidDate(draft.labelDate)) {
    return <Text style={local.expiry}>Using the printed date: {formatShort(draft.labelDate)} ({daysUntil(draft.labelDate)} days)</Text>;
  }
  if (!draft.name.trim()) return null;
  if (pending) {
    return <Text style={[local.expiry, { color: colours.muted }]}>Working out the shelf life…</Text>;
  }
  const range = draft.ranges ? rangeFor(draft.ranges, draft.storageLocation) : null;
  if (draft.ranges && !range) {
    return <Text style={[local.expiry, { color: colours.danger }]}>Not recommended to store here — pick another location.</Text>;
  }
  const window = estimateExpiry(todayString(), range);
  return (
    <Text style={local.expiry}>
      Estimated expiry: {formatShort(window.earliest)} – {formatShort(window.latest)}
      {!draft.ranges || draft.estimateSource === 'category-fallback' ? ' (generic estimate for this type of food)' : ''}
      {draft.estimateSource === 'ai-estimate' ? ' (AI estimate: not in our shelf-life table)' : ''}
      {draft.ripeness === 'overripe' ? ' · shortened because it looks overripe' : ''}
      {draft.ripeness === 'unripe' ? ' · a few extra days because it looks unripe' : ''}
    </Text>
  );
};

/** Scan & confirm (proposal 4.3): only items the user confirms are saved. Also used for manual entry. */
export default function ConfirmationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Confirm'>>();
  const scan = useSessionStore(s => s.scan);
  const setScan = useSessionStore(s => s.setScan);
  const addItems = useInventoryStore(s => s.addItems);
  const recent = useInventoryStore(s => s.recent);

  const [drafts, setDrafts] = useState<DraftItem[]>(() => {
    const fromScan = (scan?.items || []).map(draftFromDetection);
    return fromScan.length > 0 || !route.params?.manual ? fromScan : [emptyDraft()];
  });
  const [lookingUp, setLookingUp] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<{ key: string; items: ShelfLifeEstimate[] } | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const manual = !scan || scan.items.length === 0;

  const lookupTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    lookupTimers.current.forEach(clearTimeout);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
  }, []);

  const update = (key: string, patch: Partial<DraftItem>) =>
    setDrafts(prev => prev.map(d => (d.key === key ? { ...d, ...patch } : d)));
  const remove = (key: string) => setDrafts(prev => prev.filter(d => d.key !== key));

  /** Look a name up in the shelf-life table (or AI estimate) and apply it if the name hasn't changed since. */
  const markPending = (key: string, on: boolean) =>
    setLookingUp(prev => (on ? (prev.includes(key) ? prev : [...prev, key]) : prev.filter(k => k !== key)));

  const lookup = async (key: string, name: string) => {
    try {
      const estimate = await api.shelfLife(name);
      setDrafts(prev => prev.map(d => (d.key === key && d.name.trim() === name ? withEstimate(d, estimate) : d)));
    } catch {
      // Offline: the generic estimate stays; the user can set the printed date.
    } finally {
      markPending(key, false);
    }
  };

  const onNameChange = (draft: DraftItem, name: string) => {
    // The old shelf-life data belonged to the old name, so drop it until the new lookup lands.
    update(draft.key, { name, canonicalId: '', category: 'Other', ranges: null, estimateSource: undefined, ripeness: undefined });
    const trimmed = name.trim();
    clearTimeout(lookupTimers.current.get(draft.key));
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (trimmed.length < 2) {
      setSuggestions(null);
      markPending(draft.key, false);
      return;
    }
    markPending(draft.key, true);
    suggestTimer.current = setTimeout(() => {
      api.suggestIngredients(trimmed)
        .then(result => setSuggestions({ key: draft.key, items: result.items }))
        .catch(() => setSuggestions(null));
    }, SUGGEST_DELAY_MS);
    lookupTimers.current.set(draft.key, setTimeout(() => { void lookup(draft.key, trimmed); }, LOOKUP_DELAY_MS));
  };

  const pickSuggestion = (draft: DraftItem, estimate: ShelfLifeEstimate) => {
    clearTimeout(lookupTimers.current.get(draft.key));
    markPending(draft.key, false);
    setDrafts(prev => prev.map(d => (d.key === draft.key ? withEstimate({ ...d, name: estimate.name }, estimate) : d)));
    setSuggestions(null);
    Keyboard.dismiss();
  };

  const addDraft = () => {
    const next = emptyDraft(drafts.at(-1)?.storageLocation);
    setDrafts(prev => [...prev, next]);
    setFocusKey(next.key);
  };

  /** One tap on a recently added food: fill the empty card (or add one) and look up its shelf life straight away. */
  const addRecent = (food: RecentFood) => {
    const blank = drafts.find(d => !d.name.trim());
    const draft: DraftItem = {
      ...(blank || emptyDraft()),
      name: food.name,
      canonicalId: food.canonicalId,
      category: food.category,
      quantity: food.quantity,
      unit: food.unit,
      storageLocation: food.storageLocation,
      storageTouched: true,
      ranges: null,
    };
    setDrafts(prev => (blank ? prev.map(d => (d.key === blank.key ? draft : d)) : [...prev, draft]));
    setSuggestions(null);
    Keyboard.dismiss();
    markPending(draft.key, true);
    void lookup(draft.key, food.name);
  };

  const listed = new Set(drafts.map(d => d.name.trim().toLowerCase()));
  const recentToShow = manual ? recent.filter(food => !listed.has(food.name.toLowerCase())) : [];

  const save = async () => {
    lookupTimers.current.forEach(clearTimeout);
    setLookingUp([]);
    let valid = drafts.filter(d => d.name.trim());
    // Never save a food with the generic fallback just because its lookup hadn't finished.
    const unresolved = valid.filter(d => !d.ranges && !d.labelDate);
    if (unresolved.length > 0) {
      setSaving(true);
      const results = await Promise.all(unresolved.map(d => api.shelfLife(d.name.trim()).catch(() => null)));
      setSaving(false);
      valid = valid.map(d => {
        const result = results[unresolved.indexOf(d)];
        return result ? withEstimate(d, result) : d;
      });
      setDrafts(prev => prev.map(d => valid.find(v => v.key === d.key) || d));
    }
    const badDate = valid.find(d => d.labelDate && !isValidDate(d.labelDate));
    if (badDate) {
      Alert.alert('Check the printed date', `"${badDate.labelDate}" for ${badDate.name} isn't a valid date.`);
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
            <Text style={local.demoText}>Demo mode: the backend has no AI key, so these are sample detections.</Text>
          </Card>
        )}
        <Text style={ui.muted}>
          {manual
            ? 'Start typing a food and pick it from the list: its storage and shelf life fill in automatically.'
            : 'Check what was detected. Fix names, amounts and storage, and remove mistakes. Items with low confidence are highlighted.'}
        </Text>

        {recentToShow.length > 0 && (
          <View style={local.recent}>
            <Text style={ui.label}>Recently added</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
              {recentToShow.map(food => (
                <Pressable
                  key={food.canonicalId || food.name}
                  testID={`recent-${food.name}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${food.name} again`}
                  onPress={() => addRecent(food)}
                  style={local.recentChip}
                >
                  <Ionicons name="add" size={16} color={colours.primary} />
                  <Text style={local.recentText}>{food.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {drafts.map(draft => {
          const low = draft.confidence !== undefined && draft.confidence < LOW_CONFIDENCE;
          const duplicate = duplicateOf(drafts, draft);
          const pending = lookingUp.includes(draft.key);
          const shown = suggestions?.key === draft.key
            ? suggestions.items.filter(s => s.name.toLowerCase() !== draft.name.trim().toLowerCase() || !draft.ranges)
            : [];
          return (
            <Card key={draft.key} style={[local.card, low && local.lowCard]}>
              <View style={local.row}>
                <TextInput
                  testID={`name-${draft.key}`}
                  style={[ui.input, { flex: 1 }]}
                  value={draft.name}
                  placeholder="Food name, e.g. spinach"
                  placeholderTextColor="#94a3b8"
                  autoFocus={focusKey === draft.key || (manual && drafts.length === 1 && !draft.name)}
                  autoCorrect={false}
                  returnKeyType="done"
                  onChangeText={name => onNameChange(draft, name)}
                  onBlur={() => setSuggestions(cur => (cur?.key === draft.key ? null : cur))}
                />
                <Pressable accessibilityLabel={`Remove ${draft.name || 'item'}`} onPress={() => remove(draft.key)} style={local.icon}>
                  <Ionicons name="trash-outline" size={22} color={colours.danger} />
                </Pressable>
              </View>

              {shown.length > 0 && (
                <View style={local.suggestions}>
                  {shown.slice(0, 5).map(s => (
                    <Pressable key={s.canonicalId} accessibilityRole="button" onPress={() => pickSuggestion(draft, s)} style={local.suggestion}>
                      <Text style={local.suggestionName}>{s.name}</Text>
                      <Text style={local.suggestionMeta}>{s.category} · {s.defaultStorage.toLowerCase()}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {duplicate && (
                <View style={local.duplicate}>
                  <Ionicons name="copy-outline" size={16} color="#b45309" />
                  <Text style={local.duplicateText}>Already listed above as {duplicate.name}.</Text>
                  <Pressable accessibilityRole="button" onPress={() => setDrafts(prev => mergeDrafts(prev, [duplicate.key, draft.key]))}>
                    <Text style={local.duplicateAction}>Merge</Text>
                  </Pressable>
                </View>
              )}

              <View style={[local.row, { marginTop: 8, flexWrap: 'wrap', gap: 6 }]}>
                {draft.confidence !== undefined && (
                  <Chip
                    icon={low ? 'alert-circle' : 'checkmark-circle'}
                    label={`${Math.round(draft.confidence * 100)}% confident${low ? ' — please check' : ''}`}
                    colour={low ? '#b45309' : '#15803d'}
                    background={low ? '#fef3c7' : '#dcfce7'}
                  />
                )}
                {draft.group && <Chip icon="cube-outline" label={draft.group} />}
                {draft.category !== 'Other' && !pending && <Chip label={draft.category} />}
                {draft.ripeness && draft.ripeness !== 'ripe' && (
                  <Chip icon="leaf-outline" label={draft.ripeness === 'overripe' ? 'Looks overripe' : 'Looks unripe'} colour="#b45309" background="#fef3c7" />
                )}
                {draft.estimateSource === 'ai-estimate' && <Chip icon="sparkles-outline" label="AI shelf-life estimate" colour={colours.ai} background="#ede9fe" />}
              </View>

              <Text style={ui.label}>Amount</Text>
              <Stepper
                value={draft.quantity}
                min={minFor(draft.unit)}
                step={stepFor(draft.unit)}
                onChange={quantity => update(draft.key, { quantity })}
              />
              <View style={{ marginTop: 8 }}>
                <UnitPicker
                  value={draft.unit}
                  onChange={unit => update(draft.key, { unit, quantity: quantityForUnit(draft.quantity, draft.unit, unit) })}
                />
              </View>

              <Text style={ui.label}>Storage</Text>
              <StorageSelector value={draft.storageLocation} onChange={storageLocation => update(draft.key, { storageLocation, storageTouched: true })} />

              <Text style={ui.label}>Printed expiry date (optional)</Text>
              <ExpiryDateField
                testID={`expiry-${draft.key}`}
                value={draft.labelDate}
                fromPhoto={draft.labelFromPhoto}
                onChange={labelDate => update(draft.key, { labelDate, labelFromPhoto: false })}
              />
              <ExpiryPreview draft={draft} pending={pending} />
            </Card>
          );
        })}

        <Button title="Add another item" icon="add" variant="outline" onPress={addDraft} style={{ marginTop: 12 }} />
        <Text style={[ui.muted, { marginTop: 16, fontSize: 12 }]}>{EXPIRY_DISCLAIMER}</Text>
      </ScrollView>

      <View style={local.footer}>
        <Button title={manual ? 'Scan instead' : 'Retake'} variant="ghost" icon="camera-outline" onPress={() => navigation.replace('Scan')} style={{ flex: 1 }} />
        <Button
          testID="confirm-save"
          title={`Save ${drafts.filter(d => d.name.trim()).length} item(s)`}
          icon="checkmark"
          loading={saving}
          onPress={() => { void save(); }}
          style={{ flex: 1.4 }}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const local = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  recent: { marginTop: 4 },
  recentChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colours.border, backgroundColor: '#fff' },
  recentText: { color: colours.text, fontWeight: '600' },
  demo: { backgroundColor: '#ede9fe', borderColor: '#c4b5fd', marginBottom: 12 },
  demoText: { color: '#5b21b6', fontWeight: '600' },
  card: { marginTop: 12 },
  lowCard: { borderColor: '#f59e0b', borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { padding: 6, marginLeft: 4 },
  suggestions: { marginTop: 4, borderWidth: 1, borderColor: colours.border, borderRadius: 10, overflow: 'hidden' },
  suggestion: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colours.border, backgroundColor: '#fff' },
  suggestionName: { fontSize: 15, fontWeight: '600', color: colours.text },
  suggestionMeta: { fontSize: 12, color: colours.muted, marginTop: 2 },
  duplicate: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: '#fef3c7' },
  duplicateText: { flex: 1, color: '#92400e', fontSize: 13 },
  duplicateAction: { color: colours.primary, fontWeight: '700' },
  expiry: { marginTop: 8, fontSize: 13, fontWeight: '600', color: colours.primary },
  footer: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colours.border },
});
