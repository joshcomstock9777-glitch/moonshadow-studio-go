/**
 * Path configuration loader
 * Reads Path API base URL from runtime environment
 */

export function loadPathConfig(): { apiBaseUrl: string } {
  // Expo exposes this public build-time value on native and web.
  const envUrl = process.env.EXPO_PUBLIC_PATH_API_URL;
  return { apiBaseUrl: envUrl?.trim() || "" };
}
