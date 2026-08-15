/**
 * Path configuration loader
 * Reads Path API base URL from runtime environment
 */

export interface PathConfigSource {
  apiBaseUrl?: string;
}

export function loadPathConfig(): { apiBaseUrl: string } {
  // Try environment variable first (for build-time or native config)
  const envUrl = process.env.REACT_APP_PATH_API_URL || process.env.EXPO_PUBLIC_PATH_API_URL;
  
  // Try window/global injected config
  const globalConfig = (globalThis as any).__PATH_CONFIG__ as PathConfigSource | undefined;
  
  const apiBaseUrl = envUrl || globalConfig?.apiBaseUrl || "";
  
  if (!apiBaseUrl.trim()) {
    console.warn(
      "Path API URL not configured. " +
      "Set REACT_APP_PATH_API_URL, EXPO_PUBLIC_PATH_API_URL, or inject window.__PATH_CONFIG__.apiBaseUrl"
    );
  }
  
  return { apiBaseUrl: apiBaseUrl.trim() };
}
