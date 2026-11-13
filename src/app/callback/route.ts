import { NextResponse } from 'next/server';

/**
 * Fallback de segurança para provedores OAuth que redirecionem para /callback
 * em vez de /auth/callback, preservando o código de autorização e query params.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.redirect(`${url.origin}/auth/callback${url.search}`);
}
