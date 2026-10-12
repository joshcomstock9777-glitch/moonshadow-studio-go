/** A co-hosted Studio Go web build uses its own Path origin unless explicitly configured. */
export function loadPathConfig(): { apiBaseUrl: string } {
  const configured = process.env.EXPO_PUBLIC_PATH_API_URL?.trim();
  return { apiBaseUrl: configured || (typeof window !== 'undefined' ? window.location.origin : '') };
}
