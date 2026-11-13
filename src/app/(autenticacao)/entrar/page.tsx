'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { obterClienteSupabaseNavegador } from '@/infra/supabase/cliente-navegador';

export default function PaginaEntrar() {
  const router = useRouter();
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [verSenha, setVerSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const entrarComGoogle = async () => {
    setErro(null);
    const supabase = obterClienteSupabaseNavegador();
    if (!supabase) {
      setErro('Configuração do Supabase ausente.');
      return;
    }
    setCarregando(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setErro('Não foi possível conectar com o Google. Tente novamente.');
      setCarregando(false);
    }
  };

  const autenticarPorEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setMensagem(null);
    const supabase = obterClienteSupabaseNavegador();
    if (!supabase) {
      setErro('Configuração do Supabase ausente.');
      return;
    }
    setCarregando(true);
    try {
      if (modo === 'criar') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { full_name: nome.trim() || 'Leitor Livion' } },
        });
        if (error) throw error;
        if (data.session) {
          router.push('/?onboarding=1');
          router.refresh();
        } else {
          setMensagem(
            'Conta criada! Confirme o link enviado para o seu e-mail.'
          );
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: senha,
        });
        if (error) throw error;
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setErro(
        msg.includes('Invalid login')
          ? 'E-mail ou senha incorretos.'
          : msg || 'Não foi possível autenticar. Tente novamente.'
      );
    } finally {
      setCarregando(false);
    }
  };

  const classeCampo =
    'h-11 w-full rounded-xl border border-[#312E81] bg-[#1E1B4B]/40 pl-10 pr-3.5 text-sm text-[#FAF8F5] placeholder-slate-400 transition focus:border-[#F59E0B] focus:bg-[#1E1B4B]/70 focus:outline-none';

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-y-auto bg-[#0F172A] px-6 py-5 no-scrollbar">
      {/* Brilho sutil de fundo */}
      <div className="pointer-events-none absolute -top-28 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[#312E81]/30 blur-3xl" />

      {/* Topo: Voltar para apresentação + Wordmark */}
      <header className="relative z-10 flex h-9 shrink-0 items-center justify-between">
        <Link
          href="/boas-vindas"
          aria-label="Voltar para apresentação"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#312E81]/70 bg-[#1E1B4B]/60 text-slate-200 transition hover:border-[#F59E0B]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/marca/wordmark.png"
          alt="Livion"
          width={85}
          height={17}
          style={{ width: 85, height: 17 }}
          className="object-contain"
        />

        <span className="w-9" />
      </header>

      {/* Miolo Central */}
      <main className="animar-surgir relative z-10 my-auto flex w-full flex-col py-2">
        <div className="mb-5 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/marca/icone-192.png"
            alt="Livion"
            width={64}
            height={64}
            style={{ width: 64, height: 64 }}
            className="object-contain"
          />
          <h1 className="mt-3 text-xl font-bold text-[#FAF8F5]">
            {modo === 'entrar' ? 'Que bom te ver de novo' : 'Crie sua conta'}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {modo === 'entrar'
              ? 'Acesse sua estante e continue sua leitura.'
              : 'Comece hoje sua jornada literária no Livion.'}
          </p>
        </div>

        {/* Botão Google em Creme Papiro (#FAF8F5) + Grafite Literário (#1E293B) */}
        <button
          type="button"
          onClick={() => void entrarComGoogle()}
          disabled={carregando}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-[#E5DEC9] bg-[#FAF8F5] text-sm font-semibold text-[#1E293B] shadow-sm transition hover:bg-[#F3EFE6] active:scale-[0.98] disabled:opacity-60"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span>Entrar com Google</span>
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#312E81]/60" />
          <span className="text-[11px] font-medium text-slate-400">
            ou com seu e-mail
          </span>
          <div className="h-px flex-1 bg-[#312E81]/60" />
        </div>

        {/* Formulário */}
        <form onSubmit={autenticarPorEmail} className="space-y-2.5">
          {modo === 'criar' && (
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                autoComplete="name"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Como você quer ser chamado?"
                className={classeCampo}
              />
            </div>
          )}

          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Seu e-mail"
              className={classeCampo}
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type={verSenha ? 'text' : 'password'}
              required
              minLength={6}
              autoComplete={
                modo === 'criar' ? 'new-password' : 'current-password'
              }
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Senha (mín. 6 caracteres)"
              className={`${classeCampo} pr-10`}
            />
            <button
              type="button"
              onClick={() => setVerSenha((v) => !v)}
              aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-200"
            >
              {verSenha ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          {erro && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {erro}
            </p>
          )}
          {mensagem && (
            <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {mensagem}
            </p>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="!mt-4 flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-sm font-bold text-[#0F172A] shadow-lg shadow-[#EA580C]/25 transition active:scale-[0.98] disabled:opacity-60"
          >
            {carregando
              ? 'Aguarde...'
              : modo === 'entrar'
              ? 'Entrar na Estante'
              : 'Criar minha conta'}
          </button>
        </form>
      </main>

      {/* Rodapé: Alternar entre entrar e criar conta */}
      <footer className="relative z-10 shrink-0 pt-2 text-center text-xs text-slate-400">
        {modo === 'entrar' ? 'Ainda não tem uma conta?' : 'Já possui uma conta?'}{' '}
        <button
          type="button"
          onClick={() => {
            setModo(modo === 'entrar' ? 'criar' : 'entrar');
            setErro(null);
            setMensagem(null);
          }}
          className="font-bold text-[#FBBF24] hover:underline"
        >
          {modo === 'entrar' ? 'Criar agora' : 'Fazer login'}
        </button>
      </footer>
    </div>
  );
}
