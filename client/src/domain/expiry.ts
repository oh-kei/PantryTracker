import type { DayRange, InventoryItem, UrgencyTier } from '../../../shared/types';

/**
 * Expiry logic, kept free of React so it can be unit-tested directly.
 * Tier boundaries must match backend/src/domain/expiry.ts.
 */
const DAY_MS = 86_400_000;
export const URGENT_MAX_DAYS = 2;
export const WARNING_MAX_DAYS = 5;

export const EXPIRY_DISCLAIMER =
  'Expiry dates are estimates based on typical storage guidance and what you entered. ' +
  'They are not a food-safety guarantee — always check how food looks and smells, and follow printed dates.';

const parseDate = (value: string): number => {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};

export const todayString = (now: Date = new Date()): string =>
  new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);

export const addDays = (date: string, days: number): string =>
  new Date(parseDate(date) + days * DAY_MS).toISOString().slice(0, 10);

export const daysUntil = (date: string, today: string = todayString()): number =>
  Math.round((parseDate(date) - parseDate(today)) / DAY_MS);

export const isValidDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDate(value)) &&
  new Date(parseDate(value)).toISOString().slice(0, 10) === value;

export const urgencyFromDays = (days: number): UrgencyTier =>
  days <= URGENT_MAX_DAYS ? 'URGENT' : days <= WARNING_MAX_DAYS ? 'WARNING' : 'SAFE';

/** Urgency is always derived from the stored date so it stays correct as days pass. */
export const urgencyOf = (item: Pick<InventoryItem, 'expiryDate'>, today: string = todayString()): UrgencyTier =>
  urgencyFromDays(daysUntil(item.expiryDate, today));

export const URGENCY_COLOURS: Record<UrgencyTier, { fg: string; bg: string; label: string }> = {
  URGENT: { fg: '#b91c1c', bg: '#fee2e2', label: 'Use now' },
  WARNING: { fg: '#b45309', bg: '#fef3c7', label: 'Use soon' },
  SAFE: { fg: '#15803d', bg: '#dcfce7', label: 'Fresh' },
};

/** Human description such as "Expired 2 days ago", "Today", or "3–5 days". */
export const describeExpiry = (item: Pick<InventoryItem, 'expiryDate' | 'expiryEarliest' | 'expirySource'>, today: string = todayString()): string => {
  const latest = daysUntil(item.expiryDate, today);
  if (latest < 0) return `Expired ${-latest} day${latest === -1 ? '' : 's'} ago`;
  if (latest === 0) return 'Expires today';
  const earliest = Math.max(0, daysUntil(item.expiryEarliest || item.expiryDate, today));
  if (item.expirySource === 'label' || earliest === latest) return `${latest} day${latest === 1 ? '' : 's'} left`;
  return `~${earliest}–${latest} days left`;
};

/** Expiry window for a new item bought on `buyDate` with a shelf-life range. */
export const estimateExpiry = (buyDate: string, range: DayRange | null): { earliest: string; latest: string } => {
  const safe = range || { min: 3, max: 7 };
  return { earliest: addDays(buyDate, safe.min), latest: addDays(buyDate, safe.max) };
};
