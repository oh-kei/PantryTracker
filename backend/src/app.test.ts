import request from 'supertest';
import { FIXTURE_RECIPES, fixtureRecipeSource, RECORDED_GENERATED_RECIPE, RECORDED_VISION_RESPONSE } from './__fixtures__/recipes';
import { createApp, AppDeps } from './app';
import { addDays } from './domain/expiry';
import { Taxonomy } from './domain/taxonomy';
import { extractJson, parseDetections, TextClient, VisionClient } from './services/llm';
import { MemoryRepository } from './services/repository';

const TODAY = '2026-11-15';
const DEVICE = { 'X-Device-Id': 'test-device-1234' };
const IMAGE = 'A'.repeat(400);

const visionFixture: VisionClient = {
  name: 'fixture',
  identifyFoods: async () => parseDetections(extractJson(RECORDED_VISION_RESPONSE)),
};
const textFixture = (response: unknown): TextClient => ({
  name: 'fixture',
  generateJson: jest.fn(async () => response),
});

const build = (overrides: Partial<AppDeps> = {}) => createApp({
  llm: { vision: visionFixture, text: textFixture(RECORDED_GENERATED_RECIPE) },
  recipes: fixtureRecipeSource(),
  repository: new MemoryRepository(),
  taxonomy: new Taxonomy(),
  today: () => TODAY,
  ...overrides,
});

describe('auth', () => {
  it('allows health without auth but requires it elsewhere', async () => {
    const app = build();
    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/inventory').expect(401);
    await request(app).get('/api/inventory').set('X-Device-Id', 'bad id!').expect(401);
  });

  it('accepts verified Firebase tokens and rejects bad ones', async () => {
    const app = build({
      allowDeviceAuth: false,
      verifyToken: async token => { if (token !== 'good') throw new Error('nope'); return 'uid-1'; },
    });
    await request(app).get('/api/inventory').set('Authorization', 'Bearer good').expect(200);
    await request(app).get('/api/inventory').set('Authorization', 'Bearer bad').expect(401);
    await request(app).get('/api/inventory').set(DEVICE).expect(401);
  });
});

describe('POST /api/scan', () => {
  it('maps detections onto the taxonomy with shelf-life estimates', async () => {
    const res = await request(build()).post('/api/scan').set(DEVICE).send({ imageBase64: IMAGE }).expect(200);
    expect(res.body.source).toBe('gemini_vision');
    expect(res.body.items.map((i: { canonicalId: string }) => i.canonicalId)).toEqual(['egg', 'spinach', 'mystery_jar']);
    const egg = res.body.items[0];
    expect(egg).toMatchObject({ name: 'Egg', quantity: 6, group: 'egg carton', storageLocation: 'FRIDGE' });
    expect(egg.shelfLife.ranges.fridge).toEqual({ min: 21, max: 35 });
    expect(res.body.items[2].shelfLife.source).toBe('category-fallback');
  });

  it('uses printed dates and ripeness from the photo, and AI shelf life for unknown foods', async () => {
    const vision: VisionClient = {
      name: 'fixture',
      identifyFoods: async () => parseDetections({ items: [
        { label: 'milk', confidence: 0.9, printedDate: '2026-11-25' },
        { label: 'banana', confidence: 0.9, ripeness: 'overripe', printedDate: '2026-02-31' },
        { label: 'kefir', confidence: 0.8 },
      ] }),
    };
    const text = textFixture({ name: 'Kefir', category: 'Dairy & Eggs', defaultStorage: 'FRIDGE', shelfLifeDays: { fridge: { min: 7, max: 14 } } });
    const res = await request(build({ llm: { vision, text } })).post('/api/scan').set(DEVICE).send({ imageBase64: IMAGE }).expect(200);
    const [milk, banana, kefir] = res.body.items;
    expect(milk.printedDate).toBe('2026-11-25');
    expect(banana).toMatchObject({ ripeness: 'overripe' });
    expect(banana.printedDate).toBeUndefined();
    expect(banana.shelfLife.ranges.pantry).toEqual({ min: 0, max: 3 }); // table says 2-7 when ripe
    expect(kefir.shelfLife).toMatchObject({ source: 'ai-estimate', ranges: { fridge: { min: 7, max: 14 } } });
  });

  it('suggests ingredient names with shelf-life data', async () => {
    const res = await request(build()).get('/api/ingredients?q=spin').set(DEVICE).expect(200);
    expect(res.body.items[0]).toMatchObject({ name: 'Spinach', defaultStorage: 'FRIDGE', ranges: { fridge: { min: 3, max: 7 } } });
  });

  it('validates the upload', async () => {
    const app = build();
    await request(app).post('/api/scan').set(DEVICE).send({}).expect(400);
    await request(app).post('/api/scan').set(DEVICE).send({ imageBase64: IMAGE, mimeType: 'image/gif' }).expect(400);
    await request(app).post('/api/scan').set(DEVICE).send({ imageBase64: 'A'.repeat(3_000_000) }).expect(413);
  });

  it('uses demo detections only when allowed', async () => {
    const off = build({ llm: { vision: null, text: null } });
    await request(off).post('/api/scan').set(DEVICE).send({ imageBase64: IMAGE }).expect(503);
    const demo = build({ llm: { vision: null, text: null }, allowMockVision: true });
    const res = await request(demo).post('/api/scan').set(DEVICE).send({ imageBase64: IMAGE }).expect(200);
    expect(res.body.source).toBe('mock_fallback');
  });
});

