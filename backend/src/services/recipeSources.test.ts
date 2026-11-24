import { BASIC_RECIPES } from '../data/basicRecipes';
import { addDays } from '../domain/expiry';
import { rankRecipes } from '../domain/ranking';
import { Taxonomy } from '../domain/taxonomy';
import { FIXTURE_RECIPES, fixtureRecipeSource } from '../__fixtures__/recipes';
import type { RecipeSource } from './mealdb';
import { cleanDummyIngredient, CombinedRecipeSource, dummyToCandidate, DummyJsonSource, StaticRecipeSource } from './recipeSources';

const TODAY = '2026-11-15';
const taxonomy = new Taxonomy();
const basics = new StaticRecipeSource(BASIC_RECIPES);
const failing: RecipeSource = {
  idsByIngredient: () => Promise.reject(new Error('down')),
  lookup: () => Promise.reject(new Error('down')),
  all: () => Promise.reject(new Error('down')),
};

describe('basic recipes', () => {
  it('are complete, with unique IDs', () => {
    expect(BASIC_RECIPES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(BASIC_RECIPES.map(r => r.id)).size).toBe(BASIC_RECIPES.length);
    BASIC_RECIPES.forEach(r => {
      expect(r.id).toMatch(/^basic_[a-z0-9_]+$/);
      expect(r.ingredients.length).toBeGreaterThanOrEqual(3);
      expect(r.steps.length).toBeGreaterThanOrEqual(3);
      r.ingredients.forEach(i => expect(i.measure).not.toBe(''));
    });
  });

  it('come first when all you have is eggs, bread and milk', () => {
    const inventory = ['Eggs', 'Bread', 'Milk', 'Butter'].map((name, i) => ({
      id: String(i), name, canonicalId: taxonomy.canonicalIdFor(name), expiryDate: addDays(TODAY, 2),
    }));
    const top = rankRecipes(BASIC_RECIPES, inventory, {}, taxonomy, TODAY).slice(0, 3).map(r => r.title);
    expect(top).toContain('French Toast');
    expect(top).toContain('Scrambled Eggs');
  });

  it('can be searched by ingredient', async () => {
    const ids = await basics.idsByIngredient('bok choy');
    expect(ids).toEqual(['basic_garlic_bok_choy']);
    expect((await basics.lookup(ids[0]))?.title).toBe('Garlic Bok Choy');
  });
});

describe('DummyJSON recipes', () => {
  it('cleans free-text ingredients', () => {
    expect(cleanDummyIngredient('Salt and pepper to taste')).toEqual([{ name: 'Salt', measure: 'to taste' }, { name: 'Black Pepper', measure: 'to taste' }]);
    expect(cleanDummyIngredient('Fresh basil leaves (optional)')).toEqual([{ name: 'Fresh basil leaves', measure: '' }]);
    expect(cleanDummyIngredient('Cilantro, for garnish')).toEqual([{ name: 'Cilantro', measure: '' }]);
  });

  it('converts a recipe', () => {
    const recipe = dummyToCandidate({
      id: 1, name: 'Classic Margherita Pizza', ingredients: ['Pizza dough', 'Salt and pepper to taste'],
      instructions: ['Roll out the dough.', ' Bake. '], servings: 4, cuisine: 'Italian', mealType: ['Dinner'],
      image: 'https://cdn.dummyjson.com/recipe-images/1.webp', prepTimeMinutes: 20, cookTimeMinutes: 15,
    });
    expect(recipe).toMatchObject({
      id: 'dummyjson_1', title: 'Classic Margherita Pizza', cuisine: 'Italian', category: 'Dinner', servings: 4,
      description: 'Italian · Dinner · about 35 min', thumbnail: 'https://cdn.dummyjson.com/recipe-images/1.webp',
      steps: ['Roll out the dough.', 'Bake.'],
    });
    expect(recipe.ingredients.map(i => i.name)).toEqual(['Pizza dough', 'Salt', 'Black Pepper']);
  });

  it('backs off instead of waiting on the service every time it is down', async () => {
    const realFetch = global.fetch;
    const fetchMock = jest.fn().mockRejectedValue(new Error('offline'));
    global.fetch = fetchMock as unknown as typeof fetch;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const source = new DummyJsonSource();
      await expect(source.all()).rejects.toThrow('offline');
      await expect(source.all()).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = realFetch;
      warn.mockRestore();
    }
  });
});

describe('combined recipe source', () => {
  const mealdb = { ...fixtureRecipeSource(), all: async () => FIXTURE_RECIPES };

  it('lists every source and routes lookups by ID prefix', async () => {
    const combined = new CombinedRecipeSource([
      { prefix: 'mealdb_', source: mealdb },
      { prefix: 'basic_', source: basics, optional: true },
    ]);
    expect(await combined.all()).toHaveLength(FIXTURE_RECIPES.length + BASIC_RECIPES.length);
    expect((await combined.lookup('basic_french_toast'))?.title).toBe('French Toast');
    expect((await combined.lookup('mealdb_1'))?.title).toBe('Spinach Omelette');
    expect(await combined.lookup('other_1')).toBeNull();
    expect(await combined.counts()).toEqual({ mealdb: FIXTURE_RECIPES.length, basic: BASIC_RECIPES.length });
  });

  it('skips an optional source that is down', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const combined = new CombinedRecipeSource([
      { prefix: 'mealdb_', source: mealdb },
      { prefix: 'dummyjson_', source: failing, optional: true },
    ]);
    expect(await combined.all()).toHaveLength(FIXTURE_RECIPES.length);
    expect(await combined.idsByIngredient('eggs')).toContain('mealdb_1');
    warn.mockRestore();
  });

  it('fails the catalogue when the main source is down, but search still finds the basics', async () => {
    const combined = new CombinedRecipeSource([
      { prefix: 'mealdb_', source: failing },
      { prefix: 'basic_', source: basics, optional: true },
    ]);
    await expect(combined.all()).rejects.toThrow('down');
    expect(await combined.idsByIngredient('bok choy')).toEqual(['basic_garlic_bok_choy']);
    await expect(new CombinedRecipeSource([{ prefix: 'mealdb_', source: failing }]).idsByIngredient('x')).rejects.toThrow('down');
  });
});
