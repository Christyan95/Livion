import { NextResponse } from 'next/server';
import { criarClienteSupabaseServidor } from '@/infra/supabase/cliente-servidor';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = criarClienteSupabaseServidor();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/entrar?erro=falha_oauth`);
}

