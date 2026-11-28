import { useEffect, useRef } from 'react';
import { api } from '../data/api';
import { useInventoryStore } from '../store/inventoryStore';
import { usePreferencesStore } from '../store/preferencesStore';

const PUSH_DELAY_MS = 1500;

/**
 * Offline-first sync. The phone's local store is the source of truth so manual
 * entry works without a network; changes are pushed to the backend (Firestore)
 * shortly after they happen. A fresh install pulls whatever the server has.
 */
export const useServerSync = () => {
  const hydrated = useInventoryStore(s => s.hydrated);
  const inventoryRevision = useInventoryStore(s => s.revision);
  const preferencesRevision = usePreferencesStore(s => s.revision);
  const pulled = useRef(false);

  useEffect(() => {
    if (!hydrated || pulled.current) return;
    pulled.current = true;
    (async () => {
      try {
        if (useInventoryStore.getState().revision === 0) {
          const items = await api.getInventory();
          if (items.length > 0 && useInventoryStore.getState().revision === 0) {
            useInventoryStore.getState().replaceFromServer(items);
          }
        }
        if (usePreferencesStore.getState().revision === 0) {
          const preferences = await api.getPreferences();
          if (preferences && usePreferencesStore.getState().revision === 0) {
            usePreferencesStore.getState().replaceFromServer(preferences);
          }
        }
      } catch {
        // Offline: keep working locally, the next change will push.
      }
    })();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || inventoryRevision === 0) return;
    const timer = setTimeout(() => {
      api.putInventory(useInventoryStore.getState().items).catch(() => undefined);
    }, PUSH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hydrated, inventoryRevision]);

  useEffect(() => {
    if (!hydrated || preferencesRevision === 0) return;
    const timer = setTimeout(() => {
      api.putPreferences(usePreferencesStore.getState().preferences).catch(() => undefined);
    }, PUSH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hydrated, preferencesRevision]);
};
