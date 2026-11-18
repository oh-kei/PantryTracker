import { adjustForRipeness, plausiblePrintedDate, validateAiShelfLife } from '../domain/shelfLife';
import { Taxonomy } from '../domain/taxonomy';
import type { TextClient } from './llm';
import { ShelfLifeService } from './shelfLife';

const KEFIR = {
  name: 'kefir', category: 'Dairy & Eggs', defaultStorage: 'FRIDGE',
  shelfLifeDays: { pantry: null, fridge: { min: 7, max: 14 }, freezer: null },
};

describe('validateAiShelfLife', () => {
  it('accepts a well-formed answer and clamps silly ranges', () => {
    const entry = validateAiShelfLife({ ...KEFIR, shelfLifeDays: { fridge: { min: 30, max: 900 }, pantry: { min: 5, max: 2 } } }, 'Kefir');
    expect(entry).toMatchObject({ name: 'Kefir', category: 'Dairy & Eggs', defaultStorage: 'FRIDGE', canonicalId: 'kefir' });
    expect(entry?.shelfLifeDays.fridge).toEqual({ min: 30, max: 180 });
    expect(entry?.shelfLifeDays.pantry).toEqual({ min: 2, max: 5 });
  });

  it('rejects non-food or unusable answers and fixes bad fields', () => {
    expect(validateAiShelfLife({ name: null }, 'stapler')).toBeUndefined();
    expect(validateAiShelfLife({ name: 'X', shelfLifeDays: { fridge: { min: 'a', max: 2 } } }, 'x')).toBeUndefined();
    const entry = validateAiShelfLife({ ...KEFIR, category: 'Snacks', defaultStorage: 'PANTRY' }, 'kefir milk');
    expect(entry?.category).toBe('Dairy & Eggs'); // inferred from "milk"
    expect(entry?.defaultStorage).toBe('FRIDGE'); // pantry is unsafe, so not the default
  });
});

describe('ripeness and printed dates', () => {
  const ranges = { pantry: { min: 2, max: 7 }, fridge: { min: 3, max: 7 }, freezer: { min: 60, max: 90 } };

  it('shortens overripe produce, extends unripe, ignores non-produce', () => {
    expect(adjustForRipeness(ranges, 'overripe', 'Produce')).toEqual({ pantry: { min: 0, max: 3 }, fridge: { min: 0, max: 3 }, freezer: ranges.freezer });
    expect(adjustForRipeness(ranges, 'unripe', 'Produce').pantry).toEqual({ min: 4, max: 10 });
    expect(adjustForRipeness(ranges, 'overripe', 'Dairy & Eggs')).toBe(ranges);
    expect(adjustForRipeness(ranges, 'ripe', 'Produce')).toBe(ranges);
  });

  it('only trusts real, plausible printed dates', () => {
    expect(plausiblePrintedDate('2026-12-01', '2026-11-18')).toBe('2026-12-01');
    expect(plausiblePrintedDate('2026-02-31', '2026-11-18')).toBeUndefined();
    expect(plausiblePrintedDate('2019-01-01', '2026-11-18')).toBeUndefined();
    expect(plausiblePrintedDate(undefined, '2026-11-18')).toBeUndefined();
  });
});

describe('ShelfLifeService', () => {
  const text = (answer: unknown): TextClient => ({ name: 'fixture', generateJson: jest.fn(async () => answer) });

  it('uses the table for known foods without calling the AI', async () => {
    const client = text(KEFIR);
    const estimate = await new ShelfLifeService(new Taxonomy(), client).estimate('eggs');
    expect(estimate.source).toBe('reference');
    expect(client.generateJson).not.toHaveBeenCalled();
  });

  it('asks the AI once per unknown food and caches the answer', async () => {
    const client = text(KEFIR);
    const service = new ShelfLifeService(new Taxonomy(), client);
    const [a, b] = await Promise.all([service.estimate('kefir'), service.estimate('Kefir')]);
    expect(a).toMatchObject({ source: 'ai-estimate', name: 'Kefir', ranges: { fridge: { min: 7, max: 14 } } });
    expect(b).toEqual(a);
    await service.estimate('kefir');
    expect(client.generateJson).toHaveBeenCalledTimes(1);
  });

  it('falls back to category ranges when the AI fails or times out', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing: TextClient = { name: 'x', generateJson: async () => { throw new Error('busy'); } };
    expect((await new ShelfLifeService(new Taxonomy(), failing).estimate('kefir')).source).toBe('category-fallback');
    const slow: TextClient = { name: 'x', generateJson: () => new Promise(() => undefined) };
    expect((await new ShelfLifeService(new Taxonomy(), slow, 20).estimate('kefir')).source).toBe('category-fallback');
    expect((await new ShelfLifeService(new Taxonomy(), null).estimate('kefir')).source).toBe('category-fallback');
  });
});
