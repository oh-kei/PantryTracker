import { resolveApiBaseUrl } from '../../config';
import type { InventoryItem, RankedRecipe } from '../../../../shared/types';
import { addDays, dateToString, daysUntil, describeExpiry, isValidDate, relativeDays, stringToLocalDate, urgencyOf } from '../expiry';
import { quantityForUnit, stepFor } from '../units';
import { applyUsage, DraftItem, draftFromDetection, draftToItem, duplicateOf, groupByStorage, mergeDrafts, plannedUsage } from '../inventory';

const TODAY = '2026-11-15';

const item = (id: string, overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id,
  canonicalId: id,
  name: id,
  category: 'Produce',
  storageLocation: 'FRIDGE',
  quantity: 2,
  unit: 'unit',
  buyDate: TODAY,
  expiryEarliest: addDays(TODAY, 5),
  expiryDate: addDays(TODAY, 10),
  expirySource: 'estimate',
  ...overrides,
});

describe('expiry tiers (must match the backend)', () => {
  it.each([[-1, 'URGENT'], [2, 'URGENT'], [3, 'WARNING'], [5, 'WARNING'], [6, 'SAFE']])('%i days -> %s', (days, tier) => {
    expect(urgencyOf({ expiryDate: addDays(TODAY, days) }, TODAY)).toBe(tier);
  });

  it('describes ranges, exact dates and expired items', () => {
    expect(describeExpiry(item('a'), TODAY)).toBe('~5–10 days left');
    expect(describeExpiry(item('b', { expirySource: 'label', expiryDate: addDays(TODAY, 1) }), TODAY)).toBe('1 day left');
    expect(describeExpiry(item('c', { expiryDate: addDays(TODAY, -2) }), TODAY)).toBe('Expired 2 days ago');
    expect(daysUntil('2026-12-01', TODAY)).toBe(16);
  });

  it('validates printed dates', () => {
    expect(isValidDate('2026-12-31')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('31/12/2026')).toBe(false);
  });
});

describe('inventory', () => {
  it('groups by storage and sorts by expiry', () => {
    const sections = groupByStorage([
      item('late', { expiryDate: addDays(TODAY, 9) }),
      item('frozen', { storageLocation: 'FREEZER' }),
      item('soon', { expiryDate: addDays(TODAY, 1) }),
    ]);
    expect(sections.map(s => s.storage)).toEqual(['FRIDGE', 'FREEZER']);
    expect(sections[0].data.map(i => i.id)).toEqual(['soon', 'late']);
  });

  it('turns a draft into an item using the storage range or printed date', () => {
    const draft: DraftItem = {
      key: 'k', name: ' Spinach ', canonicalId: 'spinach', category: 'Produce', quantity: 1, unit: 'bag',
      storageLocation: 'FRIDGE', ranges: { pantry: null, fridge: { min: 3, max: 7 }, freezer: { min: 240, max: 300 } },
    };
    expect(draftToItem(draft, TODAY)).toMatchObject({
      name: 'Spinach', expiryEarliest: '2026-11-18', expiryDate: '2026-11-22', expirySource: 'estimate',
    });
    expect(draftToItem({ ...draft, storageLocation: 'FREEZER' }, TODAY).expiryDate).toBe(addDays(TODAY, 300));
    expect(draftToItem({ ...draft, labelDate: '2026-11-20' }, TODAY)).toMatchObject({
      expiryEarliest: '2026-11-20', expiryDate: '2026-11-20', expirySource: 'label',
    });
  });

  it('merges selected drafts by summing quantities', () => {
    const base: DraftItem = { key: 'a', name: 'Egg', canonicalId: 'egg', category: 'Dairy & Eggs', quantity: 6, unit: 'unit', storageLocation: 'FRIDGE', ranges: null, confidence: 0.9 };
    const merged = mergeDrafts([base, { ...base, key: 'b', quantity: 4, confidence: 0.5 }, { ...base, key: 'c', name: 'Milk' }], ['a', 'b']);
    expect(merged.map(d => [d.key, d.quantity])).toEqual([['a', 10], ['c', 6]]);
  });

  it('deducts cooked ingredients and removes empty items', () => {
    const recipe = {
      ingredients: [
        { name: 'Egg', canonicalId: 'egg', measure: '2', status: 'expiring', inventoryItemId: 'egg' },
        { name: 'Butter', canonicalId: 'butter', measure: '', status: 'missing' },
      ],
    } as Pick<RankedRecipe, 'ingredients'>;
    const inventory = [item('egg', { quantity: 6 }), item('oil', { quantity: 1 }), item('milk')];
    const usage = plannedUsage(recipe, inventory, [
      { missing: 'Butter', substitute: 'oil', role: 'fat', fromInventory: true, inventoryItemId: 'oil', source: 'rules' },
    ]);
    expect(usage).toEqual([{ itemId: 'egg', amount: 1 }, { itemId: 'oil', amount: 1 }]);
    const after = applyUsage(inventory, [{ itemId: 'egg', amount: 2 }, { itemId: 'oil', amount: 1 }]);
    expect(after.map(i => [i.id, i.quantity])).toEqual([['egg', 4], ['milk', 2]]);
  });
});

