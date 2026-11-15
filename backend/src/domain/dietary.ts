import type { Allergen, Diet } from '../../../shared/types';
import { containsWord, normaliseIngredient } from './normalise';

interface KeywordRule {
  keywords: string[];
  /** Phrases that contain a keyword but are not the allergen ("peanut butter" is not dairy). */
  exceptions?: string[];
}

export const ALLERGEN_RULES: Record<Allergen, KeywordRule> = {
  dairy: {
    keywords: ['milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'ghee', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'ricotta', 'mascarpone', 'creme fraiche', 'buttermilk', 'custard', 'paneer', 'gruyere', 'brie', 'halloumi'],
    exceptions: ['peanut butter', 'almond butter', 'cocoa butter', 'coconut milk', 'coconut cream', 'almond milk', 'oat milk', 'soy milk', 'soya milk', 'cream of tartar'],
  },
  egg: { keywords: ['egg', 'mayonnaise', 'meringue'], exceptions: ['eggplant'] },
  gluten: {
    keywords: ['flour', 'bread', 'breadcrumb', 'pasta', 'spaghetti', 'penne', 'macaroni', 'lasagne', 'lasagna', 'fusilli', 'linguine', 'tagliatelle', 'couscous', 'wheat', 'barley', 'rye', 'pastry', 'tortilla', 'noodle', 'bulgur', 'semolina', 'soy sauce', 'beer', 'biscuit', 'cracker', 'pitta', 'naan', 'bun'],
    exceptions: ['rice flour', 'corn flour', 'cornflour', 'rice noodle', 'gluten free', 'tamari', 'corn tortilla', 'almond flour', 'coconut flour', 'buckwheat'],
  },
  peanut: { keywords: ['peanut', 'groundnut'] },
  'tree nut': {
    keywords: ['almond', 'cashew', 'walnut', 'pecan', 'hazelnut', 'pistachio', 'macadamia', 'pine nut', 'brazil nut', 'praline', 'marzipan'],
  },
  fish: { keywords: ['fish', 'salmon', 'tuna', 'cod', 'haddock', 'anchovy', 'sardine', 'mackerel', 'trout', 'tilapia', 'sea bass', 'halibut', 'pollock', 'fish sauce', 'white fish'] },
  shellfish: { keywords: ['prawn', 'shrimp', 'crab', 'lobster', 'mussel', 'clam', 'oyster', 'scallop', 'squid', 'calamari', 'crayfish', 'langoustine'] },
  soy: { keywords: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'tempeh', 'tamari'] },
  sesame: { keywords: ['sesame', 'tahini'] },
};

const MEAT_KEYWORDS = [
  'beef', 'chicken', 'pork', 'lamb', 'bacon', 'ham', 'sausage', 'turkey', 'duck', 'mince', 'veal',
  'chorizo', 'prosciutto', 'pancetta', 'salami', 'gelatin', 'gelatine', 'goat', 'venison', 'steak', 'meat', 'lard', 'suet', 'kidney', 'liver', 'mutton',
];
const MEAT_EXCEPTIONS = ['vegetable stock', 'veggie sausage', 'vegetarian sausage', 'quorn mince', 'soy mince'];

const DIET_RULES: Record<Diet, KeywordRule[]> = {
  none: [],
  pescatarian: [{ keywords: MEAT_KEYWORDS, exceptions: MEAT_EXCEPTIONS }],
  vegetarian: [
    { keywords: MEAT_KEYWORDS, exceptions: MEAT_EXCEPTIONS },
    ALLERGEN_RULES.fish,
    ALLERGEN_RULES.shellfish,
  ],
  vegan: [
    { keywords: MEAT_KEYWORDS, exceptions: MEAT_EXCEPTIONS },
    ALLERGEN_RULES.fish,
    ALLERGEN_RULES.shellfish,
    ALLERGEN_RULES.dairy,
    ALLERGEN_RULES.egg,
    { keywords: ['honey'] },
  ],
};

const violatesRule = (ingredient: string, rule: KeywordRule): boolean => {
  const name = normaliseIngredient(ingredient);
  if ((rule.exceptions || []).some(exception => containsWord(name, exception))) return false;
  return rule.keywords.some(keyword => containsWord(name, keyword));
};

export interface DietaryConstraints {
  allergens?: Allergen[];
  diet?: Diet;
}

/** Reasons an ingredient conflicts with the user's constraints (empty when it's fine). */
export const ingredientConflicts = (ingredient: string, constraints: DietaryConstraints): string[] => {
  const reasons: string[] = [];
  (constraints.allergens || []).forEach(allergen => {
    const rule = ALLERGEN_RULES[allergen];
    if (rule && violatesRule(ingredient, rule)) reasons.push(`contains ${allergen}`);
  });
  const diet = constraints.diet || 'none';
  if ((DIET_RULES[diet] || []).some(rule => violatesRule(ingredient, rule))) {
    reasons.push(`not ${diet}`);
  }
  return reasons;
};

export const isIngredientAllowed = (ingredient: string, constraints: DietaryConstraints): boolean =>
  ingredientConflicts(ingredient, constraints).length === 0;

/** Feasibility filter: a recipe is excluded if any ingredient conflicts. */
export const isRecipeFeasible = (ingredients: string[], constraints: DietaryConstraints): boolean =>
  ingredients.every(ingredient => isIngredientAllowed(ingredient, constraints));
