import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import {
  SCHEMA_LIVION,
  supabaseEstaConfigurado,
} from '@/infra/supabase/cliente-navegador';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  if (!supabaseEstaConfigurado()) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: {
        schema: SCHEMA_LIVION,
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(
              name,
              value,
              options as Parameters<typeof response.cookies.set>[2]
            )
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const ehRotaPublica =
    pathname.startsWith('/boas-vindas') ||
    pathname.startsWith('/entrar') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api/cron/manutencao');

  // 1. Exige conta autenticada (RN01). 1º acesso -> apresentação; depois -> login direto
  if (!user && !ehRotaPublica) {
    const jaViuIntro = request.cookies.get('livion_intro_vista')?.value === '1';
    return NextResponse.redirect(
      new URL(jaViuIntro ? '/entrar' : '/boas-vindas', request.url)
    );
  }

  // 2. Autenticado não precisa ver apresentação/login
  if (user && (pathname.startsWith('/entrar') || pathname.startsWith('/boas-vindas'))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 3. Proteção estrita da rota /admin (RN07: consulta livion.usr_perfis)
  if (user && pathname.startsWith('/admin')) {
    const { data: perfil } = await supabase
      .from('usr_perfis')
      .select('per_papel, per_banido')
      .eq('per_id', user.id)
      .maybeSingle();

    if (!perfil || perfil.per_papel !== 'admin' || perfil.per_banido) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Exclui assets estáticos (imagens da marca, manifest, SW, worker do PDF.js)
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|marca/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|mjs|js)$).*)',
  ],
};
