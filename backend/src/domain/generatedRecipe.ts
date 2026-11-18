import type { RecipeInventoryItem, UserPreferences } from '../../../shared/types';
import { urgencyTier } from './expiry';
import type { RecipeCandidate } from './ranking';

/** The strict JSON schema the LLM must follow (section 6.6). */
export const GENERATED_RECIPE_SCHEMA = `{
  "title": string,
  "description": string (one sentence),
  "cuisine": string,
  "servings": integer 1-12,
  "ingredients": [{ "name": string (plain ingredient name), "measure": string }],
  "steps": [string]
}`;

export const RECIPE_SYSTEM_PROMPT = `You adapt home recipes to reduce food waste.
Return ONLY a JSON object matching this schema, with no extra keys and no prose:
${GENERATED_RECIPE_SCHEMA}
Rules: use as many of the user's URGENT and WARNING items as is sensible; only use inventory items or common staples
(salt, pepper, oil, water) unless unavoidable; never use an ingredient that breaks the user's allergens or diet;
keep steps short, practical and safe (cook meat, poultry and eggs thoroughly).`;

/** Build the user prompt. Only ingredient names and urgency are shared with the LLM. */
export const buildRecipePrompt = (
  inventory: RecipeInventoryItem[],
  preferences: Partial<UserPreferences>,
  today: string,
): string => {
  const items = inventory.map(item => ({ name: item.name, urgency: urgencyTier(item.expiryDate, today) }));
  const constraints = {
    allergens: preferences.allergens || [],
    diet: preferences.diet || 'none',
    favouriteCuisines: preferences.favouriteCuisines || [],
  };
  return `Inventory: ${JSON.stringify(items)}\nConstraints: ${JSON.stringify(constraints)}\nCreate one recipe.`;
};

const isNonEmptyString = (value: unknown, max = 500): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;

/**
 * Validate an LLM response against the schema. Throws with a reason if anything is
 * missing or malformed, so nothing unvalidated reaches the user.
 */
export const validateGeneratedRecipe = (raw: unknown, id: string): RecipeCandidate => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Recipe must be a JSON object');
  const r = raw as Record<string, unknown>;
  if (!isNonEmptyString(r.title, 120)) throw new Error('Recipe is missing a title');
  if (!isNonEmptyString(r.description, 400)) throw new Error('Recipe is missing a description');
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0 || r.ingredients.length > 30) {
    throw new Error('Recipe must list 1-30 ingredients');
  }
  if (!Array.isArray(r.steps) || r.steps.length === 0 || r.steps.length > 30) {
    throw new Error('Recipe must have 1-30 steps');
  }
  const ingredients = r.ingredients.map((ingredient, index) => {
    const i = ingredient as Record<string, unknown>;
    if (!i || !isNonEmptyString(i.name, 80)) throw new Error(`Ingredient ${index + 1} has no name`);
    return { name: i.name.trim(), measure: typeof i.measure === 'string' ? i.measure.trim().slice(0, 60) : '' };
  });
  const steps = r.steps.map((step, index) => {
    if (!isNonEmptyString(step, 600)) throw new Error(`Step ${index + 1} is invalid`);
    return step.trim();
  });
  const servings = Number(r.servings);
  return {
    id,
    title: r.title.trim(),
    description: r.description.trim(),
    cuisine: isNonEmptyString(r.cuisine, 40) ? r.cuisine.trim() : undefined,
    source: 'generated',
    servings: Number.isInteger(servings) && servings >= 1 && servings <= 12 ? servings : 2,
    ingredients,
    steps,
  };
};
