import { create } from 'zustand';
import type { DetectedItem, MealType, RankedRecipe, ScanResponse } from '../../../shared/types';

/** The last choices on the Generate screen. Unticked items are stored, so new food starts ticked. */
export interface GenerateChoices {
  excluded: string[];
  mustUse: string[];
  mealType?: MealType;
  maxMinutes?: number;
}

/** Short-lived UI state that is never persisted (scan results, recipes being viewed). */
interface SessionState {
  scan: { items: DetectedItem[]; source: ScanResponse['source'] | 'manual' } | null;
  /** Recipes by ID, so the detail screen can be opened from any list. */
  recipes: Record<string, RankedRecipe>;
  /** AI-adapted recipes created this session, shown above the database results. */
  generated: RankedRecipe[];
  generateChoices: GenerateChoices;
  setGenerateChoices: (choices: GenerateChoices) => void;
  setScan: (scan: SessionState['scan']) => void;
  rememberRecipes: (recipes: RankedRecipe[]) => void;
  addGenerated: (recipe: RankedRecipe) => void;
}

export const useSessionStore = create<SessionState>()(set => ({
  scan: null,
  recipes: {},
  generated: [],
  generateChoices: { excluded: [], mustUse: [] },
  setGenerateChoices: generateChoices => set({ generateChoices }),
  setScan: scan => set({ scan }),
  rememberRecipes: recipes => set(state => ({
    recipes: { ...state.recipes, ...Object.fromEntries(recipes.map(r => [r.id, r])) },
  })),
  addGenerated: recipe => set(state => ({
    generated: [recipe, ...state.generated.filter(r => r.id !== recipe.id)].slice(0, 5),
    recipes: { ...state.recipes, [recipe.id]: recipe },
  })),
}));
