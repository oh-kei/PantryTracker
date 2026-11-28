import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { MealType } from '../../../shared/types';
import { Button, Chip, colours, UrgencyBadge, styles as ui } from '../components/ui';
import { urgencyOf } from '../domain/expiry';
import { sortByExpiry } from '../domain/inventory';
import { useGenerateRecipe } from '../hooks/useRecipes';
import type { RootStackParamList } from '../navigation/types';
import { useInventoryStore } from '../store/inventoryStore';
import { GenerateChoices, useSessionStore } from '../store/sessionStore';

const MEALS: { label: string; value?: MealType }[] = [
  { label: 'Any meal' }, { label: 'Breakfast', value: 'breakfast' }, { label: 'Lunch', value: 'lunch' },
  { label: 'Dinner', value: 'dinner' }, { label: 'Snack', value: 'snack' },
];
const TIMES: { label: string; value?: number }[] = [
  { label: 'Any time' }, { label: '15 min', value: 15 }, { label: '30 min', value: 30 }, { label: '1 hour', value: 60 },
];
const MAX_MUST_USE = 5;

/**
 * Options for an AI recipe: which ingredients it may use, which it must use,
 * meal type and time. Choices are remembered for the session.
 */
export default function GenerateScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const items = sortByExpiry(useInventoryStore(s => s.items));
  const choices = useSessionStore(s => s.generateChoices);
  const setChoices = useSessionStore(s => s.setGenerateChoices);
  const generate = useGenerateRecipe();

  const ids = new Set(items.map(i => i.id));
  // Forget choices for food that has since been used up or deleted.
  const excluded = new Set(choices.excluded.filter(id => ids.has(id)));
  const mustUse = new Set(choices.mustUse.filter(id => ids.has(id)));
  const included = items.filter(i => !excluded.has(i.id));

  const save = (patch: Partial<GenerateChoices>) =>
    setChoices({ excluded: [...excluded], mustUse: [...mustUse], mealType: choices.mealType, maxMinutes: choices.maxMinutes, ...patch });

  const toggleIncluded = (id: string) => {
    if (excluded.has(id)) excluded.delete(id);
    else { excluded.add(id); mustUse.delete(id); }
    save({});
  };
  const toggleMustUse = (id: string) => {
    if (mustUse.has(id)) mustUse.delete(id);
    else if (mustUse.size >= MAX_MUST_USE) return Alert.alert('Must use', `You can star up to ${MAX_MUST_USE} items.`);
    else { mustUse.add(id); excluded.delete(id); }
    save({});
  };
  const selectAll = () => save({ excluded: [] });
  const deselectAll = () => save({ excluded: items.map(i => i.id), mustUse: [] });
  const expiringOnly = () => save({ excluded: items.filter(i => urgencyOf(i) === 'SAFE' && !mustUse.has(i.id)).map(i => i.id) });

  const onGenerate = () => generate.mutate(
    { include: included.map(i => i.id), mustUse: [...mustUse], mealType: choices.mealType, maxMinutes: choices.maxMinutes },
    {
      onSuccess: recipe => navigation.replace('RecipeDetail', { recipeId: recipe.id }),
      onError: error => Alert.alert('Could not generate a recipe', (error as Error).message),
    },
  );

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <ScrollView contentContainerStyle={local.content}>
        <Text style={ui.label}>Meal</Text>
        <View style={local.chips}>
          {MEALS.map(m => (
            <Chip key={m.label} label={m.label} selected={choices.mealType === m.value} onPress={() => save({ mealType: m.value })} />
          ))}
        </View>

        <Text style={ui.label}>Time</Text>
        <View style={local.chips}>
          {TIMES.map(t => (
            <Chip key={t.label} label={t.label} selected={choices.maxMinutes === t.value} onPress={() => save({ maxMinutes: t.value })} />
          ))}
        </View>

        <Text style={ui.label}>Ingredients ({included.length} of {items.length})</Text>
        <Text style={ui.muted}>Tick what the recipe can use. Star anything it must be built around.</Text>
        <View style={[local.chips, { marginTop: 8 }]}>
          <Chip label="Select all" icon="checkmark-done-outline" onPress={selectAll} />
          <Chip label="Deselect all" icon="close-outline" onPress={deselectAll} />
          <Chip label="Expiring soon only" icon="time-outline" onPress={expiringOnly} />
        </View>

        <View style={local.list}>
          {items.map(item => {
            const on = !excluded.has(item.id);
            const starred = mustUse.has(item.id);
            return (
              <View key={item.id} style={local.row}>
                <Pressable
                  testID={`include-${item.name}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`Use ${item.name}`}
                  onPress={() => toggleIncluded(item.id)}
                  style={local.rowMain}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={24} color={on ? colours.primary : colours.muted} />
                  <Text style={[local.name, !on && { color: colours.muted }]} numberOfLines={1}>{item.name}</Text>
                  <UrgencyBadge item={item} />
                </Pressable>
                <Pressable
                  testID={`must-${item.name}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: starred }}
                  accessibilityLabel={`${starred ? 'Stop requiring' : 'Must use'} ${item.name}`}
                  onPress={() => toggleMustUse(item.id)}
                  hitSlop={8}
                  style={local.star}
                >
                  <Ionicons name={starred ? 'star' : 'star-outline'} size={22} color={starred ? '#f59e0b' : colours.muted} />
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={local.footer}>
        {mustUse.size > 0 && (
          <Text style={local.summary} numberOfLines={2}>
            Must use: {items.filter(i => mustUse.has(i.id)).map(i => i.name).join(', ')}
          </Text>
        )}
        <Button
          testID="generate"
          title={generate.isPending ? 'Generating… (up to a minute)' : `Generate with ${included.length} ingredient${included.length === 1 ? '' : 's'}`}
          icon="sparkles-outline"
          variant="ai"
          loading={generate.isPending}
          disabled={included.length === 0}
          onPress={onGenerate}
        />
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { marginTop: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: colours.border },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colours.border },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingLeft: 12 },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: colours.text },
  star: { paddingHorizontal: 14, paddingVertical: 12 },
  summary: { fontSize: 13, color: '#92400e', marginBottom: 8 },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colours.border },
});
