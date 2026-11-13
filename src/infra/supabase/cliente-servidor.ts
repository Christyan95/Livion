import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  SCHEMA_LIVION,
  supabaseEstaConfigurado,
  type ClienteSupabaseLivion,
} from './cliente-navegador';

/**
 * Cria o cliente Supabase SSR (Server Components / Route Handlers) conectado ao schema `livion`.
 */
export function criarClienteSupabaseServidor(): ClienteSupabaseLivion | null {
  if (!supabaseEstaConfigurado()) {
    return null;
  }

  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: {
        schema: SCHEMA_LIVION,
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(
                name,
                value,
                options as Parameters<typeof cookieStore.set>[2]
              )
            );
          } catch {
            // Chamado dentro de Server Component (ignorado pois o middleware atualiza a sessão)
          }
        },
      },
    }
  );
}

/**
 * Cria o cliente Supabase administrativo (Service Role) conectado ao schema `livion`
 * para uso exclusivo em rotas de servidor e no Vercel Cron Job (/api/cron/manutencao).
 */
export function criarClienteSupabaseServiceRole(): ClienteSupabaseLivion | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    !url ||
    !serviceKey ||
    url.includes('seu-projeto.supabase.co') ||
    serviceKey === 'sua-service-role-key-secreta'
  ) {
    return null;
  }

  return createClient(url, serviceKey, {
    db: {
      schema: SCHEMA_LIVION,
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