describe('manual date entry', () => {
  it('describes dates relative to today', () => {
    expect(relativeDays('2026-11-18', '2026-11-18')).toBe('today');
    expect(relativeDays('2026-11-19', '2026-11-18')).toBe('tomorrow');
    expect(relativeDays('2026-11-25', '2026-11-18')).toBe('in 7 days');
    expect(relativeDays('2026-11-15', '2026-11-18')).toBe('3 days ago');
  });

  it('round-trips calendar dates without time-zone drift', () => {
    expect(dateToString(stringToLocalDate('2026-12-31'))).toBe('2026-12-31');
    expect(dateToString(stringToLocalDate('2027-03-01'))).toBe('2027-03-01');
  });

  it('uses a printed date read from the photo', () => {
    const draft = draftFromDetection({
      label: 'milk', name: 'Milk', canonicalId: 'milk', category: 'Dairy & Eggs', confidence: 0.9, quantity: 1, unit: 'carton',
      storageLocation: 'FRIDGE', printedDate: '2026-11-30',
      shelfLife: { canonicalId: 'milk', name: 'Milk', category: 'Dairy & Eggs', defaultStorage: 'FRIDGE', source: 'reference', ranges: { pantry: null, fridge: { min: 5, max: 7 }, freezer: null } },
    });
    expect(draft).toMatchObject({ labelDate: '2026-11-30', labelFromPhoto: true, estimateSource: 'reference' });
    expect(draftToItem(draft, '2026-11-18')).toMatchObject({ expiryDate: '2026-11-30', expirySource: 'label' });
  });
});

describe('backend address', () => {
  it('follows the laptop Expo Go loaded from, so changing Wi-Fi needs no .env edit', () => {
    expect(resolveApiBaseUrl('http://10.89.180.23:4000/api', '10.89.195.172:8081')).toBe('http://10.89.195.172:4000/api');
    expect(resolveApiBaseUrl(undefined, '192.168.1.5:8081')).toBe('http://192.168.1.5:4000/api');
  });

  it('keeps a deployed server, and handles tunnels and emulators', () => {
    expect(resolveApiBaseUrl('https://api.example.com/api/', '10.0.0.4:8081')).toBe('https://api.example.com/api');
    expect(resolveApiBaseUrl('http://10.89.180.23:4000/api', 'abc-anonymous-8081.exp.direct')).toBe('http://10.89.180.23:4000/api');
    expect(resolveApiBaseUrl(undefined, undefined)).toBe('http://10.0.2.2:4000/api');
  });
});

describe('units and duplicates', () => {
  it('steps and converts sensibly per unit', () => {
    expect(stepFor('unit')).toBe(1);
    expect(stepFor('g')).toBe(50);
    expect(stepFor('L')).toBe(0.5);
    expect(quantityForUnit(2, 'unit', 'g')).toBe(250);
    expect(quantityForUnit(2, 'unit', 'pack')).toBe(2);
    expect(quantityForUnit(500, 'g', 'unit')).toBe(500);
    expect(quantityForUnit(1.5, 'kg', 'bag')).toBe(2);
  });

  it('finds an earlier draft for the same food', () => {
    const base = { category: 'Other' as const, quantity: 1, unit: 'unit', storageLocation: 'FRIDGE' as const, ranges: null };
    const drafts: DraftItem[] = [
      { ...base, key: 'a', name: 'Milk', canonicalId: 'milk' },
      { ...base, key: 'b', name: 'Eggs', canonicalId: 'egg' },
      { ...base, key: 'c', name: 'Whole milk', canonicalId: 'milk' },
      { ...base, key: 'd', name: ' eggs ', canonicalId: '' },
    ];
    expect(duplicateOf(drafts, drafts[0])).toBeUndefined();
    expect(duplicateOf(drafts, drafts[2])?.key).toBe('a');
    expect(duplicateOf(drafts, drafts[3])).toBeUndefined(); // no ID yet, so only an identical name would count
  });
});
