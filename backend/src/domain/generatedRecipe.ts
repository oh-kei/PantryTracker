import type { GenerateOptions, MealType, RecipeInventoryItem, UserPreferences } from '../../../shared/types';
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
keep steps short, practical and safe (cook meat, poultry and eggs thoroughly).
Items marked "mustUse": true MUST be main ingredients of the recipe. Respect any requested meal type and time limit.`;

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export const TIME_LIMITS = [15, 30, 60];

/**
 * Build the user prompt. Only ingredient names and urgency are shared with the LLM.
 * `options` narrows which items are offered and adds must-use items, meal type and time.
 */
export const buildRecipePrompt = (
  inventory: RecipeInventoryItem[],
  preferences: Partial<UserPreferences>,
  today: string,
  options: GenerateOptions = {},
): string => {
  const mustUse = new Set(options.mustUse || []);
  const include = options.include ? new Set([...options.include, ...mustUse]) : null;
  const items = inventory
    .filter(item => !include || include.has(item.id))
    .map(item => ({ name: item.name, urgency: urgencyTier(item.expiryDate, today), ...(mustUse.has(item.id) ? { mustUse: true } : {}) }));
  const constraints = {
    allergens: preferences.allergens || [],
    diet: preferences.diet || 'none',
    favouriteCuisines: preferences.favouriteCuisines || [],
  };
  const request = [
    options.mealType ? `a ${options.mealType} dish` : null,
    options.maxMinutes ? `ready in ${options.maxMinutes} minutes or less in total` : null,
  ].filter(Boolean).join(', ');
  const must = inventory.filter(item => mustUse.has(item.id)).map(item => item.name);
  return `Inventory: ${JSON.stringify(items)}
Constraints: ${JSON.stringify(constraints)}
` +
    (must.length ? `The recipe MUST be built around: ${must.join(', ')}.
` : '') +
    `Create one recipe${request ? `: ${request}` : ''}.`;
};

/** Read options from a request body, ignoring anything unexpected. */
export const parseGenerateOptions = (value: unknown, inventoryIds: string[]): GenerateOptions => {
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  const known = new Set(inventoryIds);
  const ids = (x: unknown) => (Array.isArray(x) ? x.filter((id): id is string => typeof id === 'string' && known.has(id)) : undefined);
  const options: GenerateOptions = {};
  const include = ids(v.include);
  const mustUse = ids(v.mustUse);
  if (include) options.include = include;
  if (mustUse?.length) options.mustUse = mustUse.slice(0, 5);
  if (MEAL_TYPES.includes(v.mealType as MealType)) options.mealType = v.mealType as MealType;
  if (TIME_LIMITS.includes(v.maxMinutes as number)) options.maxMinutes = v.maxMinutes as number;
  return options;
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
