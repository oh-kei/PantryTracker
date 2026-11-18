import type { DayRange, UrgencyTier } from '../../../shared/types';

const DAY_MS = 86_400_000;

/** Days at or below which an item is URGENT (red). Includes expired items. */
export const URGENT_MAX_DAYS = 2;
/** Days at or below which an item is WARNING (amber). */
export const WARNING_MAX_DAYS = 5;

/** Parse a YYYY-MM-DD string as a UTC calendar date. */
export const parseDate = (value: string): Date => {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
};

export const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

export const todayString = (now: Date = new Date()): string =>
  formatDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));

export const addDays = (date: string, days: number): string =>
  formatDate(new Date(parseDate(date).getTime() + days * DAY_MS));

/** Whole calendar days from `today` until `expiryDate` (negative once expired). */
export const daysUntil = (expiryDate: string, today: string): number =>
  Math.round((parseDate(expiryDate).getTime() - parseDate(today).getTime()) / DAY_MS);

export const urgencyFromDays = (days: number): UrgencyTier =>
  days <= URGENT_MAX_DAYS ? 'URGENT' : days <= WARNING_MAX_DAYS ? 'WARNING' : 'SAFE';

export const urgencyTier = (expiryDate: string, today: string): UrgencyTier =>
  urgencyFromDays(daysUntil(expiryDate, today));

/** Numeric weight used by the ranking engine: URGENT counts fully, WARNING half. */
export const urgencyWeight = (tier: UrgencyTier): number =>
  tier === 'URGENT' ? 1 : tier === 'WARNING' ? 0.5 : 0;

/** Turn a shelf-life range into an expiry date range starting from the buy date. */
export const expiryWindow = (buyDate: string, range: DayRange): { earliest: string; latest: string } => ({
  earliest: addDays(buyDate, range.min),
  latest: addDays(buyDate, range.max),
});
