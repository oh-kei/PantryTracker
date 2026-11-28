import { ingredientsMatch } from '../domain/normalise';
import type { RecipeCandidate } from '../domain/ranking';
import type { RecipeSource } from './mealdb';

const CATALOGUE_TTL_MS = 24 * 60 * 60 * 1000;
/** After a failed fetch, serve nothing for this long rather than waiting on a dead service every request. */
const FAILURE_BACKOFF_MS = 10 * 60 * 1000;

const idsUsing = (recipes: RecipeCandidate[], ingredient: string) =>
  recipes.filter(r => r.ingredients.some(i => ingredientsMatch(ingredient, i.name))).map(r => r.id);

/** A fixed list of recipes held in memory (the built-in basic recipes). */
export class StaticRecipeSource implements RecipeSource {
  private readonly byId: Map<string, RecipeCandidate>;

  constructor(private readonly recipes: RecipeCandidate[]) {
    this.byId = new Map(recipes.map(r => [r.id, r]));
  }

  async idsByIngredient(ingredient: string) { return idsUsing(this.recipes, ingredient); }
  async lookup(id: string) { return this.byId.get(id) ?? null; }
  async all() { return this.recipes; }
}

interface DummyJsonRecipe {
  id: number;
  name: string;
  ingredients: string[];
  instructions: string[];
  servings?: number;
  cuisine?: string;
  mealType?: string[];
  image?: string;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  difficulty?: string;
}

/** "Salt and pepper to taste" -> Salt, Pepper; "Fresh basil leaves (optional)" -> Fresh basil leaves. */
export const cleanDummyIngredient = (raw: string): Array<{ name: string; measure: string }> => {
  const name = raw
    .replace(/\(.*?\)/g, '')
    .replace(/,?\s*(to taste|for (garnish|serving|frying|drizzling)|as needed|optional)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name) return [];
  if (/^salt and (black )?pepper$/i.test(name)) return [{ name: 'Salt', measure: 'to taste' }, { name: 'Black Pepper', measure: 'to taste' }];
  return [{ name, measure: '' }];
};

export const dummyToCandidate = (recipe: DummyJsonRecipe): RecipeCandidate => {
  const minutes = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);
  const category = recipe.mealType?.[0];
  return {
    id: `dummyjson_${recipe.id}`,
    title: recipe.name,
    description: [recipe.cuisine, category, minutes ? `about ${minutes} min` : null].filter(Boolean).join(' · '),
    cuisine: recipe.cuisine || undefined,
    category,
    thumbnail: recipe.image || undefined,
    source: 'database',
    servings: recipe.servings || 4,
    ingredients: recipe.ingredients.flatMap(cleanDummyIngredient),
    steps: recipe.instructions.map(step => step.trim()).filter(Boolean),
  };
};

/** DummyJSON's free recipe set (about 50 recipes, no key). Fetched once and cached for a day. */
export class DummyJsonSource implements RecipeSource {
  private catalogue?: { expires: number; promise: Promise<RecipeCandidate[]> };

  constructor(private readonly url = 'https://dummyjson.com/recipes?limit=0', private readonly timeoutMs = 10_000) {}

  async all(): Promise<RecipeCandidate[]> {
    if (this.catalogue && Date.now() < this.catalogue.expires) return this.catalogue.promise;
    const promise = this.load();
    this.catalogue = { expires: Date.now() + CATALOGUE_TTL_MS, promise };
    promise.catch(error => {
      console.warn('DummyJSON recipes unavailable, retrying in 10 minutes:', (error as Error).message);
      this.catalogue = { expires: Date.now() + FAILURE_BACKOFF_MS, promise: Promise.resolve([]) };
    });
    return promise;
  }

  private async load(): Promise<RecipeCandidate[]> {
    const response = await fetch(this.url, { signal: AbortSignal.timeout(this.timeoutMs) });
    if (!response.ok) throw new Error(`DummyJSON request failed with status ${response.status}`);
    const data = await response.json() as { recipes?: DummyJsonRecipe[] };
    return (data.recipes || []).filter(r => r.name && Array.isArray(r.ingredients) && Array.isArray(r.instructions)).map(dummyToCandidate);
  }

  async idsByIngredient(ingredient: string) { return idsUsing(await this.all(), ingredient); }
  async lookup(id: string) { return (await this.all()).find(r => r.id === id) ?? null; }
}

export interface SourceEntry {
  /** IDs from this source start with this, e.g. "mealdb_". */
  prefix: string;
  source: RecipeSource;
  /** Optional sources may fail without affecting the others. */
  optional?: boolean;
}

/**
 * Several recipe sources behind one interface. The catalogue is every source's
 * recipes together; if a required source can't be listed, `all()` fails so the
 * app falls back to searching by ingredient (which still covers every source).
 */
export class CombinedRecipeSource implements RecipeSource {
  constructor(private readonly entries: SourceEntry[]) {}

  async idsByIngredient(ingredient: string): Promise<string[]> {
    const results = await Promise.allSettled(this.entries.map(e => e.source.idsByIngredient(ingredient)));
    const required = results.find((r, i) => r.status === 'rejected' && !this.entries[i].optional);
    const ids = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
    if (required && ids.length === 0) throw (required as PromiseRejectedResult).reason;
    return ids;
  }

  async lookup(id: string): Promise<RecipeCandidate | null> {
    const entry = this.entries.find(e => id.startsWith(e.prefix));
    return entry ? entry.source.lookup(id) : null;
  }

  async all(): Promise<RecipeCandidate[]> {
    const results = await Promise.allSettled(this.entries.map(async e => {
      if (!e.source.all) throw new Error(`${e.prefix} source can't list its recipes`);
      return e.source.all();
    }));
    results.forEach((r, i) => {
      if (r.status === 'rejected' && !this.entries[i].optional) throw r.reason;
      if (r.status === 'rejected') console.warn(`Recipes from ${this.entries[i].prefix}* unavailable:`, (r.reason as Error).message);
    });
    return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
  }

  /** How many recipes each source contributed, for the startup log. */
  async counts(): Promise<Record<string, number>> {
    const all = await this.all();
    return Object.fromEntries(this.entries.map(e => [e.prefix.replace(/_$/, ''), all.filter(r => r.id.startsWith(e.prefix)).length]));
  }
}