describe('recipes', () => {
  const inventory = [
    { id: '1', name: 'Eggs', expiryDate: addDays(TODAY, 1) },
    { id: '2', name: 'Baby Spinach', expiryDate: addDays(TODAY, 2) },
    { id: '3', name: 'Butter', expiryDate: addDays(TODAY, 40) },
  ];

  it('ranks recommendations with explanations', async () => {
    const res = await request(build()).post('/api/recipes/recommend').set(DEVICE).send({ inventory }).expect(200);
    const top = res.body.recipes[0];
    expect(top.title).toBe('Spinach Omelette');
    expect(top.matchPercentage).toBe(100);
    expect(top.expiringIngredients.sort()).toEqual(['Baby Spinach', 'Eggs']);
    expect(top.score.total).toBeGreaterThan(res.body.recipes[1]?.score.total ?? 0);
    expect(res.body.suggestGenerate).toBe(false);
  });

  it('ranks the whole catalogue when the source can list it, skipping recipes that use nothing you own', async () => {
    const source = fixtureRecipeSource();
    const all = jest.fn(async () => FIXTURE_RECIPES);
    const idsByIngredient = jest.spyOn(source, 'idsByIngredient');
    const res = await request(build({ recipes: { ...source, all } })).post('/api/recipes/recommend').set(DEVICE).send({ inventory }).expect(200);
    expect(all).toHaveBeenCalled();
    expect(idsByIngredient).not.toHaveBeenCalled();
    expect(res.body.recipes[0].title).toBe('Spinach Omelette');
    res.body.recipes.forEach((r: { ingredients: Array<{ inventoryItemId?: string }> }) =>
      expect(r.ingredients.some(i => i.inventoryItemId)).toBe(true));
  });

  it('applies the feasibility filter', async () => {
    const res = await request(build()).post('/api/recipes/recommend').set(DEVICE)
      .send({ inventory, preferences: { allergens: ['egg'] } }).expect(200);
    expect(res.body.recipes.map((r: { title: string }) => r.title)).not.toContain('Spinach Omelette');
  });

  it('suggests generation when coverage is low', async () => {
    const res = await request(build()).post('/api/recipes/recommend').set(DEVICE)
      .send({ inventory: [{ id: 'z', name: 'Garlic', expiryDate: addDays(TODAY, 30) }] }).expect(200);
    expect(res.body.suggestGenerate).toBe(true);
  });

  it('generates and validates an adapted recipe, sharing only names and urgency', async () => {
    const text = textFixture(RECORDED_GENERATED_RECIPE);
    const app = build({ llm: { vision: null, text } });
    const res = await request(app).post('/api/recipes/generate').set(DEVICE).send({
      inventory: [{ id: 'a', name: 'Avocado', expiryDate: addDays(TODAY, 1), secret: 'x' }, { id: 'b', name: 'Spinach', expiryDate: addDays(TODAY, 9) }],
    }).expect(200);
    expect(res.body.recipe).toMatchObject({ title: 'Avocado Spinach Toast', source: 'generated', missingIngredients: ['Bread'] });
    const prompt = (text.generateJson as jest.Mock).mock.calls[0][1] as string;
    expect(prompt).toContain('"urgency":"URGENT"');
    expect(prompt).not.toContain('secret');
    expect(prompt).not.toContain('expiryDate');
  });

  it('rejects invalid generated recipes', async () => {
    const app = build({ llm: { vision: null, text: textFixture({ title: 'Broken' }) } });
    await request(app).post('/api/recipes/generate').set(DEVICE).send({ inventory }).expect(502);
  });

  it('suggests substitutions', async () => {
    const res = await request(build({ llm: { vision: null, text: null } })).post('/api/recipes/substitutions').set(DEVICE)
      .send({ missing: ['Butter'], inventory: [{ id: 'o', name: 'Olive Oil', expiryDate: addDays(TODAY, 300) }] })
      .expect(200);
    expect(res.body.substitutions[0]).toMatchObject({ substitute: 'Olive Oil', fromInventory: true, role: 'fat' });
  });
});

