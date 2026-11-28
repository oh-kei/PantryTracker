/** Units offered when adding or editing food. `unit` = a count of individual items. */
export const UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: 'unit', label: 'items' },
  { value: 'pack', label: 'packs' },
  { value: 'bag', label: 'bags' },
  { value: 'bottle', label: 'bottles' },
  { value: 'carton', label: 'cartons' },
  { value: 'can', label: 'cans' },
  { value: 'jar', label: 'jars' },
  { value: 'bunch', label: 'bunches' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'L', label: 'L' },
];

const SMALL_MEASURES = ['g', 'ml'];
const LARGE_MEASURES = ['kg', 'l'];

/** Weight or volume, as opposed to a count of things. */
export const isMeasured = (unit: string): boolean => [...SMALL_MEASURES, ...LARGE_MEASURES].includes(unit.toLowerCase());

/** How much one tap of + or − changes the quantity. */
export const stepFor = (unit: string): number => {
  const u = unit.toLowerCase();
  if (SMALL_MEASURES.includes(u)) return 50;
  if (LARGE_MEASURES.includes(u)) return 0.5;
  return 1;
};

export const minFor = (unit: string): number => stepFor(unit);

/** A sensible quantity after switching unit, e.g. "1 item" -> "250 g". */
export const quantityForUnit = (quantity: number, from: string, to: string): number => {
  if (stepFor(from) === stepFor(to)) return quantity;
  const u = to.toLowerCase();
  if (SMALL_MEASURES.includes(u)) return 250;
  if (LARGE_MEASURES.includes(u)) return 1;
  return Math.max(1, Math.round(quantity));
};
