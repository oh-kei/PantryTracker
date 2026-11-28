import type { RecipeInventoryItem } from '../../../shared/types';
import { FIXTURE_RECIPES } from '../__fixtures__/recipes';
import { isRecipeFeasible, ingredientConflicts } from './dietary';
import { addDays, daysUntil, expiryWindow, urgencyTier } from './expiry';
import { validateGeneratedRecipe } from './generatedRecipe';
import { ingredientsMatch, normaliseIngredient } from './normalise';
import { preferenceScore, rankRecipes, scoreRecipe } from './ranking';
import { suggestSubstitutions, validateLlmSubstitutions } from './substitution';
import { Taxonomy } from './taxonomy';

const TODAY = '2026-11-15';
const taxonomy = new Taxonomy();
const item = (id: string, name: string, daysLeft: number): RecipeInventoryItem => ({
  id, name, canonicalId: taxonomy.canonicalIdFor(name), expiryDate: addDays(TODAY, daysLeft),
});

describe('normalisation', () => {
  it('strips descriptors and plurals', () => {
    expect(normaliseIngredient('Free-range Eggs')).toBe('egg');
    expect(normaliseIngredient('Fresh Baby Spinach')).toBe('spinach');
    expect(normaliseIngredient('Tomatoes')).toBe('tomato');
    expect(normaliseIngredient('ground beef')).toBe('ground beef');
  });

  it('matches whole words only', () => {
    expect(ingredientsMatch('spinach', 'baby spinach')).toBe(true);
    expect(ingredientsMatch('egg', 'eggplant')).toBe(false);
    expect(ingredientsMatch('chicken', 'chicken breast')).toBe(true);
  });
});

describe('taxonomy', () => {
  it('maps labels and aliases onto canonical IDs', () => {
    expect(taxonomy.canonicalIdFor('Eggs')).toBe('egg');
    expect(taxonomy.canonicalIdFor('zucchini')).toBe('courgette');
    expect(taxonomy.canonicalIdFor('chopped cherry tomatoes')).toBe('tomato');
    expect(taxonomy.lookup('unicorn steak dust')?.canonicalId).not.toBe('egg');
  });

  it('lets real names beat aliases of other entries (Firestore data has overlapping aliases)', () => {
    const t = new Taxonomy();
    const entry = (name: string, aliases: string[]) => ({
      canonicalId: '', name, category: 'Produce' as const, defaultStorage: 'FRIDGE' as const, aliases,
      shelfLifeDays: { pantry: null, fridge: { min: 1, max: 2 }, freezer: null },
    });
    t.add(entry('Banana', ['bananas']));
    t.add(entry('Cocoy Banana', ['banana', 'plantain']));
    t.add(entry('Strained Yoghurt', ['greek yogurt']));
    t.add(entry('Greek Yogurt', ['strained yogurt']));
    expect(t.lookup('banana')?.name).toBe('Banana');
    expect(t.lookup('plantain')?.name).toBe('Cocoy Banana');
    expect(t.lookup('Greek Yogurt')?.name).toBe('Greek Yogurt');
    expect(t.lookup('ripe greek yogurt pot')?.name).toBe('Greek Yogurt');
  });

  it('does not map a food onto a generic word like "fruit" or "pepper"', () => {
    const t = new Taxonomy();
    const entry = (name: string, aliases: string[]) => ({
      canonicalId: '', name, category: 'Pantry & Dry Goods' as const, defaultStorage: 'PANTRY' as const, aliases,
      shelfLifeDays: { pantry: { min: 180, max: 365 }, fridge: null, freezer: null },
    });
    t.add(entry('Dried Fruit', ['dry fruit']));
    t.add(entry('Black Pepper', ['pepper']));
    expect(t.lookup('dragon fruit')).toBeUndefined();
    expect(t.lookup('jalapeno pepper')).toBeUndefined();
    expect(t.lookup('pepper')?.name).not.toBe(undefined); // exact match still works
    expect(t.lookup('dried fruit')?.name).toBe('Dried Fruit');
  });

  it('suggests foods as the user types, best matches first', () => {
    expect(taxonomy.search('a')).toEqual([]);
    const names = taxonomy.search('chick').map(e => e.name);
    expect(names[0]).toBe('Chickpeas');
    expect(names).toEqual(expect.arrayContaining(['Chicken Breast', 'Chicken Thigh']));
    expect(taxonomy.search('mince').map(e => e.name)).toEqual(expect.arrayContaining(['Beef Mince', 'Pork Mince']));
    expect(taxonomy.search('zucch').map(e => e.name)).toEqual(['Courgette']); // via alias
    const withWholeMilk = new Taxonomy();
    withWholeMilk.add({ canonicalId: 'whole_milk', name: 'Whole Milk', category: 'Dairy & Eggs', defaultStorage: 'FRIDGE', aliases: [], shelfLifeDays: { pantry: null, fridge: { min: 5, max: 7 }, freezer: null } });
    expect(withWholeMilk.search('mil').map(e => e.name).slice(0, 2)).toEqual(['Milk', 'Whole Milk']);
  });

  it('falls back to category ranges for unknown items', () => {
    const estimate = taxonomy.estimate('kefir', 'Dairy & Eggs');
    expect(estimate.source).toBe('category-fallback');
    expect(estimate.category).toBe('Dairy & Eggs');
    expect(estimate.ranges.fridge).not.toBeNull();
  });
});

