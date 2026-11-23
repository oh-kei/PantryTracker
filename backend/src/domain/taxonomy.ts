import type { DayRange, FoodCategory, ShelfLifeEstimate, StorageLocation, StorageRanges } from '../../../shared/types';
import { cleanText, ingredientsMatch, normaliseIngredient, toCanonicalId } from './normalise';

/**
 * A canonical ingredient with its shelf-life reference data. The same shape is
 * stored in the Firestore `shelfLifeReference` collection by scripts/seed.js.
 */
export interface TaxonomyEntry {
  canonicalId: string;
  name: string;
  category: FoodCategory;
  defaultStorage: StorageLocation;
  aliases: string[];
  shelfLifeDays: StorageRanges;
}

type R = [number, number] | null;
const r = (range: R): DayRange | null => (range ? { min: range[0], max: range[1] } : null);

/**
 * Built-in reference table, condensed from USDA FoodKeeper guidance. Used when
 * Firestore is not configured, and as a base that Firestore entries override.
 * Columns: name, category, default storage, pantry, fridge, freezer, aliases.
 */
const BUILT_IN: Array<[string, FoodCategory, StorageLocation, R, R, R, string[]]> = [
  ['Spinach', 'Produce', 'FRIDGE', null, [3, 7], [240, 300], ['baby spinach']],
  ['Lettuce', 'Produce', 'FRIDGE', null, [3, 7], null, ['romaine', 'iceberg lettuce', 'salad leaves']],
  ['Kale', 'Produce', 'FRIDGE', null, [5, 7], [240, 300], []],
  ['Broccoli', 'Produce', 'FRIDGE', null, [3, 5], [300, 365], []],
  ['Cauliflower', 'Produce', 'FRIDGE', null, [3, 5], [300, 365], []],
  ['Carrot', 'Produce', 'FRIDGE', null, [14, 21], [300, 365], ['carrots']],
  ['Celery', 'Produce', 'FRIDGE', null, [7, 14], [300, 365], []],
  ['Cucumber', 'Produce', 'FRIDGE', null, [4, 6], null, []],
  ['Tomato', 'Produce', 'PANTRY', [3, 7], [5, 7], [60, 90], ['cherry tomato', 'plum tomato']],
  ['Bell Pepper', 'Produce', 'FRIDGE', null, [4, 7], [180, 240], ['pepper', 'red pepper', 'green pepper', 'capsicum']],
  ['Courgette', 'Produce', 'FRIDGE', null, [4, 5], [300, 365], ['zucchini']],
  ['Aubergine', 'Produce', 'FRIDGE', null, [4, 7], [180, 240], ['eggplant']],
  ['Mushroom', 'Produce', 'FRIDGE', null, [3, 7], [240, 365], ['mushrooms', 'button mushroom']],
  ['Onion', 'Produce', 'PANTRY', [14, 60], [7, 14], [240, 300], ['red onion', 'white onion', 'yellow onion', 'brown onion']],
  ['Spring Onion', 'Produce', 'FRIDGE', null, [7, 14], null, ['scallion', 'green onion']],
  ['Garlic', 'Produce', 'PANTRY', [90, 150], [7, 14], null, ['garlic clove']],
  ['Ginger', 'Produce', 'PANTRY', [7, 14], [21, 30], [180, 180], ['ginger root']],
  ['Potato', 'Produce', 'PANTRY', [21, 35], [7, 14], null, ['potatoes']],
  ['Sweet Potato', 'Produce', 'PANTRY', [21, 35], null, [300, 365], []],
  ['Cabbage', 'Produce', 'FRIDGE', null, [7, 14], [300, 365], []],
  ['Peas', 'Produce', 'FREEZER', null, [3, 5], [240, 365], ['green peas', 'frozen peas']],
  ['Green Beans', 'Produce', 'FRIDGE', null, [3, 5], [240, 365], ['french beans']],
  ['Sweetcorn', 'Produce', 'FRIDGE', null, [1, 2], [240, 365], ['corn', 'corn on the cob']],
  ['Avocado', 'Produce', 'PANTRY', [3, 5], [3, 4], [90, 180], ['avocados']],
  ['Apple', 'Produce', 'FRIDGE', [7, 21], [28, 42], [240, 240], ['apples']],
  ['Banana', 'Produce', 'PANTRY', [2, 7], [3, 7], [60, 90], ['bananas']],
  ['Orange', 'Produce', 'PANTRY', [10, 14], [21, 28], [120, 180], []],
  ['Lemon', 'Produce', 'PANTRY', [7, 14], [21, 42], [120, 180], ['lemons']],
  ['Lime', 'Produce', 'PANTRY', [7, 14], [21, 42], [120, 180], ['limes']],
  ['Strawberry', 'Produce', 'FRIDGE', [1, 1], [3, 7], [240, 365], ['strawberries']],
  ['Blueberry', 'Produce', 'FRIDGE', [1, 1], [7, 14], [240, 365], ['blueberries']],
  ['Grape', 'Produce', 'FRIDGE', [1, 1], [7, 14], [300, 365], ['grapes']],
  ['Mango', 'Produce', 'PANTRY', [2, 5], [5, 7], [180, 240], []],
  ['Milk', 'Dairy & Eggs', 'FRIDGE', null, [5, 7], [90, 90], ['whole milk', 'semi skimmed milk', 'skimmed milk']],
  ['Butter', 'Dairy & Eggs', 'FRIDGE', [1, 2], [30, 90], [180, 270], ['unsalted butter', 'salted butter']],
  ['Cheddar Cheese', 'Dairy & Eggs', 'FRIDGE', null, [21, 42], [180, 180], ['cheddar', 'cheese']],
  ['Parmesan Cheese', 'Dairy & Eggs', 'FRIDGE', null, [90, 180], [180, 240], ['parmesan', 'parmigiano']],
  ['Mozzarella', 'Dairy & Eggs', 'FRIDGE', null, [5, 7], [90, 180], ['mozzarella cheese']],
  ['Feta Cheese', 'Dairy & Eggs', 'FRIDGE', null, [5, 7], [30, 30], ['feta']],
  ['Yogurt', 'Dairy & Eggs', 'FRIDGE', null, [7, 14], [30, 60], ['greek yogurt', 'yoghurt', 'natural yogurt']],
  ['Double Cream', 'Dairy & Eggs', 'FRIDGE', null, [5, 10], [90, 120], ['cream', 'heavy cream', 'single cream']],
  ['Sour Cream', 'Dairy & Eggs', 'FRIDGE', null, [7, 21], null, ['soured cream']],
  ['Egg', 'Dairy & Eggs', 'FRIDGE', null, [21, 35], null, ['eggs']],
  ['Chicken Breast', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [270, 270], ['chicken', 'chicken breasts']],
  ['Chicken Thigh', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [270, 270], ['chicken thighs']],
  ['Beef Mince', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [90, 120], ['ground beef', 'minced beef', 'mince']],
  ['Beef Steak', 'Meat & Seafood', 'FRIDGE', null, [3, 5], [180, 365], ['beef', 'steak', 'sirloin']],
  ['Pork Chop', 'Meat & Seafood', 'FRIDGE', null, [3, 5], [120, 180], ['pork', 'pork loin']],
  ['Bacon', 'Meat & Seafood', 'FRIDGE', null, [7, 7], [30, 30], ['streaky bacon']],
  ['Sausage', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [30, 60], ['sausages']],
  ['Ham', 'Meat & Seafood', 'FRIDGE', null, [3, 5], [30, 60], ['sliced ham']],
  ['Lamb', 'Meat & Seafood', 'FRIDGE', null, [3, 5], [180, 270], ['lamb mince', 'lamb chop']],
  ['Salmon', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [60, 90], ['salmon fillet']],
  ['White Fish', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [180, 240], ['cod', 'haddock', 'tilapia']],
  ['Prawns', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [90, 180], ['shrimp', 'king prawns']],
  ['Tofu', 'Meat & Seafood', 'FRIDGE', null, [3, 5], [150, 150], ['firm tofu']],
  ['Bread', 'Bakery', 'PANTRY', [2, 4], [7, 14], [90, 150], ['loaf', 'white bread', 'wholemeal bread', 'sourdough']],
  ['Tortilla', 'Bakery', 'PANTRY', [7, 14], [21, 30], [180, 240], ['tortillas', 'wraps']],
  ['Rice', 'Pantry & Dry Goods', 'PANTRY', [730, 730], null, null, ['white rice', 'basmati rice', 'jasmine rice', 'long grain rice']],
  ['Pasta', 'Pantry & Dry Goods', 'PANTRY', [365, 730], null, null, ['spaghetti', 'penne', 'fusilli', 'macaroni']],
  ['Plain Flour', 'Pantry & Dry Goods', 'PANTRY', [180, 240], null, null, ['flour', 'all purpose flour']],
  ['Sugar', 'Pantry & Dry Goods', 'PANTRY', [730, 730], null, null, ['caster sugar', 'granulated sugar', 'brown sugar']],
  ['Oats', 'Pantry & Dry Goods', 'PANTRY', [180, 365], null, null, ['rolled oats', 'porridge oats']],
  ['Chickpeas', 'Pantry & Dry Goods', 'PANTRY', [365, 730], [3, 4], null, ['garbanzo beans']],
  ['Chopped Tomatoes', 'Pantry & Dry Goods', 'PANTRY', [365, 545], [5, 7], null, ['canned tomatoes', 'tinned tomatoes', 'tomato passata', 'passata']],
  ['Olive Oil', 'Condiments & Sauces', 'PANTRY', [365, 730], null, null, ['extra virgin olive oil']],
  ['Vegetable Oil', 'Condiments & Sauces', 'PANTRY', [365, 730], null, null, ['sunflower oil', 'oil', 'rapeseed oil']],
  ['Soy Sauce', 'Condiments & Sauces', 'PANTRY', [730, 1095], null, null, ['soya sauce', 'light soy sauce']],
  ['Honey', 'Condiments & Sauces', 'PANTRY', [365, 730], null, null, []],
  ['Vinegar', 'Condiments & Sauces', 'PANTRY', [730, 730], null, null, ['white wine vinegar', 'red wine vinegar', 'cider vinegar']],
  ['Chicken Stock', 'Condiments & Sauces', 'PANTRY', [365, 730], [4, 5], [60, 90], ['chicken broth', 'stock cube']],
  ['Salt', 'Spices & Herbs', 'PANTRY', [1825, 1825], null, null, ['sea salt']],
  ['Black Pepper', 'Spices & Herbs', 'PANTRY', [730, 1095], null, null, ['peppercorns']],
  ['Basil', 'Spices & Herbs', 'FRIDGE', null, [5, 7], [120, 180], ['fresh basil']],
  ['Parsley', 'Spices & Herbs', 'FRIDGE', null, [7, 14], [120, 180], ['fresh parsley']],
  ['Coriander', 'Spices & Herbs', 'FRIDGE', null, [7, 10], [120, 180], ['cilantro']],
  ['Orange Juice', 'Beverages', 'FRIDGE', null, [7, 10], [240, 365], []],
  // Common in Hong Kong and Asian kitchens, plus everyday items the original table missed.
  ['Bok Choy', 'Produce', 'FRIDGE', null, [3, 5], null, ['pak choi', 'pak choy', 'shanghai pak choi']],
  ['Choy Sum', 'Produce', 'FRIDGE', null, [3, 5], null, ['chinese flowering cabbage']],
  ['Chinese Cabbage', 'Produce', 'FRIDGE', null, [7, 14], null, ['napa cabbage', 'wombok']],
  ['Bean Sprouts', 'Produce', 'FRIDGE', null, [1, 3], null, ['beansprout', 'mung bean sprouts']],
  ['Leek', 'Produce', 'FRIDGE', null, [7, 14], [300, 365], ['leeks']],
  ['Chilli', 'Produce', 'FRIDGE', null, [7, 14], [180, 240], ['chili', 'red chilli', 'chili pepper', 'bird eye chilli']],
  ['Pumpkin', 'Produce', 'PANTRY', [30, 90], [7, 10], [240, 365], ['butternut squash', 'squash']],
  ['Asparagus', 'Produce', 'FRIDGE', null, [3, 4], [240, 300], []],
  ['Pear', 'Produce', 'PANTRY', [3, 7], [5, 12], [240, 365], ['pears']],
  ['Peach', 'Produce', 'PANTRY', [1, 3], [3, 5], [240, 365], ['peaches', 'nectarine']],
  ['Pineapple', 'Produce', 'PANTRY', [1, 2], [5, 7], [180, 365], []],
  ['Watermelon', 'Produce', 'PANTRY', [7, 10], [14, 21], [240, 365], []],
  ['Kiwi', 'Produce', 'PANTRY', [3, 7], [21, 28], [120, 180], ['kiwi fruit']],
  ['Cherry', 'Produce', 'FRIDGE', null, [4, 7], [180, 240], ['cherries']],
  ['Raspberry', 'Produce', 'FRIDGE', null, [1, 3], [240, 365], ['raspberries']],
  ['Cream Cheese', 'Dairy & Eggs', 'FRIDGE', null, [14, 21], [30, 60], []],
  ['Chicken Wings', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [270, 270], ['chicken wing']],
  ['Whole Chicken', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [365, 365], []],
  ['Pork Belly', 'Meat & Seafood', 'FRIDGE', null, [3, 5], [120, 180], []],
  ['Pork Mince', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [90, 120], ['minced pork', 'ground pork']],
  ['Duck', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [180, 180], ['duck breast']],
  ['Squid', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [90, 180], ['calamari']],
  ['Crab', 'Meat & Seafood', 'FRIDGE', null, [1, 2], [60, 120], []],
  ['Fish Balls', 'Meat & Seafood', 'FRIDGE', null, [3, 5], [60, 90], ['fish ball']],
  ['Canned Tuna', 'Pantry & Dry Goods', 'PANTRY', [730, 1095], [3, 4], null, ['tinned tuna', 'tuna can']],
  ['Egg Noodles', 'Pantry & Dry Goods', 'PANTRY', [180, 365], null, null, ['dried egg noodles']],
  ['Rice Noodles', 'Pantry & Dry Goods', 'PANTRY', [365, 730], null, null, ['vermicelli', 'rice vermicelli', 'ho fun']],
  ['Instant Noodles', 'Pantry & Dry Goods', 'PANTRY', [180, 365], null, null, ['ramen packet', 'cup noodles']],
  ['Frozen Dumplings', 'Meat & Seafood', 'FREEZER', null, [1, 2], [90, 180], ['dumplings', 'gyoza', 'dim sum']],
  ['Coconut Milk', 'Pantry & Dry Goods', 'PANTRY', [365, 730], [4, 6], [30, 60], ['coconut cream']],
  ['Peanut Butter', 'Condiments & Sauces', 'PANTRY', [180, 270], [180, 270], null, []],
  ['Oyster Sauce', 'Condiments & Sauces', 'PANTRY', [365, 730], [180, 365], null, []],
  ['Fish Sauce', 'Condiments & Sauces', 'PANTRY', [730, 1095], null, null, []],
  ['Sesame Oil', 'Condiments & Sauces', 'PANTRY', [180, 365], [365, 730], null, []],
  ['Ketchup', 'Condiments & Sauces', 'PANTRY', [180, 365], [180, 180], null, ['tomato ketchup']],
  ['Mayonnaise', 'Condiments & Sauces', 'FRIDGE', null, [60, 90], null, ['mayo']],
  ['Kimchi', 'Condiments & Sauces', 'FRIDGE', null, [90, 180], null, []],
  ['Jam', 'Condiments & Sauces', 'PANTRY', [365, 730], [180, 365], null, ['jelly', 'marmalade']],
];

