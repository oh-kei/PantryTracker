/**
 * Backend base URL. Set EXPO_PUBLIC_API_URL in client/.env, e.g.
 *   EXPO_PUBLIC_API_URL=http://192.168.1.20:4000/api   (phone on the same Wi-Fi as the laptop)
 * The default reaches the host machine from the Android emulator.
 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4000/api').replace(/\/$/, '');

/** Target upload size for photos (proposal section 4.1). */
export const MAX_UPLOAD_BYTES = 1024 * 1024;

/** Detections below this confidence are highlighted for the user to check. */
export const LOW_CONFIDENCE = 0.6;
