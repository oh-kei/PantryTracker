import type {
  RankedRecipe,
  RecipeIngredient,
  RecipeInventoryItem,
  RecipeScore,
  UserPreferences,
} from '../../../shared/types';
import { isRecipeFeasible } from './dietary';
import { urgencyTier, urgencyWeight } from './expiry';
import { ingredientsMatch, normaliseIngredient } from './normalise';
import type { Taxonomy } from './taxonomy';

/** A recipe from the database (or the LLM) before it is matched against an inventory. */
export interface RecipeCandidate {
  id: string;
  title: string;
  description: string;
  cuisine?: string;
  category?: string;
  thumbnail?: string;
  source: 'database' | 'generated';
  servings: number;
  ingredients: Array<{ name: string; measure: string }>;
  steps: string[];
}

export interface RankingWeights {
  coverage: number;
  urgency: number;
  preference: number;
}

/** Initial weights from the proposal (section 6.3); tune during evaluation. */
export const DEFAULT_WEIGHTS: RankingWeights = { coverage: 0.5, urgency: 0.3, preference: 0.2 };

/** Ingredients everyone is assumed to have; they never count as missing or towards coverage. */
const STAPLES = ['salt', 'black pepper', 'pepper', 'water', 'olive oil', 'vegetable oil', 'oil', 'sunflower oil', 'ice'];

export const isStaple = (ingredient: string): boolean => {
  const key = normaliseIngredient(ingredient);
  return STAPLES.some(staple => key === normaliseIngredient(staple));
};

/** Below this best coverage, the client is told to offer LLM adaptation (section 6.6). */
export const GENERATE_SUGGESTION_THRESHOLD = 0.5;

const round = (value: number): number => Math.round(value * 1000) / 1000;

/** Find the inventory item covering a recipe ingredient, preferring the most urgent one. */
const findInventoryMatch = (
  ingredient: string,
  canonicalId: string,
  inventory: RecipeInventoryItem[],
): RecipeInventoryItem | undefined => {
  const matches = inventory.filter(item =>
    item.canonicalId === canonicalId || ingredientsMatch(item.name, ingredient),
  );
  // Soonest expiry first, so the recipe consumes the food most at risk.
  return [...matches].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))[0];
};

/** Preference in [0,1]: half from declared favourite cuisines, half from cooking history. */
export const preferenceScore = (cuisine: string | undefined, preferences: Partial<UserPreferences>): number => {
  if (!cuisine) return 0;
  const key = cuisine.toLowerCase();
  const favourites = (preferences.favouriteCuisines || []).map(c => c.toLowerCase());
  const favourite = favourites.includes(key) ? 1 : 0;
  const history = preferences.cuisineHistory || {};
  const counts = Object.entries(history).map(([name, count]) => [name.toLowerCase(), count] as const);
  const maxCount = Math.max(0, ...counts.map(([, count]) => count));
  const cooked = counts.find(([name]) => name === key)?.[1] || 0;
  const historyScore = maxCount > 0 ? cooked / maxCount : 0;
  return round(0.5 * favourite + 0.5 * historyScore);
};

/**
 * Match a recipe against the inventory and compute S = w1*coverage + w2*urgency + w3*preference.
 *
 * - coverage: fraction of the recipe's non-staple ingredients already owned
 * - urgency: share of the inventory's at-risk food (URGENT = 1, WARNING = 0.5) this recipe uses up
 * - preference: see preferenceScore
 */
export const scoreRecipe = (
  recipe: RecipeCandidate,
  inventory: RecipeInventoryItem[],
  preferences: Partial<UserPreferences>,
  taxonomy: Taxonomy,
  today: string,
  weights: RankingWeights = DEFAULT_WEIGHTS,
): RankedRecipe => {
  const ingredients: RecipeIngredient[] = recipe.ingredients.map(({ name, measure }) => {
    const canonicalId = taxonomy.canonicalIdFor(name);
    if (isStaple(name)) return { name, canonicalId, measure, status: 'staple' };
    const match = findInventoryMatch(name, canonicalId, inventory);
    if (!match) return { name, canonicalId, measure, status: 'missing' };
    const tier = urgencyTier(match.expiryDate, today);
    return {
      name,
      canonicalId,
      measure,
      status: tier === 'SAFE' ? 'owned' : 'expiring',
      inventoryItemId: match.id,
    };
  });

  const countable = ingredients.filter(i => i.status !== 'staple');
  const owned = countable.filter(i => i.status === 'owned' || i.status === 'expiring');
  const coverage = countable.length === 0 ? 0 : owned.length / countable.length;

  const totalAtRisk = inventory.reduce((sum, item) => sum + urgencyWeight(urgencyTier(item.expiryDate, today)), 0);
  const usedIds = new Set(owned.map(i => i.inventoryItemId));
  const usedAtRisk = inventory
    .filter(item => usedIds.has(item.id))
    .reduce((sum, item) => sum + urgencyWeight(urgencyTier(item.expiryDate, today)), 0);
  const urgency = totalAtRisk === 0 ? 0 : usedAtRisk / totalAtRisk;

  const preference = preferenceScore(recipe.cuisine, preferences);
  const score: RecipeScore = {
    coverage: round(coverage),
    urgency: round(urgency),
    preference,
    total: round(weights.coverage * coverage + weights.urgency * urgency + weights.preference * preference),
  };

  const inventoryNames = new Map(inventory.map(item => [item.id, item.name]));
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    cuisine: recipe.cuisine,
    category: recipe.category,
    thumbnail: recipe.thumbnail,
    source: recipe.source,
    servings: recipe.servings,
    ingredients,
    steps: recipe.steps,
    score,
    matchPercentage: Math.round(coverage * 100),
    missingIngredients: ingredients.filter(i => i.status === 'missing').map(i => i.name),
    expiringIngredients: [...new Set(
      ingredients
        .filter(i => i.status === 'expiring' && i.inventoryItemId)
        .map(i => inventoryNames.get(i.inventoryItemId as string) as string),
    )],
  };
};

/** Feasibility filter + scoring + sort, highest score first (ties broken by coverage). */
export const rankRecipes = (
  candidates: RecipeCandidate[],
  inventory: RecipeInventoryItem[],
  preferences: Partial<UserPreferences>,
  taxonomy: Taxonomy,
  today: string,
  weights: RankingWeights = DEFAULT_WEIGHTS,
): RankedRecipe[] =>
  candidates
    .filter(recipe => isRecipeFeasible(recipe.ingredients.map(i => i.name), preferences))
    .map(recipe => scoreRecipe(recipe, inventory, preferences, taxonomy, today, weights))
    .sort((a, b) => b.score.total - a.score.total || b.score.coverage - a.score.coverage);
