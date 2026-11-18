/** Words that describe an ingredient's state rather than what it is. */
const DESCRIPTORS = new Set([
  'organic', 'fresh', 'free', 'range', 'whole', 'large', 'small', 'medium', 'ripe', 'raw',
  'chopped', 'diced', 'sliced', 'minced', 'grated', 'shredded', 'crushed', 'ground',
  'boneless', 'skinless', 'frozen', 'dried', 'canned', 'tinned', 'baby', 'extra', 'virgin',
  'pack', 'packet', 'bag', 'of', 'a', 'the', 'some', 'finely', 'roughly', 'cooked', 'uncooked',
]);

/** Words whose state matters and must be kept even though they look like descriptors. */
const KEEP_WHEN_LEADING = new Set(['ground']);

const IRREGULAR_SINGULARS: Record<string, string> = {
  tomatoes: 'tomato',
  potatoes: 'potato',
  leaves: 'leaf',
  loaves: 'loaf',
  halves: 'half',
  knives: 'knife',
  berries: 'berry',
  cherries: 'cherry',
  anchovies: 'anchovy',
  chillies: 'chilli',
  chilies: 'chili',
  radishes: 'radish',
  peaches: 'peach',
  sandwiches: 'sandwich',
  mangoes: 'mango',
};

/** Reduce a single English word to its singular form (good enough for ingredient names). */
export const singularise = (word: string): string => {
  if (IRREGULAR_SINGULARS[word]) return IRREGULAR_SINGULARS[word];
  if (word.length <= 3) return word;
  if (/(ss|us|is)$/.test(word)) return word;
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
};

/** Lowercase, strip punctuation and collapse whitespace. */
export const cleanText = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Normalise an ingredient label into a comparable key, e.g.
 * "Free-range Eggs" -> "egg", "Fresh Baby Spinach" -> "spinach".
 */
export const normaliseIngredient = (value: string): string => {
  const words = cleanText(value).split(' ').filter(Boolean);
  const kept = words.filter((word, index) => {
    if (KEEP_WHEN_LEADING.has(word) && index < words.length - 1) {
      // "ground beef" stays distinct from "beef"; "ground" alone is dropped.
      return words[index + 1] !== undefined && ['beef', 'pork', 'lamb', 'turkey', 'chicken', 'cinnamon', 'ginger', 'cumin'].includes(words[index + 1]);
    }
    return !DESCRIPTORS.has(word);
  });
  const result = (kept.length > 0 ? kept : words).map(singularise).join(' ');
  return result.trim();
};

export const toCanonicalId = (value: string): string =>
  normaliseIngredient(value).replace(/ /g, '_');

export const tokens = (value: string): string[] =>
  normaliseIngredient(value).split(' ').filter(Boolean);

/**
 * True when two normalised ingredient names refer to the same food: equal, or
 * one's words are a whole-word subset of the other's ("spinach" ~ "baby spinach",
 * but "egg" is not "eggplant").
 */
export const ingredientsMatch = (a: string, b: string): boolean => {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta.join(' ') === tb.join(' ')) return true;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return shorter.every(word => longer.includes(word));
};

/** Whole-word keyword test on a normalised string. */
export const containsWord = (haystack: string, keyword: string): boolean => {
  const normalisedKeyword = normaliseIngredient(keyword);
  if (!normalisedKeyword) return false;
  return new RegExp(`(^| )${normalisedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(normaliseIngredient(haystack));
};
