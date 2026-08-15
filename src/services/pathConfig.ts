/**
 * Path configuration loader
 * Reads Path API base URL from runtime environment
 */

export const VERIFIED_PATH_API_URL = "https://moonshadow-path-proof.vercel.app";

export function loadPathConfig(): { apiBaseUrl: string } {
  // Try environment variable first (for build-time or native config)
  const envUrl = process.env.EXPO_PUBLIC_PATH_API_URL;
  const apiBaseUrl = envUrl || VERIFIED_PATH_API_URL;
  
  if (!envUrl) {
    console.info("Using the verified Moonshadow Path endpoint");
  }
  
  return { apiBaseUrl: apiBaseUrl.trim() };
}
