import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export const SCHEMA_LIVION = 'livion' as const;
export type ClienteSupabaseLivion = SupabaseClient<any, typeof SCHEMA_LIVION, any>;

let clienteSingleton: ClienteSupabaseLivion | null = null;

export function supabaseEstaConfigurado(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(
    url &&
      key &&
      url.startsWith('http') &&
      !url.includes('seu-projeto.supabase.co')
  );
}

/**
 * Retorna o cliente Supabase no navegador conectado exclusivamente ao schema `livion`.
 */
export function obterClienteSupabaseNavegador(): ClienteSupabaseLivion | null {
  if (!supabaseEstaConfigurado()) {
    return null;
  }

  if (!clienteSingleton) {
    clienteSingleton = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        db: {
          schema: SCHEMA_LIVION,
        },
      }
    );
  }

  return clienteSingleton;
}