describe('inventory & privacy', () => {
  const stored = {
    id: 'i1', canonicalId: 'egg', name: 'Egg', category: 'Dairy & Eggs', storageLocation: 'FRIDGE',
    quantity: 6, unit: 'unit', buyDate: TODAY, expiryEarliest: addDays(TODAY, 21), expiryDate: addDays(TODAY, 35), expirySource: 'estimate',
  };

  it('stores inventory per user and deletes everything on request', async () => {
    const app = build();
    await request(app).put('/api/inventory').set(DEVICE).send({ items: [stored] }).expect(200);
    const other = await request(app).get('/api/inventory').set('X-Device-Id', 'another-device').expect(200);
    expect(other.body.items).toEqual([]);
    const mine = await request(app).get('/api/inventory').set(DEVICE).expect(200);
    expect(mine.body.items).toEqual([stored]);

    await request(app).put('/api/preferences').set(DEVICE).send({ preferences: { allergens: ['egg', 'nonsense'], diet: 'vegan' } }).expect(200);
    const prefs = await request(app).get('/api/preferences').set(DEVICE).expect(200);
    expect(prefs.body.preferences).toMatchObject({ allergens: ['egg'], diet: 'vegan' });

    await request(app).delete('/api/me/data').set(DEVICE).expect(200);
    expect((await request(app).get('/api/inventory').set(DEVICE)).body.items).toEqual([]);
    expect((await request(app).get('/api/preferences').set(DEVICE)).body.preferences).toBeNull();
  });

  it('rejects malformed items', async () => {
    await request(build()).put('/api/inventory').set(DEVICE).send({ items: [{ id: 1 }] }).expect(400);
  });

  it('returns shelf-life ranges for a storage location', async () => {
    const res = await request(build()).get('/api/shelf-life').set(DEVICE)
      .query({ ingredient: 'chicken breasts', storage: 'FREEZER', buyDate: TODAY }).expect(200);
    expect(res.body).toMatchObject({ canonicalId: 'chicken_breast', storage: 'FREEZER', expiry: { earliest: addDays(TODAY, 270) } });
  });
});
