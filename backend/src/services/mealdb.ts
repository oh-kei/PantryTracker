import type { RecipeCandidate } from '../domain/ranking';

/** Source of stored recipes. TheMealDB in production, fixtures in tests. */
export interface RecipeSource {
  /** Recipe IDs that use the given ingredient. */
  idsByIngredient(ingredient: string): Promise<string[]>;
  lookup(id: string): Promise<RecipeCandidate | null>;
  /** The whole catalogue, if the source can list it; recommendations then rank every recipe. */
  all?(): Promise<RecipeCandidate[]>;
}

const CATALOGUE_TTL_MS = 24 * 60 * 60 * 1000;
/** Retry sooner when some letters failed to load. */
const PARTIAL_RETRY_MS = 10 * 60 * 1000;

interface MealDbMeal {
  idMeal: string;
  strMeal: string;
  strMealThumb: string | null;
  strCategory: string | null;
  strArea: string | null;
  strInstructions: string | null;
  [key: string]: string | null;
}

/** TheMealDB has no servings field; most of its recipes serve about four. */
const DEFAULT_SERVINGS = 4;

export const toSteps = (instructions: string | null): string[] => {
  const clean = (parts: string[]) => parts
    .map(step => step.replace(/^\s*(step\s*)?\d+[.):]?\s*/i, '').trim())
    .filter(step => step.length > 2 && !/^step\s*\d*$/i.test(step));
  const byLine = clean((instructions || '').split(/\r?\n+/));
  // Some recipes are a single paragraph: fall back to splitting on sentences.
  return byLine.length > 1 ? byLine : clean((instructions || '').split(/(?<=[.!?])\s+/));
};

export const mealToCandidate = (meal: MealDbMeal): RecipeCandidate => {
  const ingredients = Array.from({ length: 20 }, (_, i) => ({
    name: (meal[`strIngredient${i + 1}`] || '').trim(),
    measure: (meal[`strMeasure${i + 1}`] || '').trim(),
  })).filter(i => i.name);
  const cuisine = meal.strArea && meal.strArea !== 'Unknown' ? meal.strArea : undefined;
  return {
    id: `mealdb_${meal.idMeal}`,
    title: meal.strMeal,
    description: [cuisine, meal.strCategory].filter(Boolean).join(' · ') || 'Recipe from TheMealDB',
    cuisine,
    category: meal.strCategory || undefined,
    thumbnail: meal.strMealThumb || undefined,
    source: 'database',
    servings: DEFAULT_SERVINGS,
    ingredients,
    steps: toSteps(meal.strInstructions),
  };
};

export class MealDbSource implements RecipeSource {
  private readonly cache = new Map<string, RecipeCandidate | null>();
  private readonly idCache = new Map<string, string[]>();
  private catalogue?: { expires: number; promise: Promise<RecipeCandidate[]> };

  constructor(private readonly baseUrl = 'https://www.themealdb.com/api/json/v1/1') {}

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`);
    if (!response.ok) throw new Error(`TheMealDB request failed with status ${response.status}`);
    return response.json() as Promise<T>;
  }

  async idsByIngredient(ingredient: string): Promise<string[]> {
    const key = ingredient.toLowerCase().trim().replace(/\s+/g, '_');
    if (this.idCache.has(key)) return this.idCache.get(key) as string[];
    const data = await this.get<{ meals: Array<{ idMeal: string }> | null }>(`/filter.php?i=${encodeURIComponent(key)}`);
    const ids = (data.meals || []).map(meal => `mealdb_${meal.idMeal}`);
    this.idCache.set(key, ids);
    return ids;
  }

  async lookup(id: string): Promise<RecipeCandidate | null> {
    if (this.cache.has(id)) return this.cache.get(id) as RecipeCandidate | null;
    const rawId = id.replace(/^mealdb_/, '');
    const data = await this.get<{ meals: MealDbMeal[] | null }>(`/lookup.php?i=${encodeURIComponent(rawId)}`);
    const meal = data.meals?.[0];
    const candidate = meal ? mealToCandidate(meal) : null;
    this.cache.set(id, candidate);
    return candidate;
  }

  /** TheMealDB's free API has no "list all", so fetch every meal by first letter. Cached for a day. */
  async all(): Promise<RecipeCandidate[]> {
    if (this.catalogue && Date.now() < this.catalogue.expires) return this.catalogue.promise;
    const promise = this.loadCatalogue();
    this.catalogue = { expires: Date.now() + CATALOGUE_TTL_MS, promise };
    promise.catch(() => { this.catalogue = undefined; });
    return promise;
  }

  private async loadCatalogue(): Promise<RecipeCandidate[]> {
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const meals = new Map<string, RecipeCandidate>();
    let failed = 0;
    for (let i = 0; i < letters.length; i += 6) {
      const batch = await Promise.all(letters.slice(i, i + 6).map(letter =>
        this.get<{ meals: MealDbMeal[] | null }>(`/search.php?f=${letter}`)
          .then(data => data.meals || [])
          .catch(() => { failed++; return [] as MealDbMeal[]; })));
      batch.flat().forEach(meal => {
        const candidate = mealToCandidate(meal);
        this.cache.set(candidate.id, candidate);
        meals.set(candidate.id, candidate);
      });
    }
    if (meals.size === 0) throw new Error('TheMealDB catalogue could not be loaded');
    if (failed > 0 && this.catalogue) this.catalogue.expires = Date.now() + PARTIAL_RETRY_MS;
    return [...meals.values()];
  }
}
