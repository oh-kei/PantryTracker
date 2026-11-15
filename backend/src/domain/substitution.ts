import type { CulinaryRole, RecipeInventoryItem, Substitution, UserPreferences } from '../../../shared/types';
import { isIngredientAllowed } from './dietary';
import { ingredientsMatch, normaliseIngredient } from './normalise';

interface SubstitutionRule {
  /** Ingredient names (any alias) this rule applies to. */
  match: string[];
  role: CulinaryRole;
  substitutes: Array<{ name: string; note?: string }>;
}

/**
 * Role-based substitution knowledge, grouped by the ingredient's culinary role
 * (fat, acid, thickener, protein base...). Substitutes are listed best-first.
 */
export const SUBSTITUTION_RULES: SubstitutionRule[] = [
  { match: ['butter'], role: 'fat', substitutes: [{ name: 'olive oil', note: 'use ¾ of the amount' }, { name: 'vegetable oil', note: 'use ¾ of the amount' }, { name: 'margarine' }, { name: 'coconut oil' }] },
  { match: ['olive oil', 'vegetable oil', 'sunflower oil'], role: 'fat', substitutes: [{ name: 'vegetable oil' }, { name: 'olive oil' }, { name: 'butter', note: 'melted' }] },
  { match: ['lemon juice', 'lemon'], role: 'acid', substitutes: [{ name: 'lime', note: 'same amount' }, { name: 'vinegar', note: 'use half the amount' }, { name: 'orange', note: 'sweeter, use a little more' }] },
  { match: ['lime juice', 'lime'], role: 'acid', substitutes: [{ name: 'lemon', note: 'same amount' }, { name: 'vinegar', note: 'use half the amount' }] },
  { match: ['vinegar', 'white wine vinegar', 'red wine vinegar', 'cider vinegar', 'rice vinegar'], role: 'acid', substitutes: [{ name: 'lemon', note: 'use double the amount' }, { name: 'lime' }] },
  { match: ['cornstarch', 'cornflour', 'corn flour'], role: 'thickener', substitutes: [{ name: 'plain flour', note: 'use double the amount' }, { name: 'potato starch' }, { name: 'arrowroot' }] },
  { match: ['plain flour', 'flour', 'all purpose flour'], role: 'thickener', substitutes: [{ name: 'cornflour', note: 'use half the amount for thickening' }, { name: 'oats', note: 'blended, for baking' }] },
  { match: ['egg'], role: 'binder', substitutes: [{ name: 'banana', note: '½ mashed banana per egg (baking)' }, { name: 'yogurt', note: '¼ cup per egg' }, { name: 'flaxseed', note: '1 tbsp ground + 3 tbsp water per egg' }] },
  { match: ['breadcrumbs', 'breadcrumb'], role: 'binder', substitutes: [{ name: 'oats' }, { name: 'bread', note: 'blitz stale bread' }, { name: 'crackers', note: 'crushed' }] },
  { match: ['chicken breast', 'chicken', 'chicken thigh'], role: 'protein base', substitutes: [{ name: 'turkey' }, { name: 'tofu' }, { name: 'chickpeas' }, { name: 'pork chop' }] },
  { match: ['beef mince', 'minced beef', 'ground beef', 'beef'], role: 'protein base', substitutes: [{ name: 'lamb mince' }, { name: 'turkey mince' }, { name: 'lentils' }, { name: 'mushroom', note: 'finely chopped' }] },
  { match: ['pork', 'pork chop', 'bacon', 'sausage'], role: 'protein base', substitutes: [{ name: 'chicken thigh' }, { name: 'turkey' }, { name: 'mushroom' }] },
  { match: ['prawns', 'shrimp', 'white fish', 'cod', 'salmon'], role: 'protein base', substitutes: [{ name: 'white fish' }, { name: 'salmon' }, { name: 'chicken breast' }, { name: 'tofu' }] },
  { match: ['tofu'], role: 'protein base', substitutes: [{ name: 'chickpeas' }, { name: 'egg' }, { name: 'chicken breast' }] },
  { match: ['milk'], role: 'dairy', substitutes: [{ name: 'oat milk' }, { name: 'soy milk' }, { name: 'water', note: 'plus a knob of butter' }] },
  { match: ['double cream', 'cream', 'heavy cream', 'single cream'], role: 'dairy', substitutes: [{ name: 'milk', note: 'plus melted butter (3:1)' }, { name: 'yogurt', note: 'stir in off the heat' }, { name: 'coconut cream' }] },
  { match: ['sour cream', 'creme fraiche'], role: 'dairy', substitutes: [{ name: 'yogurt' }, { name: 'double cream', note: 'plus a squeeze of lemon' }] },
  { match: ['yogurt', 'greek yogurt'], role: 'dairy', substitutes: [{ name: 'sour cream' }, { name: 'double cream', note: 'plus lemon juice' }] },
  { match: ['parmesan', 'parmesan cheese', 'cheddar', 'cheddar cheese', 'cheese'], role: 'dairy', substitutes: [{ name: 'cheddar cheese' }, { name: 'parmesan cheese' }, { name: 'nutritional yeast' }] },
  { match: ['sugar', 'caster sugar', 'brown sugar'], role: 'sweetener', substitutes: [{ name: 'honey', note: 'use ¾ and reduce liquid' }, { name: 'maple syrup' }] },
  { match: ['honey'], role: 'sweetener', substitutes: [{ name: 'maple syrup' }, { name: 'sugar', note: 'add a splash of water' }] },
  { match: ['onion', 'red onion', 'shallot'], role: 'aromatic', substitutes: [{ name: 'spring onion' }, { name: 'leek' }, { name: 'shallot' }, { name: 'onion powder', note: '1 tsp per onion' }] },
  { match: ['garlic', 'garlic clove'], role: 'aromatic', substitutes: [{ name: 'garlic powder', note: '⅛ tsp per clove' }, { name: 'spring onion' }] },
  { match: ['ginger'], role: 'aromatic', substitutes: [{ name: 'ground ginger', note: '¼ tsp per tbsp fresh' }] },
  { match: ['basil', 'parsley', 'coriander', 'cilantro', 'thyme', 'oregano'], role: 'herb/spice', substitutes: [{ name: 'parsley' }, { name: 'basil' }, { name: 'dried mixed herbs', note: '⅓ of the fresh amount' }] },
  { match: ['rice', 'basmati rice', 'white rice'], role: 'starch', substitutes: [{ name: 'couscous' }, { name: 'quinoa' }, { name: 'pasta' }, { name: 'potato' }] },
  { match: ['pasta', 'spaghetti', 'penne'], role: 'starch', substitutes: [{ name: 'rice noodles' }, { name: 'rice' }, { name: 'courgette', note: 'spiralised' }] },
  { match: ['potato', 'potatoes'], role: 'starch', substitutes: [{ name: 'sweet potato' }, { name: 'rice' }] },
  { match: ['bread'], role: 'starch', substitutes: [{ name: 'tortilla' }, { name: 'rice' }] },
  { match: ['chicken stock', 'beef stock', 'vegetable stock', 'stock'], role: 'liquid', substitutes: [{ name: 'water', note: 'plus a pinch of salt and herbs' }, { name: 'vegetable stock' }] },
  { match: ['white wine', 'red wine', 'wine'], role: 'liquid', substitutes: [{ name: 'chicken stock', note: 'plus a splash of vinegar' }, { name: 'vinegar', note: 'diluted with water' }] },
  { match: ['spinach', 'kale'], role: 'vegetable', substitutes: [{ name: 'kale' }, { name: 'spinach' }, { name: 'cabbage' }, { name: 'lettuce' }] },
  { match: ['bell pepper', 'pepper', 'red pepper'], role: 'vegetable', substitutes: [{ name: 'courgette' }, { name: 'carrot' }, { name: 'tomato' }] },
  { match: ['courgette', 'zucchini', 'aubergine', 'eggplant'], role: 'vegetable', substitutes: [{ name: 'courgette' }, { name: 'aubergine' }, { name: 'mushroom' }, { name: 'bell pepper' }] },
  { match: ['tomato', 'chopped tomatoes', 'tomato puree'], role: 'vegetable', substitutes: [{ name: 'chopped tomatoes' }, { name: 'tomato' }, { name: 'bell pepper', note: 'roasted' }] },
];

