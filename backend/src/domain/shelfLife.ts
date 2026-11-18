import type { DayRange, Ripeness, StorageLocation, StorageRanges } from '../../../shared/types';
import { addDays, daysUntil } from './expiry';
import { toCanonicalId } from './normalise';
import { FOOD_CATEGORIES, inferCategory, TaxonomyEntry, titleCase } from './taxonomy';

/**
 * Asked only for foods missing from the shelf-life table. The answer is validated
 * and clamped below, and the app shows it as an AI estimate, never as a fact.
 */
export const SHELF_LIFE_SYSTEM_PROMPT = `You are a food storage reference based on USDA FoodKeeper and similar food-safety guidance.
For the food the user names, return ONLY a JSON object:
{"name": string (common English name, title case),
 "category": one of ${FOOD_CATEGORIES.map(c => `"${c}"`).join(', ')},
 "defaultStorage": "PANTRY" | "FRIDGE" | "FREEZER" (where it is normally kept after buying),
 "shelfLifeDays": {"pantry": {"min": integer, "max": integer} | null, "fridge": {...} | null, "freezer": {...} | null}}
Days count from buying the fresh or unopened product. Use null where that storage is unsafe or not recommended.
Be conservative: when unsure, give the shorter range. If the text is not a food, return {"name": null}.`;

/** Upper bounds (days) so a bad answer can never claim fresh meat lasts a year in the fridge. */
const CAPS: Record<keyof StorageRanges, number> = { pantry: 1825, fridge: 180, freezer: 730 };
const STORAGES: StorageLocation[] = ['FRIDGE', 'PANTRY', 'FREEZER'];

const parseRange = (value: unknown, cap: number): DayRange | null => {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const min = Math.round(Number(v.min));
  const max = Math.round(Number(v.max));
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 1) return null;
  return { min: Math.min(min, max, cap), max: Math.min(Math.max(min, max), cap) };
};

/** Turn an LLM shelf-life answer into a taxonomy entry, or undefined if it is unusable. */
export const validateAiShelfLife = (raw: unknown, label: string): TaxonomyEntry | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const v = raw as Record<string, unknown>;
  if (typeof v.name !== 'string' || !v.name.trim()) return undefined;
  const days = (v.shelfLifeDays && typeof v.shelfLifeDays === 'object' ? v.shelfLifeDays : {}) as Record<string, unknown>;
  const ranges: StorageRanges = {
    pantry: parseRange(days.pantry, CAPS.pantry),
    fridge: parseRange(days.fridge, CAPS.fridge),
    freezer: parseRange(days.freezer, CAPS.freezer),
  };
  const usable = STORAGES.filter(s => ranges[s.toLowerCase() as keyof StorageRanges]);
  if (usable.length === 0) return undefined;
  const wanted = String(v.defaultStorage || '').toUpperCase() as StorageLocation;
  const category = FOOD_CATEGORIES.includes(v.category as never) ? v.category as TaxonomyEntry['category'] : inferCategory(label);
  return {
    canonicalId: toCanonicalId(label),
    name: titleCase(v.name).slice(0, 60),
    category,
    defaultStorage: usable.includes(wanted) ? wanted : usable[0],
    aliases: [],
    shelfLifeDays: ranges,
  };
};

/**
 * Ripe produce uses the table as is. Overripe produce has a fraction of its room
 * and fridge life left; unripe produce gets a few extra days. Freezer life is unchanged.
 */
export const adjustForRipeness = (ranges: StorageRanges, ripeness: Ripeness | undefined, category: string): StorageRanges => {
  if (!ripeness || ripeness === 'ripe' || category !== 'Produce') return ranges;
  const adjust = (range: DayRange | null): DayRange | null => {
    if (!range) return null;
    if (ripeness === 'overripe') {
      const max = Math.max(1, Math.round(range.max * 0.4));
      return { min: Math.min(Math.floor(range.min * 0.3), max), max };
    }
    return { min: range.min + 2, max: range.max + 3 };
  };
  return { pantry: adjust(ranges.pantry), fridge: adjust(ranges.fridge), freezer: ranges.freezer };
};

/** Accept a printed date read off a label only if it is a real, plausible date. */
export const plausiblePrintedDate = (value: string | undefined, today: string): string | undefined => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  if (addDays(value, 0) !== value) return undefined; // e.g. 2026-02-31
  const days = daysUntil(value, today);
  return days >= -60 && days <= 3650 ? value : undefined;
};
