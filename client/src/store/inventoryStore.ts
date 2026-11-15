import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { InventoryItem } from '../../../shared/types';
import { applyUsage, Usage } from '../domain/inventory';

interface InventoryState {
  items: InventoryItem[];
  /** Bumped on every local change, so the sync hook knows what to push. */
  revision: number;
  hydrated: boolean;
  addItems: (items: InventoryItem[]) => void;
  updateItem: (id: string, patch: Partial<InventoryItem>) => void;
  removeItem: (id: string) => void;
  /** Use up `amount` of an item (swipe "consume"); removes it at zero. */
  consume: (id: string, amount?: number) => void;
  /** Deduct everything a cooked recipe used. */
  applyCooking: (usages: Usage[]) => void;
  /** Replace from the server without marking as a local change. */
  replaceFromServer: (items: InventoryItem[]) => void;
  clear: () => void;
}

const bump = (state: InventoryState, items: InventoryItem[]) => ({ items, revision: state.revision + 1 });

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set) => ({
      items: [],
      revision: 0,
      hydrated: false,
      addItems: items => set(state => bump(state, [...state.items, ...items])),
      updateItem: (id, patch) => set(state => bump(state, state.items.map(item => (item.id === id ? { ...item, ...patch } : item)))),
      removeItem: id => set(state => bump(state, state.items.filter(item => item.id !== id))),
      consume: (id, amount = 1) => set(state => bump(state, applyUsage(state.items, [{ itemId: id, amount }]))),
      applyCooking: usages => set(state => bump(state, applyUsage(state.items, usages))),
      replaceFromServer: items => set({ items }),
      clear: () => set(state => bump(state, [])),
    }),
    {
      name: 'smartfood.inventory',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({ items: state.items, revision: state.revision }),
    },
  ),
);

// `hydrated` gates server sync until the local copy has loaded from storage.
const markHydrated = () => useInventoryStore.setState({ hydrated: true });
if (useInventoryStore.persist.hasHydrated()) markHydrated();
else useInventoryStore.persist.onFinishHydration(markHydrated);
