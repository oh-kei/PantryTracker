import type { RecipeCandidate } from '../domain/ranking';
import type { RecipeSource } from '../services/mealdb';

/** Recorded/hand-written recipe fixtures so CI never calls TheMealDB. */
export const FIXTURE_RECIPES: RecipeCandidate[] = [
  {
    id: 'mealdb_1', title: 'Spinach Omelette', description: 'French · Breakfast', cuisine: 'French', category: 'Breakfast',
    source: 'database', servings: 2,
    ingredients: [
      { name: 'Eggs', measure: '3' }, { name: 'Spinach', measure: '1 handful' },
      { name: 'Butter', measure: '1 tbsp' }, { name: 'Salt', measure: 'pinch' },
    ],
    steps: ['Whisk the eggs.', 'Wilt the spinach in butter.', 'Add eggs and cook until set.'],
  },
  {
    id: 'mealdb_2', title: 'Chicken Stir Fry', description: 'Chinese · Chicken', cuisine: 'Chinese', category: 'Chicken',
    source: 'database', servings: 4,
    ingredients: [
      { name: 'Chicken Breast', measure: '2' }, { name: 'Bell Pepper', measure: '1' },
      { name: 'Soy Sauce', measure: '2 tbsp' }, { name: 'Garlic', measure: '2 cloves' }, { name: 'Rice', measure: '200g' },
    ],
    steps: ['Slice the chicken.', 'Stir fry with pepper and garlic.', 'Add soy sauce and serve with rice.'],
  },
  {
    id: 'mealdb_3', title: 'Prawn Pad Thai', description: 'Thai · Seafood', cuisine: 'Thai', category: 'Seafood',
    source: 'database', servings: 2,
    ingredients: [
      { name: 'Prawns', measure: '200g' }, { name: 'Rice Noodles', measure: '200g' },
      { name: 'Peanuts', measure: '50g' }, { name: 'Lime', measure: '1' }, { name: 'Egg', measure: '1' },
    ],
    steps: ['Soak the noodles.', 'Fry prawns and egg.', 'Toss with noodles, peanuts and lime.'],
  },
  {
    id: 'mealdb_4', title: 'Tomato Pasta', description: 'Italian · Pasta', cuisine: 'Italian', category: 'Pasta',
    source: 'database', servings: 4,
    ingredients: [
      { name: 'Spaghetti', measure: '400g' }, { name: 'Chopped Tomatoes', measure: '1 tin' },
      { name: 'Garlic', measure: '2 cloves' }, { name: 'Basil', measure: 'handful' }, { name: 'Olive Oil', measure: '2 tbsp' },
    ],
    steps: ['Cook the pasta.', 'Simmer tomatoes with garlic.', 'Toss together with basil.'],
  },
];

export const fixtureRecipeSource = (recipes = FIXTURE_RECIPES): RecipeSource => ({
  async idsByIngredient(ingredient: string) {
    const key = ingredient.toLowerCase();
    return recipes
      .filter(r => r.ingredients.some(i => i.name.toLowerCase().includes(key) || key.includes(i.name.toLowerCase())))
      .map(r => r.id);
  },
  async lookup(id: string) {
    return recipes.find(r => r.id === id) || null;
  },
});

/** A recorded Gemini vision response (raw text, including a code fence as Gemini sometimes adds). */
export const RECORDED_VISION_RESPONSE = '```json\n[{"label":"eggs","confidence":0.97,"quantity":6,"unit":"unit","group":"egg carton"},{"label":"Baby Spinach","confidence":0.82,"quantity":1,"unit":"bag"},{"label":"mystery jar","confidence":0.31,"quantity":1,"unit":"jar"}]\n```';

/** A recorded LLM recipe-generation response. */
export const RECORDED_GENERATED_RECIPE = {
  title: 'Avocado Spinach Toast',
  description: 'Quick toast topped with smashed avocado and wilted spinach.',
  cuisine: 'Modern',
  servings: 2,
  ingredients: [
    { name: 'Avocado', measure: '1' }, { name: 'Spinach', measure: '1 handful' },
    { name: 'Bread', measure: '2 slices' }, { name: 'Salt', measure: 'pinch' },
  ],
  steps: ['Toast the bread.', 'Smash the avocado.', 'Wilt the spinach and pile on top.'],
};
