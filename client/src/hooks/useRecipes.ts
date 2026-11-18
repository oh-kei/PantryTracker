import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { RankedRecipe } from '../../../shared/types';
import { api } from '../data/api';
import { toRecipeInventory } from '../domain/inventory';
import { useInventoryStore } from '../store/inventoryStore';
import { usePreferencesStore } from '../store/preferencesStore';
import { useSessionStore } from '../store/sessionStore';

const useRecipeInputs = () => {
  const items = useInventoryStore(s => s.items);
  const preferences = usePreferencesStore(s => s.preferences);
  const inventory = useMemo(() => toRecipeInventory(items), [items]);
  // Only the fields the engine uses go in the cache key, so editing a quantity doesn't refetch.
  const signature = useMemo(
    () => inventory.map(i => `${i.canonicalId}:${i.expiryDate}`).sort().join('|'),
    [inventory],
  );
  return { inventory, preferences, signature };
};

/** Ranked recommendations from the backend, cached with TanStack Query. */
export const useRecommendations = () => {
  const { inventory, preferences, signature } = useRecipeInputs();
  const rememberRecipes = useSessionStore(s => s.rememberRecipes);
  const query = useQuery({
    queryKey: ['recommendations', signature, preferences.allergens, preferences.diet, preferences.favouriteCuisines, preferences.cuisineHistory],
    queryFn: () => api.recommend(inventory, preferences),
    enabled: inventory.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (query.data) rememberRecipes(query.data.recipes);
  }, [query.data, rememberRecipes]);
  return query;
};

/** LLM adaptation of a recipe to the current inventory (proposal 6.6). */
export const useGenerateRecipe = () => {
  const { inventory, preferences } = useRecipeInputs();
  const addGenerated = useSessionStore(s => s.addGenerated);
  return useMutation({
    mutationFn: () => api.generate(inventory, preferences),
    onSuccess: (recipe: RankedRecipe) => addGenerated(recipe),
  });
};

/** Substitution suggestions for a recipe's missing ingredients (proposal 6.5). */
export const useSubstitutions = (recipe: RankedRecipe | undefined) => {
  const { inventory, preferences } = useRecipeInputs();
  const missing = recipe?.missingIngredients || [];
  return useQuery({
    queryKey: ['substitutions', recipe?.id, missing, preferences.allergens, preferences.diet],
    queryFn: () => api.substitutions(missing, inventory, preferences, recipe?.title),
    enabled: missing.length > 0,
    staleTime: 30 * 60_000,
    retry: 1,
  });
};