const ENTRIES: TaxonomyEntry[] = BUILT_IN.map(([name, category, defaultStorage, pantry, fridge, freezer, aliases]) => ({
  canonicalId: toCanonicalId(name),
  name,
  category,
  defaultStorage,
  aliases,
  shelfLifeDays: { pantry: r(pantry), fridge: r(fridge), freezer: r(freezer) },
}));

/** Category-level fallback when an ingredient is not in the reference table. */
const CATEGORY_FALLBACK: Record<FoodCategory, { storage: StorageLocation; ranges: StorageRanges }> = {
  Produce: { storage: 'FRIDGE', ranges: { pantry: { min: 2, max: 5 }, fridge: { min: 4, max: 7 }, freezer: { min: 180, max: 300 } } },
  'Dairy & Eggs': { storage: 'FRIDGE', ranges: { pantry: null, fridge: { min: 5, max: 10 }, freezer: { min: 60, max: 90 } } },
  'Meat & Seafood': { storage: 'FRIDGE', ranges: { pantry: null, fridge: { min: 1, max: 3 }, freezer: { min: 90, max: 180 } } },
  'Pantry & Dry Goods': { storage: 'PANTRY', ranges: { pantry: { min: 180, max: 365 }, fridge: null, freezer: null } },
  'Condiments & Sauces': { storage: 'PANTRY', ranges: { pantry: { min: 180, max: 365 }, fridge: { min: 30, max: 90 }, freezer: null } },
  'Spices & Herbs': { storage: 'PANTRY', ranges: { pantry: { min: 365, max: 730 }, fridge: { min: 5, max: 10 }, freezer: null } },
  Bakery: { storage: 'PANTRY', ranges: { pantry: { min: 2, max: 5 }, fridge: { min: 7, max: 14 }, freezer: { min: 60, max: 90 } } },
  Beverages: { storage: 'FRIDGE', ranges: { pantry: { min: 90, max: 365 }, fridge: { min: 5, max: 10 }, freezer: null } },
  Other: { storage: 'FRIDGE', ranges: { pantry: { min: 3, max: 7 }, fridge: { min: 3, max: 7 }, freezer: { min: 60, max: 90 } } },
};

