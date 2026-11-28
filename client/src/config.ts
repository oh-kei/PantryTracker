import Constants from 'expo-constants';

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * Work out the backend URL.
 * - EXPO_PUBLIC_API_URL pointing at a deployed (public) server always wins.
 * - In development, use the laptop that Expo Go loaded the app from: it is already
 *   reachable from the phone, and its IP follows you to every Wi-Fi network.
 *   (A LAN address in .env is ignored then, because it goes stale when the network changes.)
 * - Otherwise fall back to .env, then the Android emulator's alias for the host.
 */
export const resolveApiBaseUrl = (envUrl: string | undefined, hostUri: string | undefined, port = '4000'): string => {
  const env = envUrl?.trim().replace(/\/$/, '');
  const envHost = env?.replace(/^https?:\/\//, '').split(/[:/]/)[0];
  if (env && envHost && !PRIVATE_HOST.test(envHost)) return env;
  const devHost = hostUri?.split(':')[0];
  // Tunnel mode (*.exp.direct) only forwards Metro, not the backend port.
  if (devHost && !devHost.endsWith('.exp.direct')) return `http://${devHost}:${port}/api`;
  return env || 'http://10.0.2.2:4000/api';
};

const expoHostUri = (): string | undefined =>
  Constants.expoConfig?.hostUri ??
  (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost;

export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, expoHostUri(), process.env.EXPO_PUBLIC_API_PORT || '4000');

/** Target upload size for photos (proposal section 4.1). */
export const MAX_UPLOAD_BYTES = 1024 * 1024;

/** Detections below this confidence are highlighted for the user to check. */
export const LOW_CONFIDENCE = 0.6;
