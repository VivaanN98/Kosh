/** Public Supabase config from Vite env. Kept free of supabase-js so it costs nothing to import. */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/** A relative URL ("/sb", proxied by Vite) resolves against the page origin. */
export function readSupabaseConfig(env: Record<string, string | undefined> = import.meta.env): SupabaseConfig | null {
  const rawUrl = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) return null;
  const url = rawUrl.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${rawUrl}` : rawUrl;
  return { url, anonKey };
}
