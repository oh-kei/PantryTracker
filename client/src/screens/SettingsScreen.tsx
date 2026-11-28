import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chip, colours, SectionTitle, styles as ui } from '../components/ui';
import { API_BASE_URL } from '../config';
import { api } from '../data/api';
import { EXPIRY_DISCLAIMER } from '../domain/expiry';
import { useInventoryStore } from '../store/inventoryStore';
import { ALLERGENS, CUISINES, DIETS, usePreferencesStore } from '../store/preferencesStore';

/** Preferences used by the feasibility filter and ranking, plus privacy controls. */
export default function SettingsScreen() {
  const preferences = usePreferencesStore(s => s.preferences);
  const toggleAllergen = usePreferencesStore(s => s.toggleAllergen);
  const setDiet = usePreferencesStore(s => s.setDiet);
  const toggleCuisine = usePreferencesStore(s => s.toggleCuisine);
  const resetPreferences = usePreferencesStore(s => s.reset);
  const clearInventory = useInventoryStore(s => s.clear);
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, retry: 0, staleTime: 60_000 });

  const deleteAll = () => {
    Alert.alert(
      'Delete all your data?',
      'This removes your whole inventory, preferences and cooking history from this phone and from the server. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            clearInventory();
            resetPreferences();
            queryClient.clear();
            try {
              await api.deleteAllData();
              Alert.alert('Deleted', 'All your data has been removed.');
            } catch (error) {
              Alert.alert('Deleted on this phone', `The server could not be reached (${(error as Error).message}). Try again when online to remove the server copy.`);
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const historyEntries = Object.entries(preferences.cuisineHistory).sort((a, b) => b[1] - a[1]);

  return (
    <ScrollView style={{ backgroundColor: colours.bg }} contentContainerStyle={local.content}>
      <SectionTitle>Allergies</SectionTitle>
      <Text style={ui.muted}>Recipes containing these are never suggested.</Text>
      <View style={local.chips}>
        {ALLERGENS.map(allergen => (
          <Chip key={allergen} label={allergen} selected={preferences.allergens.includes(allergen)} onPress={() => toggleAllergen(allergen)} />
        ))}
      </View>

      <SectionTitle>Diet</SectionTitle>
      <View style={local.chips}>
        {DIETS.map(diet => (
          <Chip key={diet} label={diet === 'none' ? 'No restriction' : diet} selected={preferences.diet === diet} onPress={() => setDiet(diet)} />
        ))}
      </View>

      <SectionTitle>Favourite cuisines</SectionTitle>
      <Text style={ui.muted}>Boosts these in your recommendations, together with what you cook most.</Text>
      <View style={local.chips}>
        {CUISINES.map(cuisine => (
          <Chip key={cuisine} label={cuisine} selected={preferences.favouriteCuisines.includes(cuisine)} onPress={() => toggleCuisine(cuisine)} />
        ))}
      </View>
      {historyEntries.length > 0 && (
        <Text style={[ui.muted, { marginTop: 4 }]}>
          Cooked so far: {historyEntries.map(([cuisine, count]) => `${cuisine} ×${count}`).join(', ')}
        </Text>
      )}

      <SectionTitle>Food safety</SectionTitle>
      <Card><Text style={ui.muted}>{EXPIRY_DISCLAIMER}</Text></Card>

      <SectionTitle>Privacy</SectionTitle>
      <Card>
        <Text style={ui.muted}>
          Fridge photos are sent to the server only to recognise food, then discarded — they are never stored.
          Your inventory is kept on this phone and backed up to your account.
        </Text>
        <Button title="Delete all my data" icon="trash-outline" variant="danger" onPress={deleteAll} loading={deleting} style={{ marginTop: 14 }} />
      </Card>

      <SectionTitle>Server</SectionTitle>
      <Card>
        <Text style={local.mono}>{API_BASE_URL}</Text>
        <Text style={[ui.muted, { marginTop: 6 }]}>
          {health.isLoading
            ? 'Checking…'
            : health.isError
              ? 'Offline — manual entry still works; changes will sync later.'
              : `Connected · vision: ${health.data?.vision || 'off'} · AI recipes: ${health.data?.text || 'off'}`}
        </Text>
      </Card>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  mono: { fontFamily: 'monospace', fontSize: 13, color: colours.text },
});