/** Words too broad to identify a food from a partial match. */
const GENERIC_WORDS = new Set([
  'fruit', 'vegetable', 'veg', 'meat', 'fish', 'seafood', 'nut', 'seed', 'herb', 'spice', 'green', 'leaf',
  'sauce', 'oil', 'juice', 'pepper', 'cream', 'berry', 'bean', 'powder', 'paste', 'mix', 'drink', 'snack', 'food',
]);

export const FOOD_CATEGORIES = Object.keys(CATEGORY_FALLBACK) as FoodCategory[];

const CATEGORY_KEYWORDS: Array<[FoodCategory, string[]]> = [
  ['Meat & Seafood', ['beef', 'chicken', 'duck', 'lamb', 'meat', 'pork', 'sausage', 'turkey', 'bacon', 'ham', 'fish', 'salmon', 'tuna', 'prawn', 'shrimp', 'cod', 'mince', 'steak']],
  ['Dairy & Eggs', ['milk', 'cheese', 'yogurt', 'yoghurt', 'butter', 'cream', 'egg']],
  ['Bakery', ['bagel', 'bread', 'bun', 'cake', 'croissant', 'muffin', 'pastry', 'tortilla', 'roll']],
  ['Beverages', ['coffee', 'juice', 'soda', 'tea', 'water', 'wine', 'beer']],
  ['Spices & Herbs', ['salt', 'cumin', 'paprika', 'oregano', 'thyme', 'rosemary', 'basil', 'parsley', 'cinnamon', 'chili powder', 'turmeric']],
  ['Condiments & Sauces', ['sauce', 'oil', 'vinegar', 'ketchup', 'mayonnaise', 'mustard', 'stock', 'honey', 'jam']],
  ['Pantry & Dry Goods', ['rice', 'pasta', 'flour', 'sugar', 'oat', 'bean', 'lentil', 'noodle', 'cereal', 'can', 'tin']],
  ['Produce', ['apple', 'avocado', 'banana', 'berry', 'grape', 'lemon', 'lime', 'mango', 'orange', 'pear', 'peach', 'broccoli', 'cabbage', 'carrot', 'celery', 'corn', 'cucumber', 'garlic', 'lettuce', 'mushroom', 'onion', 'pepper', 'potato', 'spinach', 'tomato', 'vegetable', 'zucchini', 'fruit', 'herb']],
];

