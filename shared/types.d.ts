/**
 * Types shared by the React Native client and the Express backend.
 *
 * This is a declaration-only file so both sides can `import type` from it
 * without any build step or bundler configuration.
 */

export type StorageLocation = 'FRIDGE' | 'FREEZER' | 'PANTRY';

/** Colour-coded urgency tier: URGENT = red, WARNING = amber, SAFE = green. */
export type UrgencyTier = 'URGENT' | 'WARNING' | 'SAFE';

export type FoodCategory =
  | 'Produce'
  | 'Dairy & Eggs'
  | 'Meat & Seafood'
  | 'Pantry & Dry Goods'
  | 'Condiments & Sauces'
  | 'Spices & Herbs'
  | 'Bakery'
  | 'Beverages'
  | 'Other';

export interface DayRange {
  min: number;
  max: number;
}

export interface StorageRanges {
  pantry: DayRange | null;
  fridge: DayRange | null;
  freezer: DayRange | null;
}

/** Shelf-life estimate for one ingredient, from the reference table. */
export interface ShelfLifeEstimate {
  canonicalId: string;
  name: string;
  category: FoodCategory;
  defaultStorage: StorageLocation;
  ranges: StorageRanges;
  /** reference = shelf-life table, ai-estimate = AI answer for a food not in the table. */
  source: 'reference' | 'ai-estimate' | 'category-fallback';
}

/** Ripeness the vision model saw (produce only); it shortens or lengthens the estimate. */
export type Ripeness = 'unripe' | 'ripe' | 'overripe';

/** One item in the user's pantry. Urgency is always derived from expiryDate, never stored. */
export interface InventoryItem {
  id: string;
  canonicalId: string;
  name: string;
  category: FoodCategory;
  storageLocation: StorageLocation;
  quantity: number;
  unit: string;
  /** YYYY-MM-DD */
  buyDate: string;
  /** Earliest estimated expiry, YYYY-MM-DD. Equal to expiryDate when the date came from a label. */
  expiryEarliest: string;
  /** Latest estimated expiry (or the printed date), YYYY-MM-DD. */
  expiryDate: string;
  expirySource: 'estimate' | 'label';
  confidence?: number;
}

/** A candidate item returned by photo recognition, before the user confirms it. */
export interface DetectedItem {
  label: string;
  name: string;
  canonicalId: string;
  category: FoodCategory;
  confidence: number;
  quantity: number;
  unit: string;
  /** Items Gemini thinks belong together in one photo (e.g. "egg carton"). */
  group?: string;
  storageLocation: StorageLocation;
  /** Ranges here already include the ripeness adjustment. */
  shelfLife: ShelfLifeEstimate;
  /** Use-by / best-before date read off the packaging (YYYY-MM-DD), if legible. */
  printedDate?: string;
  ripeness?: Ripeness;
}

export interface ScanResponse {
  success: true;
  source: 'gemini_vision' | 'mock_fallback';
  items: DetectedItem[];
}

export type Allergen =
  | 'dairy'
  | 'egg'
  | 'gluten'
  | 'peanut'
  | 'tree nut'
  | 'fish'
  | 'shellfish'
  | 'soy'
  | 'sesame';

export type Diet = 'none' | 'vegetarian' | 'pescatarian' | 'vegan';

export interface UserPreferences {
  allergens: Allergen[];
  diet: Diet;
  favouriteCuisines: string[];
  /** cuisine -> number of times the user cooked a recipe of that cuisine */
  cuisineHistory: Record<string, number>;
}

/** Inventory as sent to the recipe engine: names, canonical IDs and expiry only. */
export interface RecipeInventoryItem {
  id: string;
  name: string;
  canonicalId: string;
  expiryDate: string;
}

export type CulinaryRole =
  | 'fat'
  | 'acid'
  | 'thickener'
  | 'binder'
  | 'protein base'
  | 'dairy'
  | 'sweetener'
  | 'aromatic'
  | 'herb/spice'
  | 'starch'
  | 'liquid'
  | 'vegetable'
  | 'other';

export interface Substitution {
  missing: string;
  substitute: string;
  role: CulinaryRole;
  /** True when the substitute is already in the user's inventory. */
  fromInventory: boolean;
  inventoryItemId?: string;
  note?: string;
  source: 'rules' | 'llm';
}

export type IngredientStatus = 'owned' | 'expiring' | 'missing' | 'staple';

export interface RecipeIngredient {
  name: string;
  canonicalId: string;
  measure: string;
  status: IngredientStatus;
  /** The inventory item that covers this ingredient, if any. */
  inventoryItemId?: string;
}

export interface RecipeScore {
  total: number;
  coverage: number;
  urgency: number;
  preference: number;
}

export interface RankedRecipe {
  id: string;
  title: string;
  description: string;
  cuisine?: string;
  category?: string;
  thumbnail?: string;
  source: 'database' | 'generated';
  servings: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  score: RecipeScore;
  /** Coverage as a 0-100 integer, for display. */
  matchPercentage: number;
  missingIngredients: string[];
  expiringIngredients: string[];
}

export interface RecommendRequest {
  inventory: RecipeInventoryItem[];
  preferences?: Partial<UserPreferences>;
  /** YYYY-MM-DD; lets tests pin "today". Defaults to the server date. */
  today?: string;
}

export interface RecommendResponse {
  success: true;
  recipes: RankedRecipe[];
  /** True when no stored recipe covers the inventory well, so the client should offer LLM adaptation. */
  suggestGenerate: boolean;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Choices made on the "Generate a recipe" screen. */
export interface GenerateOptions {
  /** Inventory item IDs the AI may use. Omitted means everything. */
  include?: string[];
  /** Inventory item IDs the recipe must be built around. */
  mustUse?: string[];
  mealType?: MealType;
  /** Upper limit on total prep + cooking time. */
  maxMinutes?: number;
}

export interface SubstitutionRequest {
  missing: string[];
  inventory: RecipeInventoryItem[];
  preferences?: Partial<UserPreferences>;
  recipeTitle?: string;
}

export interface SubstitutionResponse {
  success: true;
  substitutions: Substitution[];
}
