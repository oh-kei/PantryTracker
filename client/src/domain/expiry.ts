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

/** One-tap choices for a printed date ("best before ~1 week from now"). */
export const QUICK_DATE_OPTIONS: { label: string; days: number }[] = [
  { label: '+3 days', days: 3 },
  { label: '+1 week', days: 7 },
  { label: '+2 weeks', days: 14 },
  { label: '+1 month', days: 30 },
  { label: '+3 months', days: 90 },
  { label: '+1 year', days: 365 },
];

/** "today", "tomorrow", "in 5 days", "3 days ago". */
export const relativeDays = (date: string, today: string = todayString()): string => {
  const days = daysUntil(date, today);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
};

/** "Wed 25 Nov 2026" (UTC so the calendar date never shifts with the time zone). */
export const formatLongDate = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });

/** Calendar picker <-> YYYY-MM-DD. The picker works in local time, so read local fields. */
export const dateToString = (date: Date): string => todayString(date);
export const stringToLocalDate = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

/** "25 Nov", or "25 Nov 2027" when it isn't this year (so a 1-2 year range never reads backwards). */
export const formatShortDate = (date: string, today: string = todayString()): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', timeZone: 'UTC', ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
  });

const spanUnit = (days: number): [number, string] =>
  days >= 330 ? [Math.round(days / 365), 'year'] : days >= 60 ? [Math.round(days / 30), 'month'] : days >= 14 ? [Math.round(days / 7), 'week'] : [days, 'day'];

/** A shelf-life range in words: "3–5 days", "2–3 weeks", "1–2 years", "about 6 months". */
export const describeShelfLife = (min: number, max: number): string => {
  const [lo, loUnit] = spanUnit(min);
  const [hi, hiUnit] = spanUnit(max);
  const plural = (n: number, unit: string) => `${unit}${n === 1 ? '' : 's'}`;
  if (loUnit === hiUnit) return lo === hi ? `about ${hi} ${plural(hi, hiUnit)}` : `${lo}–${hi} ${plural(hi, hiUnit)}`;
  return `${lo} ${plural(lo, loUnit)} – ${hi} ${plural(hi, hiUnit)}`;
};
