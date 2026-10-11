export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export function readSupabaseConfig(env: Record<string, string | undefined> = import.meta.env): SupabaseConfig | null {
  const rawUrl = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) return null;
  const url = rawUrl.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${rawUrl}` : rawUrl;
  return { url, anonKey };
}