export const inferCategory = (name: string): FoodCategory => {
  const words = normaliseIngredient(name).split(' ');
  const hit = CATEGORY_KEYWORDS.find(([, keywords]) => keywords.some(keyword => words.includes(keyword)));
  return hit ? hit[0] : 'Other';
};

const STORAGE_KEY: Record<StorageLocation, keyof StorageRanges> = {
  PANTRY: 'pantry',
  FRIDGE: 'fridge',
  FREEZER: 'freezer',
};

export const rangeFor = (ranges: StorageRanges, storage: StorageLocation): DayRange | null =>
  ranges[STORAGE_KEY[storage]];

/**
 * The canonical ingredient taxonomy: maps free-text labels (from Gemini, recipes
 * or manual entry) onto canonical IDs and shelf-life reference data.
 */
export class Taxonomy {
  private readonly byId = new Map<string, TaxonomyEntry>();
  /** Primary names: later entries win, so Firestore data overrides the built-in table. */
  private readonly byName = new Map<string, TaxonomyEntry>();
  /** Aliases: first entry wins, and a primary name always beats an alias. */
  private readonly byAlias = new Map<string, TaxonomyEntry>();
  /** Lookups are repeated a lot when ranking the whole recipe catalogue. */
  private readonly memo = new Map<string, TaxonomyEntry | undefined>();