export const findRule = (ingredient: string): SubstitutionRule | undefined => {
  const key = normaliseIngredient(ingredient);
  return SUBSTITUTION_RULES.find(rule => rule.match.some(m => normaliseIngredient(m) === key)) ||
    SUBSTITUTION_RULES.find(rule => rule.match.some(m => ingredientsMatch(m, key)));
};

/**
 * Rule-based substitutions for missing ingredients. Substitutes the user already
 * owns are listed first; anything that breaks their allergens/diet is removed.
 */
export const suggestSubstitutions = (
  missing: string[],
  inventory: RecipeInventoryItem[],
  preferences: Partial<UserPreferences>,
  maxPerIngredient = 2,
): Substitution[] =>
  missing.flatMap(ingredient => {
    const rule = findRule(ingredient);
    if (!rule) return [];
    const options = rule.substitutes
      .filter(option => !ingredientsMatch(option.name, ingredient))
      .filter(option => isIngredientAllowed(option.name, preferences))
      .map(option => {
        const owned = inventory.find(item => ingredientsMatch(item.name, option.name));
        return {
          missing: ingredient,
          substitute: owned ? owned.name : option.name,
          role: rule.role,
          fromInventory: Boolean(owned),
          inventoryItemId: owned?.id,
          note: option.note,
          source: 'rules' as const,
        };
      });
    const owned = options.filter(o => o.fromInventory);
    const rest = options.filter(o => !o.fromInventory);
    return [...owned, ...rest].slice(0, maxPerIngredient);
  });

const ROLES: CulinaryRole[] = ['fat', 'acid', 'thickener', 'binder', 'protein base', 'dairy', 'sweetener', 'aromatic', 'herb/spice', 'starch', 'liquid', 'vegetable', 'other'];

/**
 * Validate substitutions returned by the LLM: drop malformed entries, entries for
 * ingredients that weren't asked about, and anything that breaks the user's constraints.
 */
export const validateLlmSubstitutions = (
  raw: unknown,
  missing: string[],
  inventory: RecipeInventoryItem[],
  preferences: Partial<UserPreferences>,
): Substitution[] => {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { substitutions?: unknown })?.substitutions)
    ? (raw as { substitutions: unknown[] }).substitutions
    : [];
  return list.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const { missing: m, substitute, role, note } = entry as Record<string, unknown>;
    if (typeof m !== 'string' || typeof substitute !== 'string' || !substitute.trim()) return [];
    const target = missing.find(name => ingredientsMatch(name, m));
    if (!target) return [];
    if (!isIngredientAllowed(substitute, preferences)) return [];
    const owned = inventory.find(item => ingredientsMatch(item.name, substitute));
    return [{
      missing: target,
      substitute: owned ? owned.name : substitute.trim(),
      role: ROLES.includes(role as CulinaryRole) ? role as CulinaryRole : 'other',
      fromInventory: Boolean(owned),
      inventoryItemId: owned?.id,
      note: typeof note === 'string' ? note : undefined,
      source: 'llm' as const,
    }];
  });
};
