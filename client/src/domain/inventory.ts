import type {
  DetectedItem,
  InventoryItem,
  RankedRecipe,
  RecipeInventoryItem,
  StorageLocation,
  StorageRanges,
  Substitution,
} from '../../../shared/types';
import { estimateExpiry, todayString } from './expiry';

export const STORAGE_LABELS: Record<StorageLocation, string> = {
  FRIDGE: 'Fridge',
  FREEZER: 'Freezer',
  PANTRY: 'Pantry',
};
export const STORAGES: StorageLocation[] = ['FRIDGE', 'FREEZER', 'PANTRY'];

export const rangeFor = (ranges: StorageRanges, storage: StorageLocation) =>
  ranges[storage.toLowerCase() as keyof StorageRanges];

export const newId = (prefix = 'item'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Sort soonest-expiring first. */
export const sortByExpiry = <T extends Pick<InventoryItem, 'expiryDate' | 'name'>>(items: T[]): T[] =>
  [...items].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.name.localeCompare(b.name));

/** Group into Fridge / Freezer / Pantry sections, each sorted by expiry. Empty groups are dropped. */
export const groupByStorage = (items: InventoryItem[]) =>
  STORAGES
    .map(storage => ({ storage, title: STORAGE_LABELS[storage], data: sortByExpiry(items.filter(i => i.storageLocation === storage)) }))
    .filter(section => section.data.length > 0);

/** The minimal view of the inventory the recipe engine needs (no quantities, dates of purchase, etc.). */
export const toRecipeInventory = (items: InventoryItem[]): RecipeInventoryItem[] =>
  items.map(({ id, name, canonicalId, expiryDate }) => ({ id, name, canonicalId, expiryDate }));

/** A row on the confirmation screen: a detection the user can still edit. */
export interface DraftItem {
  key: string;
  name: string;
  canonicalId: string;
  category: InventoryItem['category'];
  confidence?: number;
  group?: string;
  quantity: number;
  unit: string;
  storageLocation: StorageLocation;
  ranges: StorageRanges | null;
  /** Printed date entered by the user (YYYY-MM-DD); overrides the estimate. */
  labelDate?: string;
}

export const draftFromDetection = (d: DetectedItem): DraftItem => ({
  key: newId('draft'),
  name: d.name,
  canonicalId: d.canonicalId,
  category: d.category,
  confidence: d.confidence,
  group: d.group,
  quantity: d.quantity,
  unit: d.unit,
  storageLocation: d.storageLocation,
  ranges: d.shelfLife.ranges,
});

/** Merge drafts into the first one, summing quantities (e.g. two "egg" detections). */
export const mergeDrafts = (drafts: DraftItem[], keys: string[]): DraftItem[] => {
  const selected = drafts.filter(d => keys.includes(d.key));
  if (selected.length < 2) return drafts;
  const [first, ...rest] = selected;
  const merged: DraftItem = {
    ...first,
    quantity: selected.reduce((sum, d) => sum + d.quantity, 0),
    confidence: Math.max(...selected.map(d => d.confidence ?? 0)) || undefined,
    group: undefined,
  };
  const restKeys = new Set(rest.map(d => d.key));
  return drafts.filter(d => !restKeys.has(d.key)).map(d => (d.key === first.key ? merged : d));
};

/** Turn a confirmed draft into an inventory record (section 4.4). */
export const draftToItem = (draft: DraftItem, buyDate: string = todayString()): InventoryItem => {
  const window = draft.labelDate
    ? { earliest: draft.labelDate, latest: draft.labelDate }
    : estimateExpiry(buyDate, draft.ranges ? rangeFor(draft.ranges, draft.storageLocation) : null);
  return {
    id: newId(),
    canonicalId: draft.canonicalId,
    name: draft.name.trim(),
    category: draft.category,
    storageLocation: draft.storageLocation,
    quantity: Math.max(1, draft.quantity),
    unit: draft.unit || 'unit',
    buyDate,
    expiryEarliest: window.earliest,
    expiryDate: window.latest,
    expirySource: draft.labelDate ? 'label' : 'estimate',
    ...(draft.confidence !== undefined ? { confidence: draft.confidence } : {}),
  };
};

/** How much of one inventory item a cooked recipe used. */
export interface Usage {
  itemId: string;
  amount: number;
}

/**
 * The inventory items a recipe would use, with a default amount: one unit, or
 * everything if only one is left. Accepted substitutions from the inventory count too.
 */
export const plannedUsage = (
  recipe: Pick<RankedRecipe, 'ingredients'>,
  inventory: InventoryItem[],
  acceptedSubstitutions: Substitution[] = [],
): Usage[] => {
  const ids = [
    ...recipe.ingredients.map(i => i.inventoryItemId),
    ...acceptedSubstitutions.filter(s => s.fromInventory).map(s => s.inventoryItemId),
  ].filter((id): id is string => Boolean(id));
  return [...new Set(ids)]
    .map(id => inventory.find(item => item.id === id))
    .filter((item): item is InventoryItem => Boolean(item))
    .map(item => ({ itemId: item.id, amount: Math.min(1, item.quantity) || item.quantity }));
};

/** Deduct usages from the inventory (section 6.7); items that reach zero are removed. */
export const applyUsage = (inventory: InventoryItem[], usages: Usage[]): InventoryItem[] =>
  inventory.flatMap(item => {
    const used = usages.filter(u => u.itemId === item.id).reduce((sum, u) => sum + u.amount, 0);
    if (used <= 0) return [item];
    const remaining = Math.round((item.quantity - used) * 100) / 100;
    return remaining > 0 ? [{ ...item, quantity: remaining }] : [];
  });