  constructor(entries: TaxonomyEntry[] = ENTRIES) {
    entries.forEach(entry => this.add(entry));
  }

  add(entry: TaxonomyEntry): void {
    const canonicalId = entry.canonicalId || toCanonicalId(entry.name);
    const stored = { ...entry, canonicalId };
    this.memo.clear();
    this.byId.set(canonicalId, stored);
    const nameKey = normaliseIngredient(entry.name);
    if (nameKey) this.byName.set(nameKey, stored);
    (entry.aliases || []).forEach(alias => {
      const key = normaliseIngredient(alias);
      if (key && !this.byAlias.has(key)) this.byAlias.set(key, stored);
    });
  }

  get size(): number {
    return this.byId.size;
  }

  /** Find the canonical entry for a label, or undefined if nothing matches well. */
  lookup(label: string): TaxonomyEntry | undefined {
    if (this.memo.has(label)) return this.memo.get(label);
    const entry = this.findEntry(label);
    if (this.memo.size > 5000) this.memo.clear();
    this.memo.set(label, entry);
    return entry;
  }

  private findEntry(label: string): TaxonomyEntry | undefined {
    const key = normaliseIngredient(label);
    if (!key) return undefined;
    const exact = this.byName.get(key) || this.byAlias.get(key);
    if (exact) return exact;
    // Generic one-word names/aliases ("fruit", "pepper", "cream") are only used for
    // exact matches; otherwise "dragon fruit" would become Dried Fruit.
    // Prefer the longest name that is a whole-word subset of the label
    // ("chopped cherry tomatoes" -> tomato, "chicken breast fillet" -> chicken breast),
    // trying primary names before aliases.
    for (const map of [this.byName, this.byAlias]) {
      let best: { entry: TaxonomyEntry; length: number } | undefined;
      for (const [name, entry] of map) {
        if (GENERIC_WORDS.has(name)) continue;
        if (ingredientsMatch(name, key) && key.split(' ').length >= name.split(' ').length) {
          if (!best || name.length > best.length) best = { entry, length: name.length };
        }
      }
      if (best) return best.entry;
    }
    return undefined;
  }

