import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RankedRecipe } from '../../../shared/types';
import { Button, Card, colours, SectionTitle, styles as ui, UrgencyBadge } from '../components/ui';
import { urgencyOf } from '../domain/expiry';
import { sortByExpiry } from '../domain/inventory';
import { useRecommendations } from '../hooks/useRecipes';
import { useInventoryStore } from '../store/inventoryStore';

export const RecipeRow = ({ recipe, onPress }: { recipe: RankedRecipe; onPress: () => void }) => (
  <Pressable onPress={onPress} style={local.recipeRow} accessibilityRole="button">
    <View style={{ flex: 1 }}>
      <Text style={local.recipeTitle} numberOfLines={1}>{recipe.title}</Text>
      <Text style={local.recipeMeta} numberOfLines={1}>
        {recipe.matchPercentage}% match
        {recipe.expiringIngredients.length > 0 ? ` · uses ${recipe.expiringIngredients.slice(0, 2).join(', ')}` : ''}
      </Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
  </Pressable>
);

/** Dashboard: expiring-soon summary, quick scan, and today's top suggestions. */
export default function HomeScreen() {
  const navigation = useNavigation();
  const items = useInventoryStore(s => s.items);
  const atRisk = sortByExpiry(items.filter(i => urgencyOf(i) !== 'SAFE'));
  const urgent = atRisk.filter(i => urgencyOf(i) === 'URGENT').length;
  const recommendations = useRecommendations();
  const top = recommendations.data?.recipes.slice(0, 3) || [];

  return (
    <ScrollView style={{ backgroundColor: colours.bg }} contentContainerStyle={local.content}>
      <Card style={[local.summary, atRisk.length > 0 ? local.summaryAlert : local.summaryOk]}>
        <Text style={local.summaryTitle}>
          {items.length === 0
            ? 'Start by scanning your fridge'
            : atRisk.length === 0
              ? 'Everything is fresh 🎉'
              : `${atRisk.length} item${atRisk.length === 1 ? '' : 's'} expiring soon`}
        </Text>
        {urgent > 0 && <Text style={local.summaryText}>{urgent} need using in the next 2 days.</Text>}
        {atRisk.slice(0, 4).map(item => (
          <View key={item.id} style={local.riskRow}>
            <Text style={local.riskName}>{item.name}</Text>
            <UrgencyBadge item={item} />
          </View>
        ))}
        {atRisk.length > 4 && (
          <Pressable onPress={() => navigation.navigate('Tabs', { screen: 'Inventory' })}>
            <Text style={local.more}>See all {atRisk.length} →</Text>
          </Pressable>
        )}
        <Button title="Scan fridge or food" icon="camera" onPress={() => navigation.navigate('Scan')} style={{ marginTop: 14 }} testID="quick-scan" />
      </Card>

      <View style={local.stats}>
        <Pressable style={local.stat} onPress={() => navigation.navigate('Tabs', { screen: 'Inventory' })}>
          <Ionicons name="basket" size={22} color={colours.primary} />
          <Text style={local.statValue}>{items.length}</Text>
          <Text style={local.statLabel}>in pantry</Text>
        </Pressable>
        <Pressable style={local.stat} onPress={() => navigation.navigate('Tabs', { screen: 'Recipes' })}>
          <Ionicons name="restaurant" size={22} color={colours.success} />
          <Text style={local.statValue}>{recommendations.data?.recipes.length ?? '–'}</Text>
          <Text style={local.statLabel}>recipes</Text>
        </Pressable>
      </View>

      <SectionTitle right={top.length > 0 ? <Pressable onPress={() => navigation.navigate('Tabs', { screen: 'Recipes' })}><Text style={local.more}>All →</Text></Pressable> : undefined}>
        Today's top suggestions
      </SectionTitle>
      <Card style={{ padding: 0 }}>
        {items.length === 0 ? (
          <Text style={[ui.muted, { padding: 16 }]}>Add some food to get recipe ideas that use up what expires first.</Text>
        ) : recommendations.isLoading ? (
          <ActivityIndicator style={{ padding: 20 }} />
        ) : recommendations.isError ? (
          <Text style={[ui.muted, { padding: 16 }]}>Couldn't load recipes: {(recommendations.error as Error).message}</Text>
        ) : top.length === 0 ? (
          <Text style={[ui.muted, { padding: 16 }]}>No matching recipes yet — try generating one on the Recipes tab.</Text>
        ) : (
          top.map(recipe => (
            <RecipeRow key={recipe.id} recipe={recipe} onPress={() => navigation.navigate('RecipeDetail', { recipeId: recipe.id })} />
          ))
        )}
      </Card>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  summary: { borderWidth: 0 },
  summaryAlert: { backgroundColor: '#fff7ed' },
  summaryOk: { backgroundColor: '#f0fdf4' },
  summaryTitle: { fontSize: 20, fontWeight: '800', color: colours.text },
  summaryText: { fontSize: 14, color: '#9a3412', marginTop: 4, marginBottom: 4 },
  riskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  riskName: { fontSize: 15, fontWeight: '600', color: colours.text, flex: 1, marginRight: 8 },
  more: { color: colours.primary, fontWeight: '700', marginTop: 8 },
  stats: { flexDirection: 'row', gap: 12, marginTop: 14 },
  stat: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colours.border, alignItems: 'flex-start' },
  statValue: { fontSize: 22, fontWeight: '800', color: colours.text, marginTop: 6 },
  statLabel: { fontSize: 13, color: colours.muted },
  recipeRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colours.border },
  recipeTitle: { fontSize: 15, fontWeight: '700', color: colours.text },
  recipeMeta: { fontSize: 13, color: colours.muted, marginTop: 2 },
});
