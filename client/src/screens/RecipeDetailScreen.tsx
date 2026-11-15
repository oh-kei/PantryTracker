import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { IngredientStatus, Substitution } from '../../../shared/types';
import { Button, Card, Chip, colours, EmptyState, SectionTitle, Stepper, styles as ui } from '../components/ui';
import { plannedUsage, Usage } from '../domain/inventory';
import { useSubstitutions } from '../hooks/useRecipes';
import type { RootStackParamList } from '../navigation/types';
import { useInventoryStore } from '../store/inventoryStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { useSessionStore } from '../store/sessionStore';

const STATUS: Record<IngredientStatus, { icon: keyof typeof Ionicons.glyphMap; colour: string; label: string }> = {
  expiring: { icon: 'flame', colour: '#dc2626', label: 'You have it — expiring soon' },
  owned: { icon: 'checkmark-circle', colour: '#16a34a', label: 'You have it' },
  missing: { icon: 'cart-outline', colour: '#d97706', label: 'Missing' },
  staple: { icon: 'ellipse-outline', colour: '#94a3b8', label: 'Pantry staple' },
};

type Decision = 'accepted' | 'rejected';
const subKey = (s: Substitution) => `${s.missing}→${s.substitute}`;

/** Recipe detail: steps, substitutions and "I cooked this" (proposal 6.4–6.7, 7). */
export default function RecipeDetailScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'RecipeDetail'>>();
  const recipe = useSessionStore(s => s.recipes[params.recipeId]);
  const inventory = useInventoryStore(s => s.items);
  const applyCooking = useInventoryStore(s => s.applyCooking);
  const recordCooked = usePreferencesStore(s => s.recordCooked);
  const substitutions = useSubstitutions(recipe);

  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  const [usages, setUsages] = useState<Usage[] | null>(null);

  useLayoutEffect(() => {
    if (recipe) navigation.setOptions({ title: recipe.source === 'generated' ? 'AI-adapted recipe' : 'Recipe' });
  }, [navigation, recipe]);

  const accepted = useMemo(
    () => (substitutions.data || []).filter(s => decisions[subKey(s)] === 'accepted'),
    [substitutions.data, decisions],
  );

  if (!recipe) {
    return <EmptyState icon="alert-circle-outline" title="Recipe not available" message="Go back and pick a recipe from the list." />;
  }

  const decide = (s: Substitution, decision: Decision) =>
    setDecisions(prev => {
      const next = { ...prev };
      // Only one accepted substitute per missing ingredient.
      if (decision === 'accepted') {
        (substitutions.data || []).filter(o => o.missing === s.missing).forEach(o => { if (next[subKey(o)] === 'accepted') delete next[subKey(o)]; });
      }
      if (prev[subKey(s)] === decision) delete next[subKey(s)];
      else next[subKey(s)] = decision;
      return next;
    });

  const startCooked = () => setUsages(plannedUsage(recipe, inventory, accepted));

  const finishCooked = () => {
    const used = (usages || []).filter(u => u.amount > 0);
    applyCooking(used);
    recordCooked(recipe.cuisine);
    setUsages(null);
    Alert.alert('Enjoy your meal!', used.length > 0 ? `Updated ${used.length} item(s) in your pantry.` : 'Nothing was deducted from your pantry.');
    navigation.goBack();
  };

  const missingSubs = (name: string) => (substitutions.data || []).filter(s => s.missing === name);

  return (
    <View style={{ flex: 1, backgroundColor: colours.bg }}>
      <ScrollView contentContainerStyle={local.content}>
        {recipe.thumbnail ? <Image source={{ uri: recipe.thumbnail }} style={local.hero} /> : null}
        <Text style={local.title}>{recipe.title}</Text>
        <Text style={ui.muted}>{recipe.description} · serves about {recipe.servings}</Text>

        <Card style={local.why}>
          <Text style={local.whyTitle}>Why this recipe</Text>
          <View style={local.chips}>
            <Chip label={`${recipe.matchPercentage}% of ingredients in stock`} />
            {recipe.expiringIngredients.length > 0 && (
              <Chip icon="flame" label={`Uses ${recipe.expiringIngredients.length} expiring item(s)`} colour="#b91c1c" background="#fee2e2" />
            )}
            {recipe.score.preference > 0 && <Chip icon="heart" label="Matches your taste" colour="#be185d" background="#fce7f3" />}
            <Chip label={`Score ${Math.round(recipe.score.total * 100)}`} />
          </View>
        </Card>

        <SectionTitle>Ingredients</SectionTitle>
        <Card style={{ padding: 0 }}>
          {recipe.ingredients.map((ingredient, index) => {
            const s = STATUS[ingredient.status];
            const options = ingredient.status === 'missing' ? missingSubs(ingredient.name) : [];
            return (
              <View key={`${ingredient.name}-${index}`} style={local.ingredient}>
                <View style={local.ingredientRow}>
                  <Ionicons name={s.icon} size={18} color={s.colour} accessibilityLabel={s.label} />
                  <Text style={local.ingredientName}>{ingredient.name}</Text>
                  <Text style={local.measure}>{ingredient.measure}</Text>
                </View>
                {options.map(option => {
                  const decision = decisions[subKey(option)];
                  return (
                    <View key={subKey(option)} style={[local.sub, decision === 'accepted' && local.subAccepted, decision === 'rejected' && local.subRejected]}>
                      <View style={{ flex: 1 }}>
                        <Text style={local.subText}>
                          Swap for <Text style={{ fontWeight: '800' }}>{option.substitute}</Text>
                          {option.fromInventory ? ' (in your pantry)' : ''}
                        </Text>
                        <Text style={local.subNote}>{option.role}{option.note ? ` · ${option.note}` : ''}{option.source === 'llm' ? ' · AI suggestion' : ''}</Text>
                      </View>
                      <Pressable accessibilityLabel={`Accept ${option.substitute}`} onPress={() => decide(option, 'accepted')} style={local.subButton}>
                        <Ionicons name={decision === 'accepted' ? 'checkmark-circle' : 'checkmark-circle-outline'} size={26} color={colours.success} />
                      </Pressable>
                      <Pressable accessibilityLabel={`Reject ${option.substitute}`} onPress={() => decide(option, 'rejected')} style={local.subButton}>
                        <Ionicons name={decision === 'rejected' ? 'close-circle' : 'close-circle-outline'} size={26} color={colours.danger} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            );
          })}
          {recipe.missingIngredients.length > 0 && substitutions.isLoading && (
            <View style={local.loadingSubs}><ActivityIndicator size="small" /><Text style={ui.muted}> Finding substitutes…</Text></View>
          )}
          {substitutions.isError && <Text style={[ui.muted, { padding: 12 }]}>Substitutions unavailable offline.</Text>}
        </Card>

        <SectionTitle right={<Text style={ui.muted}>{doneSteps.length}/{recipe.steps.length}</Text>}>Steps</SectionTitle>
        {recipe.steps.map((step, index) => {
          const done = doneSteps.includes(index);
          return (
            <Pressable
              key={index}
              onPress={() => setDoneSteps(prev => (done ? prev.filter(i => i !== index) : [...prev, index]))}
              style={[local.step, done && local.stepDone]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: done }}
            >
              <View style={[local.stepNumber, done && { backgroundColor: colours.success }]}>
                {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={local.stepNumberText}>{index + 1}</Text>}
              </View>
              <Text style={[local.stepText, done && { color: colours.muted, textDecorationLine: 'line-through' }]}>{step}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={local.footer}>
        <Button title="I cooked this" icon="checkmark-done" variant="success" onPress={startCooked} testID="cooked" />
      </View>

      <Modal visible={usages !== null} transparent animationType="slide" onRequestClose={() => setUsages(null)}>
        <View style={local.overlay}>
          <View style={local.sheet}>
            <Text style={local.sheetTitle}>Update your pantry</Text>
            <Text style={ui.muted}>How much of each item did you use? Set 0 to keep it.</Text>
            {(usages || []).length === 0 && <Text style={[ui.muted, { marginTop: 12 }]}>None of this recipe's ingredients are in your pantry.</Text>}
            {(usages || []).map(usage => {
              const item = inventory.find(i => i.id === usage.itemId);
              if (!item) return null;
              return (
                <View key={usage.itemId} style={local.usageRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={local.ingredientName}>{item.name}</Text>
                    <Text style={ui.muted}>have {item.quantity} {item.unit}</Text>
                  </View>
                  <Stepper
                    value={usage.amount}
                    min={0}
                    step={item.quantity % 1 === 0 ? 1 : 0.5}
                    onChange={amount => setUsages(prev => (prev || []).map(u => (u.itemId === usage.itemId ? { ...u, amount: Math.min(amount, item.quantity) } : u)))}
                  />
                  <Pressable onPress={() => setUsages(prev => (prev || []).map(u => (u.itemId === usage.itemId ? { ...u, amount: item.quantity } : u)))} style={{ marginLeft: 8 }}>
                    <Text style={{ color: colours.primary, fontWeight: '700' }}>All</Text>
                  </Pressable>
                </View>
              );
            })}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Button title="Cancel" variant="ghost" onPress={() => setUsages(null)} style={{ flex: 1 }} />
              <Button title="Confirm" variant="success" onPress={finishCooked} style={{ flex: 1 }} testID="confirm-cooked" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const local = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  hero: { width: '100%', height: 180, borderRadius: 16, marginBottom: 14, backgroundColor: '#e2e8f0' },
  title: { fontSize: 24, fontWeight: '800', color: colours.text, marginBottom: 4 },
  why: { marginTop: 14 },
  whyTitle: { fontWeight: '800', color: colours.text, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  ingredient: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colours.border },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ingredientName: { flex: 1, fontSize: 15, fontWeight: '600', color: colours.text },
  measure: { fontSize: 13, color: colours.muted },
  sub: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 28, padding: 8, borderRadius: 10, backgroundColor: '#f8fafc' },
  subAccepted: { backgroundColor: '#dcfce7' },
  subRejected: { opacity: 0.45 },
  subText: { fontSize: 13, color: colours.text },
  subNote: { fontSize: 12, color: colours.muted, marginTop: 2 },
  subButton: { paddingHorizontal: 4 },
  loadingSubs: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  step: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colours.border },
  stepDone: { backgroundColor: '#f8fafc' },
  stepNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: colours.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  stepText: { flex: 1, fontSize: 15, lineHeight: 22, color: colours.text },
  footer: { padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colours.border },
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, maxHeight: '80%' },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colours.text, marginBottom: 4 },
  usageRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
});