  /** Canonical ID for any label; unknown labels get a deterministic snake_case ID. */
  canonicalIdFor(label: string): string {
    return this.lookup(label)?.canonicalId || toCanonicalId(label);
  }

  displayNameFor(label: string): string {
    return this.lookup(label)?.name || titleCase(label);
  }

  /** Shelf-life estimate for a label, falling back to category defaults. */
  estimate(label: string, categoryHint?: FoodCategory): ShelfLifeEstimate {
    const entry = this.lookup(label);
    if (entry) {
      return {
        canonicalId: entry.canonicalId,
        name: entry.name,
        category: entry.category,
        defaultStorage: entry.defaultStorage,
        ranges: entry.shelfLifeDays,
        source: 'reference',
      };
    }
    const category = categoryHint && categoryHint !== 'Other' ? categoryHint : inferCategory(label);
    const fallback = CATEGORY_FALLBACK[category] || CATEGORY_FALLBACK.Other;
    return {
      canonicalId: toCanonicalId(label),
      name: titleCase(label),
      category,
      defaultStorage: fallback.storage,
      ranges: fallback.ranges,
      source: 'category-fallback',
    };
  }
}

export const titleCase = (value: string): string =>
  cleanText(value).split(' ').filter(Boolean).map(word => word[0].toUpperCase() + word.slice(1)).join(' ');

/** Convert a Firestore `shelfLifeReference` document (seed.js schema) into a TaxonomyEntry. */
export const fromReferenceDoc = (doc: Record<string, unknown>): TaxonomyEntry | undefined => {
  const name = (doc.mealDbName || doc.name) as string | undefined;
  if (!name) return undefined;
  const storage = String(doc.defaultStorage || 'fridge').toUpperCase() as StorageLocation;
  const category = (doc.category as FoodCategory) || inferCategory(name);
  const ranges = (doc.shelfLifeDays || {}) as Partial<StorageRanges>;
  return {
    canonicalId: (doc.canonicalId as string) || toCanonicalId(name),
    name,
    category: CATEGORY_FALLBACK[category] ? category : inferCategory(name),
    defaultStorage: ['PANTRY', 'FRIDGE', 'FREEZER'].includes(storage) ? storage : 'FRIDGE',
    aliases: Array.isArray(doc.aliases) ? (doc.aliases as string[]) : [],
    shelfLifeDays: {
      pantry: ranges.pantry ?? null,
      fridge: ranges.fridge ?? null,
      freezer: ranges.freezer ?? null,
    },
  };
};
