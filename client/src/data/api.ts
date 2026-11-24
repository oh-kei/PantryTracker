import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  GenerateOptions,
  InventoryItem,
  RankedRecipe,
  RecipeInventoryItem,
  RecommendResponse,
  ScanResponse,
  ShelfLifeEstimate,
  StorageLocation,
  SubstitutionResponse,
  UserPreferences,
} from '../../../shared/types';
import { API_BASE_URL } from '../config';

/**
 * Data-access layer: every network call goes through here, behind typed functions.
 * Screens and stores never call fetch directly.
 */

const DEVICE_ID_KEY = 'smartfood.deviceId';
let deviceIdPromise: Promise<string> | null = null;

/** A random per-install ID that scopes this phone's data on the backend (evaluation mode). */
export const getDeviceId = (): Promise<string> => {
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      try {
        const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
        if (existing) return existing;
      } catch {
        // storage unavailable: fall through and use an in-memory ID
      }
      const id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      try {
        await AsyncStorage.setItem(DEVICE_ID_KEY, id);
      } catch {
        // ignore
      }
      return id;
    })();
  }
  return deviceIdPromise;
};

/** Optional Firebase ID token provider; when set, requests use it instead of the device ID. */
let authTokenProvider: (() => Promise<string | null>) | null = null;
export const setAuthTokenProvider = (provider: typeof authTokenProvider) => {
  authTokenProvider = provider;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const request = async <T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = authTokenProvider ? await authTokenProvider() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  else headers['X-Device-Id'] = await getDeviceId();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and backend address.', 0);
  } finally {
    clearTimeout(timer);
  }
  let body: { success?: boolean; error?: string } & Record<string, unknown> = {};
  try {
    body = await response.json();
  } catch {
    // non-JSON error page
  }
  if (!response.ok || body.success === false) {
    throw new ApiError(body.error || `Request failed (${response.status})`, response.status);
  }
  return body as T;
};

const post = <T>(path: string, data: unknown, timeoutMs?: number) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(data), timeoutMs });

export const api = {
  health: () => request<{ status: string; vision: string | null; text: string | null }>('/health', { timeoutMs: 5000 }),

  scan: (imageBase64: string, mimeType = 'image/jpeg') =>
    post<ScanResponse>('/scan', { imageBase64, mimeType }, 45_000),

  /** Type-ahead food names from the shelf-life table. */
  suggestIngredients: (query: string) =>
    request<{ items: ShelfLifeEstimate[] }>(`/ingredients?q=${encodeURIComponent(query)}`, { timeoutMs: 5000 }),

  shelfLife: (ingredient: string, storage?: StorageLocation) =>
    request<ShelfLifeEstimate & { storage: StorageLocation; expiry: { earliest: string; latest: string } | null }>(
      `/shelf-life?ingredient=${encodeURIComponent(ingredient)}${storage ? `&storage=${storage}` : ''}`,
    ),

  recommend: (inventory: RecipeInventoryItem[], preferences: UserPreferences) =>
    post<RecommendResponse>('/recipes/recommend', { inventory, preferences }, 30_000),

  generate: async (inventory: RecipeInventoryItem[], preferences: UserPreferences, options: GenerateOptions = {}) =>
    (await post<{ recipe: RankedRecipe }>('/recipes/generate', { inventory, preferences, options }, 60_000)).recipe,

  substitutions: async (missing: string[], inventory: RecipeInventoryItem[], preferences: UserPreferences, recipeTitle?: string) =>
    (await post<SubstitutionResponse>('/recipes/substitutions', { missing, inventory, preferences, recipeTitle }, 30_000)).substitutions,

  getInventory: async () => (await request<{ items: InventoryItem[] }>('/inventory')).items,
  putInventory: (items: InventoryItem[]) => request('/inventory', { method: 'PUT', body: JSON.stringify({ items }) }),
  getPreferences: async () => (await request<{ preferences: UserPreferences | null }>('/preferences')).preferences,
  putPreferences: (preferences: UserPreferences) => request('/preferences', { method: 'PUT', body: JSON.stringify({ preferences }) }),
  deleteAllData: () => request('/me/data', { method: 'DELETE' }),
};
