import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Allergen, Diet, UserPreferences } from '../../../shared/types';

export const ALLERGENS: Allergen[] = ['dairy', 'egg', 'gluten', 'peanut', 'tree nut', 'fish', 'shellfish', 'soy', 'sesame'];
export const DIETS: Diet[] = ['none', 'vegetarian', 'pescatarian', 'vegan'];
/** Cuisines available in TheMealDB. */
export const CUISINES = [
  'American', 'British', 'Chinese', 'French', 'Greek', 'Indian', 'Italian', 'Japanese',
  'Malaysian', 'Mexican', 'Moroccan', 'Spanish', 'Thai', 'Turkish', 'Vietnamese',
];

export const DEFAULT_PREFERENCES: UserPreferences = {
  allergens: [],
  diet: 'none',
  favouriteCuisines: [],
  cuisineHistory: {},
};

interface PreferencesState {
  preferences: UserPreferences;
  revision: number;
  toggleAllergen: (allergen: Allergen) => void;
  setDiet: (diet: Diet) => void;
  toggleCuisine: (cuisine: string) => void;
  /** Feed the "preference" term of the ranking formula. */
  recordCooked: (cuisine?: string) => void;
  replaceFromServer: (preferences: UserPreferences) => void;
  reset: () => void;
}

const toggle = <T,>(list: T[], value: T): T[] => (list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => {
      const update = (fn: (p: UserPreferences) => UserPreferences) =>
        set(state => ({ preferences: fn(state.preferences), revision: state.revision + 1 }));
      return {
        preferences: DEFAULT_PREFERENCES,
        revision: 0,
        toggleAllergen: allergen => update(p => ({ ...p, allergens: toggle(p.allergens, allergen) })),
        setDiet: diet => update(p => ({ ...p, diet })),
        toggleCuisine: cuisine => update(p => ({ ...p, favouriteCuisines: toggle(p.favouriteCuisines, cuisine) })),
        recordCooked: cuisine => {
          if (!cuisine) return;
          update(p => ({ ...p, cuisineHistory: { ...p.cuisineHistory, [cuisine]: (p.cuisineHistory[cuisine] || 0) + 1 } }));
        },
        replaceFromServer: preferences => set({ preferences: { ...DEFAULT_PREFERENCES, ...preferences } }),
        reset: () => update(() => DEFAULT_PREFERENCES),
      };
    },
    {
      name: 'smartfood.preferences',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
