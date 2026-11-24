import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import type {
  DetectedItem,
  InventoryItem,
  RecipeInventoryItem,
  RecommendResponse,
  ScanResponse,
  ShelfLifeEstimate,
  StorageLocation,
  SubstitutionResponse,
  UserPreferences,
} from '../../shared/types';
import { ALLERGEN_RULES, isRecipeFeasible } from './domain/dietary';
import { expiryWindow, todayString } from './domain/expiry';
import { buildRecipePrompt, parseGenerateOptions, RECIPE_SYSTEM_PROMPT, validateGeneratedRecipe } from './domain/generatedRecipe';
import { DEFAULT_WEIGHTS, GENERATE_SUGGESTION_THRESHOLD, rankRecipes, RankingWeights, RecipeCandidate, scoreRecipe } from './domain/ranking';
import { adjustForRipeness, plausiblePrintedDate } from './domain/shelfLife';
import { suggestSubstitutions, validateLlmSubstitutions } from './domain/substitution';
import { rangeFor, Taxonomy } from './domain/taxonomy';
import { authenticate, AuthedRequest, TokenVerifier } from './middleware/auth';
import type { LlmClients, RawDetection } from './services/llm';
import type { RecipeSource } from './services/mealdb';
import { ShelfLifeService } from './services/shelfLife';
import type { UserDataRepository } from './services/repository';

export interface AppDeps {
  llm: LlmClients;
  recipes: RecipeSource;
  repository: UserDataRepository;
  taxonomy: Taxonomy;
  /** Defaults to the taxonomy plus AI estimates from llm.text. */
  shelfLife?: ShelfLifeService;
  verifyToken?: TokenVerifier;
  allowDeviceAuth?: boolean;
  /** Return canned detections when no vision model is configured (demo mode). */
  allowMockVision?: boolean;
  weights?: RankingWeights;
  /** Injectable clock for tests; returns YYYY-MM-DD. */
  today?: () => string;
}

