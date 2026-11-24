import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { RankedRecipe } from '../../../shared/types';
import { Button, Card, Chip, colours, EmptyState, styles as ui } from '../components/ui';
import { useGenerateRecipe, useRecommendations } from '../hooks/useRecipes';
import { useInventoryStore } from '../store/inventoryStore';
import { useSessionStore } from '../store/sessionStore';

/** TheMealDB serves a small preview size; other sources' images are used as they are. */
const thumbFor = (url: string) => (url.includes('themealdb.com') ? `${url}/preview` : url);

export const RecipeCard = ({ recipe, onPress }: { recipe: RankedRecipe; onPress: () => void }) => (
  <Pressable onPress={onPress} accessibilityRole="button" testID={`recipe-${recipe.id}`}>
    <Card style={local.card}>
      <View style={local.cardTop}>
        {recipe.thumbnail ? <Image source={{ uri: thumbFor(recipe.thumbnail) }} style={local.thumb} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={local.title}>{recipe.title}</Text>
          <Text style={local.desc} numberOfLines={1}>
            {recipe.source === 'generated' ? '✨ AI-adapted · ' : ''}{recipe.description} · serves {recipe.servings}
          </Text>
        </View>
        <View style={[local.match, { backgroundColor: recipe.matchPercentage >= 75 ? '#dcfce7' : recipe.matchPercentage >= 40 ? '#fef3c7' : '#f1f5f9' }]}>
          <Text style={local.matchValue}>{recipe.matchPercentage}%</Text>
          <Text style={local.matchLabel}>match</Text>
        </View>
      </View>
      <View style={local.chips}>
        {recipe.expiringIngredients.map(name => (
          <Chip key={`e-${name}`} icon="flame" label={name} colour="#b91c1c" background="#fee2e2" />
        ))}
        {recipe.missingIngredients.slice(0, 4).map(name => (
          <Chip key={`m-${name}`} icon="cart-outline" label={name} colour="#92400e" background="#fef3c7" />
        ))}
        {recipe.missingIngredients.length > 4 && <Chip label={`+${recipe.missingIngredients.length - 4} missing`} />}
      </View>
    </Card>
  </Pressable>
);

/** Ranked suggestions with match %, expiring and missing ingredient chips. */
export default function RecipeListScreen() {
  const navigation = useNavigation();
  const itemCount = useInventoryStore(s => s.items.length);
  const generated = useSessionStore(s => s.generated);
  const recommendations = useRecommendations();
  const generate = useGenerateRecipe();
  const recipes = [...generated, ...(recommendations.data?.recipes || [])];

  const onGenerate = () => generate.mutate(undefined, {
    onSuccess: recipe => navigation.navigate('RecipeDetail', { recipeId: recipe.id }),
    onError: error => Alert.alert('Could not generate a recipe', (error as Error).message),
  });

  const header = (
    <View>
      <Text style={ui.muted}>
        Ranked by how much you already have (50%), how much expiring food they use (30%) and your taste (20%).
      </Text>
      {recommendations.data?.suggestGenerate && (
        <Card style={local.suggest}>
          <Text style={local.suggestText}>None of the stored recipes fit your pantry well. Let AI adapt one to what you have?</Text>
        </Card>
      )}
      {itemCount > 0 && (
        <Button
          title={generate.isPending ? 'Generating…' : 'Generate a recipe from my pantry'}
          icon="sparkles-outline"
          variant="ai"
          loading={generate.isPending}
          onPress={onGenerate}
          style={{ marginTop: 12, marginBottom: 4 }}
        />
      )}
      {recommendations.isError && (
        <Card style={[local.suggest, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
          <Text style={{ color: colours.danger }}>Couldn't load recipes: {(recommendations.error as Error).message}</Text>
        </Card>
      )}
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: colours.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32, flexGrow: 1 }}
      data={recipes}
      keyExtractor={r => r.id}
      ListHeaderComponent={header}
      renderItem={({ item }) => <RecipeCard recipe={item} onPress={() => navigation.navigate('RecipeDetail', { recipeId: item.id })} />}
      refreshControl={<RefreshControl refreshing={recommendations.isRefetching} onRefresh={() => { recommendations.refetch(); }} />}
      ListEmptyComponent={
        recommendations.isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : (
          <EmptyState
            icon="restaurant-outline"
            title={itemCount === 0 ? 'No ingredients yet' : 'No recipes found'}
            message={itemCount === 0 ? 'Add food to your pantry to get suggestions.' : 'Try generating one with AI, or add more ingredients.'}
          />
        )
      }
    />
  );
}

const local = StyleSheet.create({
  card: { marginTop: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#e2e8f0' },
  title: { fontSize: 16, fontWeight: '800', color: colours.text },
  desc: { fontSize: 13, color: colours.muted, marginTop: 2 },
  match: { alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  matchValue: { fontSize: 16, fontWeight: '800', color: colours.text },
  matchLabel: { fontSize: 10, color: colours.muted, fontWeight: '700', textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  suggest: { marginTop: 12, backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' },
  suggestText: { color: '#5b21b6', fontWeight: '600' },
});
