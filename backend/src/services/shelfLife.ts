import type { ShelfLifeEstimate } from '../../../shared/types';
import { normaliseIngredient } from '../domain/normalise';
import { SHELF_LIFE_SYSTEM_PROMPT, validateAiShelfLife } from '../domain/shelfLife';
import type { Taxonomy } from '../domain/taxonomy';
import type { TextClient } from './llm';

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });

/**
 * Shelf-life estimates: the reference table first, then (for foods it doesn't
 * know) a validated AI estimate, then the generic category range.
 * AI answers are cached in memory so each unknown food is only asked about once.
 */
export class ShelfLifeService {
  private readonly cache = new Map<string, ShelfLifeEstimate>();
  private readonly pending = new Map<string, Promise<ShelfLifeEstimate>>();

  constructor(
    private readonly taxonomy: Taxonomy,
    private readonly text: TextClient | null,
    private readonly timeoutMs = 12_000,
    private readonly maxCached = 1000,
  ) {}

  async estimate(label: string): Promise<ShelfLifeEstimate> {
    const base = this.taxonomy.estimate(label);
    if (base.source === 'reference' || !this.text) return base;
    const key = normaliseIngredient(label) || label.trim().toLowerCase();
    const cached = this.cache.get(key);
    if (cached) return cached;
    let pending = this.pending.get(key);
    if (!pending) {
      pending = this.ask(key, label, base).finally(() => this.pending.delete(key));
      this.pending.set(key, pending);
    }
    return pending;
  }

  private async ask(key: string, label: string, base: ShelfLifeEstimate): Promise<ShelfLifeEstimate> {
    try {
      const raw = await withTimeout((this.text as TextClient).generateJson(SHELF_LIFE_SYSTEM_PROMPT, label.slice(0, 80)), this.timeoutMs);
      const entry = validateAiShelfLife(raw, label);
      if (!entry) return base;
      const estimate: ShelfLifeEstimate = {
        canonicalId: entry.canonicalId,
        name: entry.name,
        category: entry.category,
        defaultStorage: entry.defaultStorage,
        ranges: entry.shelfLifeDays,
        source: 'ai-estimate',
      };
      if (this.cache.size >= this.maxCached) this.cache.delete(this.cache.keys().next().value as string);
      this.cache.set(key, estimate);
      return estimate;
    } catch (error) {
      console.warn(`AI shelf-life estimate failed for "${label.slice(0, 40)}":`, (error as Error).message);
      return base;
    }
  }
}