/** ~1 MB image target from the proposal, with headroom: 2 MB of decoded bytes. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_INVENTORY_ITEMS = 500;
const STORAGES: StorageLocation[] = ['FRIDGE', 'FREEZER', 'PANTRY'];
const DIETS = ['none', 'vegetarian', 'pescatarian', 'vegan'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const MOCK_DETECTIONS: RawDetection[] = [
  { label: 'spinach', confidence: 0.93, quantity: 1, unit: 'bag' },
  { label: 'avocado', confidence: 0.88, quantity: 2, unit: 'unit' },
  { label: 'egg', confidence: 0.97, quantity: 6, unit: 'unit', group: 'egg carton' },
  { label: 'cheddar cheese', confidence: 0.61, quantity: 1, unit: 'pack' },
];

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const asyncRoute = (handler: (req: AuthedRequest, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    handler(req as AuthedRequest, res).catch(next);
  };

const parseInventory = (value: unknown): RecipeInventoryItem[] => {
  if (!Array.isArray(value)) throw new HttpError(400, 'inventory must be an array');
  if (value.length > MAX_INVENTORY_ITEMS) throw new HttpError(400, 'inventory is too large');
  return value.flatMap((entry, index) => {
    const e = entry as Record<string, unknown>;
    if (!e || typeof e.name !== 'string' || !e.name.trim()) return [];
    const expiryDate = typeof e.expiryDate === 'string' && DATE.test(e.expiryDate) ? e.expiryDate : '9999-12-31';
    return [{
      id: typeof e.id === 'string' ? e.id : `item_${index}`,
      name: e.name.trim(),
      canonicalId: typeof e.canonicalId === 'string' ? e.canonicalId : '',
      expiryDate,
    }];
  });
};

export const parsePreferences = (value: unknown): Partial<UserPreferences> => {
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : []);
  const history: Record<string, number> = {};
  if (v.cuisineHistory && typeof v.cuisineHistory === 'object') {
    Object.entries(v.cuisineHistory as Record<string, unknown>).forEach(([key, count]) => {
      if (typeof count === 'number' && count > 0) history[key] = count;
    });
  }
  return {
    allergens: strings(v.allergens).filter(a => a in ALLERGEN_RULES) as UserPreferences['allergens'],
    diet: DIETS.includes(v.diet as string) ? v.diet as UserPreferences['diet'] : 'none',
    favouriteCuisines: strings(v.favouriteCuisines),
    cuisineHistory: history,
  };
};

const parseStoredItem = (value: unknown): InventoryItem => {
  const v = value as Record<string, unknown>;
  const ok = v && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.canonicalId === 'string' &&
    STORAGES.includes(v.storageLocation as StorageLocation) && typeof v.quantity === 'number' &&
    typeof v.buyDate === 'string' && DATE.test(v.buyDate) && typeof v.expiryDate === 'string' && DATE.test(v.expiryDate);
  if (!ok) throw new HttpError(400, 'Invalid inventory item');
  return {
    id: v.id as string,
    canonicalId: v.canonicalId as string,
    name: (v.name as string).slice(0, 80),
    category: (typeof v.category === 'string' ? v.category : 'Other') as InventoryItem['category'],
    storageLocation: v.storageLocation as StorageLocation,
    quantity: v.quantity as number,
    unit: typeof v.unit === 'string' ? v.unit.slice(0, 20) : 'unit',
    buyDate: v.buyDate as string,
    expiryEarliest: typeof v.expiryEarliest === 'string' && DATE.test(v.expiryEarliest) ? v.expiryEarliest : v.expiryDate as string,
    expiryDate: v.expiryDate as string,
    expirySource: v.expirySource === 'label' ? 'label' : 'estimate',
    ...(typeof v.confidence === 'number' ? { confidence: v.confidence } : {}),
  };
};

export const createApp = (deps: AppDeps) => {
  const {
    llm, recipes, repository, taxonomy,
    weights = DEFAULT_WEIGHTS,
    today = () => todayString(),
  } = deps;
  const shelfLife = deps.shelfLife || new ShelfLifeService(taxonomy, llm.text);
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      vision: llm.vision?.name || null,
      text: llm.text?.name || null,
      taxonomySize: taxonomy.size,
    });
  });

  app.use('/api', authenticate({ verifyToken: deps.verifyToken, allowDeviceAuth: deps.allowDeviceAuth ?? true }));

  /** Shelf-life lookup for manual entry / editing (section 5). */
  app.get('/api/shelf-life', asyncRoute(async (req, res) => {
    const ingredient = typeof req.query.ingredient === 'string' ? req.query.ingredient.trim().slice(0, 80) : '';
    if (!ingredient) throw new HttpError(400, 'ingredient is required');
    const estimate = await shelfLife.estimate(ingredient);
    const storage = STORAGES.includes(req.query.storage as StorageLocation)
      ? req.query.storage as StorageLocation
      : estimate.defaultStorage;
    const buyDate = typeof req.query.buyDate === 'string' && DATE.test(req.query.buyDate) ? req.query.buyDate : today();
    const range = rangeFor(estimate.ranges, storage);
    res.json({
      success: true,
      ...estimate,
      storage,
      expiry: range ? expiryWindow(buyDate, range) : null,
    });
  }));

  /** Type-ahead food names for manual entry, each with its shelf-life data. */
  app.get('/api/ingredients', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 60) : '';
    const items: ShelfLifeEstimate[] = taxonomy.search(q).map(entry => ({
      canonicalId: entry.canonicalId,
      name: entry.name,
      category: entry.category,
      defaultStorage: entry.defaultStorage,
      ranges: entry.shelfLifeDays,
      source: 'reference',
    }));
    res.json({ success: true, items });
  });

  /**
   * Photo recognition (section 4). The image only lives in memory for the duration
   * of this request and is never logged or written anywhere.
   */
  app.post('/api/scan', asyncRoute(async (req, res) => {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body as { imageBase64?: unknown; mimeType?: unknown };
    if (typeof imageBase64 !== 'string' || imageBase64.length < 100) {
      throw new HttpError(400, 'imageBase64 is required');
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType as string)) {
      throw new HttpError(400, 'Unsupported image type');
    }
    if (Math.floor(imageBase64.length * 3 / 4) > MAX_IMAGE_BYTES) {
      throw new HttpError(413, 'Image too large; compress to about 1 MB before uploading');
    }

    let raw: RawDetection[];
    let source: ScanResponse['source'];
    if (llm.vision) {
      try {
        raw = await llm.vision.identifyFoods(imageBase64, mimeType as string);
      } catch (error) {
        throw new HttpError(502, `Photo recognition failed (${(error as Error).message}). Try again in a moment.`);
      }
      source = 'gemini_vision';
    } else if (deps.allowMockVision) {
      raw = MOCK_DETECTIONS;
      source = 'mock_fallback';
    } else {
      throw new HttpError(503, 'Photo recognition is not configured; add items manually');
    }

    const date = today();
    const items: DetectedItem[] = (await Promise.all(raw.map(async detection => {
      const estimate = await shelfLife.estimate(detection.label);
      const ripeness = estimate.category === 'Produce' ? detection.ripeness : undefined;
      const printedDate = plausiblePrintedDate(detection.printedDate, date);
      const item: DetectedItem = {
        label: detection.label,
        name: estimate.name,
        canonicalId: estimate.canonicalId,
        category: estimate.category,
        confidence: detection.confidence,
        quantity: detection.quantity,
        unit: detection.unit,
        group: detection.group,
        storageLocation: estimate.defaultStorage,
        shelfLife: { ...estimate, ranges: adjustForRipeness(estimate.ranges, ripeness, estimate.category) },
        ...(printedDate ? { printedDate } : {}),
        ...(ripeness ? { ripeness } : {}),
      };
      return item;
    }))).sort((a, b) => b.confidence - a.confidence);

    const response: ScanResponse = { success: true, source, items };
    res.json(response);
  }));

  /** Expiry-driven recommendations from the recipe database (sections 6.1-6.4). */
  app.post('/api/recipes/recommend', asyncRoute(async (req, res) => {
    const inventory = parseInventory(req.body?.inventory);
    const preferences = parsePreferences(req.body?.preferences);
    const date = typeof req.body?.today === 'string' && DATE.test(req.body.today) ? req.body.today : today();
    inventory.forEach(item => { if (!item.canonicalId) item.canonicalId = taxonomy.canonicalIdFor(item.name); });
    if (inventory.length === 0) {
      const empty: RecommendResponse = { success: true, recipes: [], suggestGenerate: false };
      return res.json(empty);
    }

    const ranked = rankRecipes(await recipeCandidates(inventory), inventory, preferences, taxonomy, date, weights)
      // With the whole catalogue loaded, skip recipes that use nothing you own.
      .filter(recipe => recipe.ingredients.some(i => i.inventoryItemId))
      .slice(0, 10);
    const best = ranked[0]?.score.coverage ?? 0;
    const response: RecommendResponse = {
      success: true,
      recipes: ranked,
      suggestGenerate: Boolean(llm.text) && best < GENERATE_SUGGESTION_THRESHOLD,
    };
    res.json(response);
  }));

  /**
   * Every recipe in the catalogue when the source can list it (TheMealDB: ~300),
   * otherwise up to 24 found by searching for the most urgent ingredients.
   */
  const recipeCandidates = async (inventory: RecipeInventoryItem[]): Promise<RecipeCandidate[]> => {
    if (recipes.all) {
      try {
        const all = await recipes.all();
        if (all.length > 0) return all;
      } catch (error) {
        console.warn('Recipe catalogue unavailable, searching by ingredient:', (error as Error).message);
      }
    }
    // Search with the most urgent ingredients first so their recipes are always considered.
    const byUrgency = [...inventory].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    const terms = [...new Set(byUrgency.map(item => taxonomy.displayNameFor(item.name).toLowerCase()))].slice(0, 8);
    const idLists = await Promise.all(terms.map(async term => {
      try {
        const ids = await recipes.idsByIngredient(term);
        if (ids.length > 0 || !term.includes(' ')) return ids;
        return await recipes.idsByIngredient(term.split(' ').pop() as string);
      } catch {
        return [];
      }
    }));
    // Interleave the lists so every ingredient contributes candidates.
    const ids: string[] = [];
    for (let i = 0; ids.length < 24 && idLists.some(list => i < list.length); i++) {
      idLists.forEach(list => { if (list[i] && !ids.includes(list[i])) ids.push(list[i]); });
    }
    return (await Promise.all(ids.slice(0, 24).map(id => recipes.lookup(id).catch(() => null))))
      .filter((r): r is RecipeCandidate => Boolean(r));
  };

  /** LLM adaptation when no stored recipe fits (section 6.6). */
  app.post('/api/recipes/generate', asyncRoute(async (req, res) => {
    const inventory = parseInventory(req.body?.inventory);
    const preferences = parsePreferences(req.body?.preferences);
    const date = today();
    if (inventory.length === 0) throw new HttpError(400, 'Add some inventory items first');
    const options = parseGenerateOptions(req.body?.options, inventory.map(item => item.id));
    if (options.include && options.include.length === 0 && !options.mustUse) throw new HttpError(400, 'Pick at least one ingredient');
    if (!llm.text) throw new HttpError(503, 'Recipe generation is not configured');
    inventory.forEach(item => { if (!item.canonicalId) item.canonicalId = taxonomy.canonicalIdFor(item.name); });

    let raw: unknown;
    try {
      raw = await llm.text.generateJson(RECIPE_SYSTEM_PROMPT, buildRecipePrompt(inventory, preferences, date, options));
    } catch (error) {
      console.warn('Recipe generation failed:', (error as Error).message);
      throw new HttpError(503, 'The AI recipe service is busy right now. Try again in a minute.');
    }
    let candidate: RecipeCandidate;
    try {
      candidate = validateGeneratedRecipe(raw, `generated_${Date.now()}`);
    } catch (error) {
      throw new HttpError(502, `Generated recipe was rejected: ${(error as Error).message}. Try again.`);
    }
    if (!isRecipeFeasible(candidate.ingredients.map(i => i.name), preferences)) {
      throw new HttpError(502, 'Generated recipe conflicted with your dietary constraints; try again');
    }
    res.json({ success: true, recipe: scoreRecipe(candidate, inventory, preferences, taxonomy, date, weights) });
  }));

  /** Substitutions for missing ingredients by culinary role (section 6.5). */
  app.post('/api/recipes/substitutions', asyncRoute(async (req, res) => {
    const missing = Array.isArray(req.body?.missing)
      ? (req.body.missing as unknown[]).filter((m): m is string => typeof m === 'string' && m.trim().length > 0).slice(0, 20)
      : [];
    if (missing.length === 0) throw new HttpError(400, 'missing must list at least one ingredient');
    const inventory = parseInventory(req.body?.inventory ?? []);
    const preferences = parsePreferences(req.body?.preferences);

    const rules = suggestSubstitutions(missing, inventory, preferences);
    let llmSubs: SubstitutionResponse['substitutions'] = [];
    const uncovered = missing.filter(m => !rules.some(r => r.missing === m));
    if (llm.text && uncovered.length > 0) {
      try {
        const raw = await llm.text.generateJson(
          'You suggest cooking substitutions by culinary role (fat, acid, thickener, binder, protein base, dairy, sweetener, aromatic, herb/spice, starch, liquid, vegetable). Return ONLY {"substitutions":[{"missing":string,"substitute":string,"role":string,"note":string}]}, at most 2 per ingredient. Prefer items from the inventory. Never break the constraints.',
          JSON.stringify({
            recipe: typeof req.body?.recipeTitle === 'string' ? req.body.recipeTitle : undefined,
            missing: uncovered,
            inventory: inventory.map(i => i.name),
            constraints: { allergens: preferences.allergens, diet: preferences.diet },
          }),
        );
        llmSubs = validateLlmSubstitutions(raw, uncovered, inventory, preferences);
      } catch (error) {
        console.warn('LLM substitution failed, using rules only:', (error as Error).message);
      }
    }
    const response: SubstitutionResponse = { success: true, substitutions: [...rules, ...llmSubs] };
    res.json(response);
  }));

  /** Inventory sync: the client is offline-first and pushes its full list. */
  app.get('/api/inventory', asyncRoute(async (req, res) => {
    res.json({ success: true, items: await repository.getInventory(req.uid as string) });
  }));

  app.put('/api/inventory', asyncRoute(async (req, res) => {
    const items = req.body?.items;
    if (!Array.isArray(items) || items.length > MAX_INVENTORY_ITEMS) throw new HttpError(400, 'items must be an array');
    const parsed = items.map(parseStoredItem);
    await repository.replaceInventory(req.uid as string, parsed);
    res.json({ success: true, count: parsed.length });
  }));

  app.get('/api/preferences', asyncRoute(async (req, res) => {
    res.json({ success: true, preferences: await repository.getPreferences(req.uid as string) });
  }));

  app.put('/api/preferences', asyncRoute(async (req, res) => {
    const preferences = parsePreferences(req.body?.preferences) as UserPreferences;
    await repository.setPreferences(req.uid as string, preferences);
    res.json({ success: true, preferences });
  }));

  /** "Delete all my data" (privacy, section 8). */
  app.delete('/api/me/data', asyncRoute(async (req, res) => {
    await repository.deleteAll(req.uid as string);
    res.json({ success: true });
  }));

  app.use((_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((error: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ success: false, error: error.message });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ success: false, error: 'Request too large' });
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'Invalid JSON body' });
    }
    console.error('Unhandled error:', error.message);
    return res.status(502).json({ success: false, error: 'Upstream service failed; please try again' });
  });

  return app;
};