describe('expiry tiers', () => {
  it.each([
    [-3, 'URGENT'], [0, 'URGENT'], [2, 'URGENT'],
    [3, 'WARNING'], [5, 'WARNING'],
    [6, 'SAFE'], [30, 'SAFE'],
  ])('%i days left -> %s', (days, tier) => {
    expect(urgencyTier(addDays(TODAY, days), TODAY)).toBe(tier);
  });

  it('builds a date range from the buy date', () => {
    expect(expiryWindow('2026-11-10', { min: 3, max: 7 })).toEqual({ earliest: '2026-11-13', latest: '2026-11-17' });
    expect(daysUntil('2026-11-17', TODAY)).toBe(2);
  });
});

describe('dietary feasibility filter', () => {
  it('detects allergens without false positives', () => {
    expect(ingredientConflicts('Peanuts', { allergens: ['peanut'] })).toEqual(['contains peanut']);
    expect(ingredientConflicts('Peanut Butter', { allergens: ['dairy'] })).toEqual([]);
    expect(ingredientConflicts('Eggplant', { allergens: ['egg'] })).toEqual([]);
    expect(ingredientConflicts('Coconut Milk', { diet: 'vegan' })).toEqual([]);
  });

  it('applies diets', () => {
    expect(isRecipeFeasible(['Chicken Breast', 'Rice'], { diet: 'vegetarian' })).toBe(false);
    expect(isRecipeFeasible(['Prawns'], { diet: 'pescatarian' })).toBe(true);
    expect(isRecipeFeasible(['Butter', 'Spinach'], { diet: 'vegan' })).toBe(false);
  });
});

describe('ranking', () => {
  it('computes S = 0.5*coverage + 0.3*urgency + 0.2*preference', () => {
    const inventory = [item('a', 'Eggs', 1), item('b', 'Spinach', 4), item('c', 'Milk', 20)];
    const ranked = scoreRecipe(FIXTURE_RECIPES[0], inventory, { favouriteCuisines: ['French'] }, taxonomy, TODAY);
    // eggs + spinach owned, butter missing, salt is a staple -> 2/3 coverage
    expect(ranked.score.coverage).toBeCloseTo(2 / 3, 2);
    // at-risk weight: eggs URGENT (1) + spinach WARNING (0.5) = 1.5, all used
    expect(ranked.score.urgency).toBe(1);
    expect(ranked.score.preference).toBe(0.5);
    expect(ranked.score.total).toBeCloseTo(0.5 * (2 / 3) + 0.3 * 1 + 0.2 * 0.5, 2);
    expect(ranked.missingIngredients).toEqual(['Butter']);
    expect(ranked.expiringIngredients.sort()).toEqual(['Eggs', 'Spinach']);
    expect(ranked.ingredients.find(i => i.name === 'Salt')?.status).toBe('staple');
  });

  it('scenario: 5 items expiring in 2 days puts the recipe that uses them first', () => {
    const inventory = [
      item('1', 'Chicken Breast', 2), item('2', 'Bell Pepper', 2), item('3', 'Garlic', 2),
      item('4', 'Soy Sauce', 2), item('5', 'Rice', 2),
      item('6', 'Spaghetti', 60), item('7', 'Chopped Tomatoes', 60), item('8', 'Basil', 30),
    ];
    const ranked = rankRecipes(FIXTURE_RECIPES, inventory, {}, taxonomy, TODAY);
    expect(ranked[0].title).toBe('Chicken Stir Fry');
    expect(ranked[0].matchPercentage).toBe(100);
  });

  it('filters out recipes that conflict with allergens', () => {
    const inventory = [item('1', 'Prawns', 1), item('2', 'Lime', 1), item('3', 'Eggs', 1)];
    const titles = rankRecipes(FIXTURE_RECIPES, inventory, { allergens: ['peanut'] }, taxonomy, TODAY).map(r => r.title);
    expect(titles).not.toContain('Prawn Pad Thai');
  });

  it('scores preference from favourites and cooking history', () => {
    expect(preferenceScore('Thai', {})).toBe(0);
    expect(preferenceScore('Thai', { favouriteCuisines: ['thai'] })).toBe(0.5);
    expect(preferenceScore('Thai', { cuisineHistory: { Thai: 2, Italian: 4 } })).toBe(0.25);
  });
});

describe('substitutions', () => {
  it('prefers substitutes already in the inventory and respects constraints', () => {
    const inventory = [item('x', 'Olive Oil', 200)];
    const subs = suggestSubstitutions(['Butter'], inventory, {});
    expect(subs[0]).toMatchObject({ missing: 'Butter', substitute: 'Olive Oil', role: 'fat', fromInventory: true, inventoryItemId: 'x' });

    const vegan = suggestSubstitutions(['Double Cream'], [], { diet: 'vegan' });
    expect(vegan.map(s => s.substitute)).toEqual(['coconut cream']);
  });

  it('validates LLM substitutions', () => {
    const subs = validateLlmSubstitutions(
      { substitutions: [
        { missing: 'tamarind', substitute: 'lime', role: 'acid' },
        { missing: 'tamarind', substitute: 'peanut sauce', role: 'acid' },
        { missing: 'unrelated', substitute: 'x', role: 'fat' },
        { bogus: true },
      ] },
      ['tamarind'], [], { allergens: ['peanut'] },
    );
    expect(subs).toEqual([expect.objectContaining({ missing: 'tamarind', substitute: 'lime', role: 'acid', source: 'llm' })]);
  });
});

describe('generated recipe validation', () => {
  it('rejects responses that break the schema', () => {
    expect(() => validateGeneratedRecipe({ title: 'x' }, 'g')).toThrow();
    expect(() => validateGeneratedRecipe({ title: 'x', description: 'y', ingredients: [{}], steps: ['a'] }, 'g')).toThrow(/Ingredient 1/);
    expect(() => validateGeneratedRecipe([], 'g')).toThrow();
  });
});
