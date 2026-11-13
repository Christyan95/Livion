'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookMarked,
  Compass,
  Flame,
  Home,
  Moon,
  ShieldAlert,
  Sun,
  Trophy,
  User,
} from 'lucide-react';
import type { UsrPerfil } from '@/infra/supabase/tipos-banco';

interface PropsNavegacao {
  perfil: UsrPerfil | null;
  modoRenderizacao?: 'cabecalho' | 'dock' | 'ignorar';
}

const CHAVE_TEMA_LIVION = 'livion:tema_visual';

const ITENS_DOCK = [
  { href: '/', rotulo: 'Início', icone: Home },
  { href: '/estante', rotulo: 'Estante', icone: BookMarked },
  { href: '/explorar', rotulo: 'Explorar', icone: Compass, central: true },
  { href: '/ranking', rotulo: 'Ranking', icone: Trophy },
  { href: '/perfil', rotulo: 'Perfil', icone: User },
];

export function NavegacaoInferiorMobile({
  perfil,
  modoRenderizacao = 'ignorar',
}: PropsNavegacao) {
  const pathname = usePathname();
  const router = useRouter();
  const [modoPapiro, setModoPapiro] = useState(false);

  const ocultarCromo =
    pathname.startsWith('/boas-vindas') ||
    pathname.startsWith('/entrar') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/ler/');

  useEffect(() => {
    const salvo = window.localStorage.getItem(CHAVE_TEMA_LIVION);
    const usarPapiro = salvo === 'papiro';
    setModoPapiro(usarPapiro);
    document.documentElement.classList.toggle('tema-papiro', usarPapiro);
  }, []);

  // Prefetch proativo das 5 rotas principais para transição instantânea
  useEffect(() => {
    if (modoRenderizacao !== 'dock' || ocultarCromo) return;
    ITENS_DOCK.forEach((item) => {
      router.prefetch(item.href);
    });
  }, [modoRenderizacao, ocultarCromo, router]);

  const alternarTemaVisual = () => {
    const proximo = !modoPapiro;
    setModoPapiro(proximo);
    document.documentElement.classList.toggle('tema-papiro', proximo);
    window.localStorage.setItem(
      CHAVE_TEMA_LIVION,
      proximo ? 'papiro' : 'tinta'
    );
  };

  if (ocultarCromo || modoRenderizacao === 'ignorar') {
    return null;
  }

  /* 1. CABEÇALHO SUPERIOR DEDICADO (NÃO ROLA COM O CONTEÚDO) */
  if (modoRenderizacao === 'cabecalho') {
    return (
      <header
        style={{
          backgroundColor: 'var(--livion-header-bg)',
          borderColor: 'var(--livion-borda)',
        }}
        className="z-30 h-14 w-full shrink-0 border-b backdrop-blur-xl transition-colors duration-200"
      >
        <div className="flex h-full w-full items-center justify-between px-5">
          <Link href="/" prefetch className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marca/icone-192.png"
              alt=""
              width={28}
              height={28}
              style={{ width: 28, height: 28 }}
              className="object-contain"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/marca/wordmark.png"
              alt="Livion"
              width={78}
              height={16}
              style={{ width: 78, height: 16 }}
              className="wordmark-adaptavel object-contain transition-all"
            />
          </Link>

          <div className="flex items-center gap-2">
            {perfil && (
              <Link
                href="/perfil"
                prefetch
                title={`Ofensiva atual: ${perfil.per_ofensiva_atual} dias`}
                className="flex items-center gap-1.5 rounded-full border border-[#F59E0B]/35 bg-[#F59E0B]/15 px-3 py-1 text-xs font-bold text-[#EA580C]"
              >
                <Flame className="h-3.5 w-3.5 fill-[#F59E0B] text-[#EA580C]" />
                <span>{perfil.per_ofensiva_atual}d</span>
              </Link>
            )}

            {perfil?.per_papel === 'admin' && (
              <Link
                href="/admin"
                prefetch
                title="Painel Administrativo"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-livion-borda bg-livion-card text-livion-secundario transition hover:text-[#F59E0B]"
              >
                <ShieldAlert className="h-4 w-4" />
              </Link>
            )}

            <button
              type="button"
              onClick={alternarTemaVisual}
              aria-label={
                modoPapiro
                  ? 'Ativar tema escuro Tinta Noturna'
                  : 'Ativar tema claro Creme Papiro'
              }
              title={
                modoPapiro ? 'Tema: Creme Papiro' : 'Tema: Tinta Noturna'
              }
              className="flex h-8 w-8 items-center justify-center rounded-full border border-livion-borda bg-livion-card text-[#F59E0B] transition hover:border-[#F59E0B]/50 active:scale-95"
            >
              {modoPapiro ? (
                <Moon className="h-4 w-4 text-[#312E81]" />
              ) : (
                <Sun className="h-4 w-4 text-[#F59E0B]" />
              )}
            </button>
          </div>
        </div>
      </header>
    );
  }

  /* 2. ZONA INFERIOR DEDICADA DA BARRA FLUTUANTE (NUNCA SOBREPÕE O CONTEÚDO CENTRAL) */
  return (
    <div className="z-30 w-full shrink-0 bg-livion-fundo px-3.5 pb-2.5 pt-2 transition-colors duration-200">
      <nav
        aria-label="Navegação principal"
        style={{
          backgroundColor: 'var(--livion-dock-bg)',
          borderColor: 'var(--livion-dock-borda)',
        }}
        className="mx-auto flex h-16 w-full items-center justify-between rounded-[26px] border px-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-colors duration-200"
      >
        {ITENS_DOCK.map((item) => {
          const Icone = item.icone;
          const ativo =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

          if (item.central) {
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                className="group relative -mt-3.5 flex flex-col items-center"
              >
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl shadow-md transition-all duration-150 active:scale-95 ${
                    ativo
                      ? 'bg-gradient-to-br from-[#F59E0B] to-[#EA580C] text-[#0F172A] shadow-[#EA580C]/30 ring-4 ring-livion-fundo'
                      : 'bg-gradient-to-br from-[#312E81] to-[#1E1B4B] text-[#FAF8F5] shadow-[#1E1B4B]/35 ring-4 ring-livion-fundo group-hover:from-[#4338CA] group-hover:to-[#312E81]'
                  }`}
                >
                  <Icone className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <span
                  className={`mt-0.5 text-[10px] font-bold tracking-tight transition-colors ${
                    ativo ? 'text-[#EA580C]' : 'text-livion-secundario'
                  }`}
                >
                  {item.rotulo}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-all active:scale-95"
            >
              <div
                className={`flex h-8 w-11 items-center justify-center rounded-2xl transition-all duration-150 ${
                  ativo
                    ? 'bg-[#F59E0B]/15 text-[#EA580C]'
                    : 'text-livion-secundario hover:text-livion-texto'
                }`}
              >
                <Icone
                  className="h-[19px] w-[19px]"
                  strokeWidth={ativo ? 2.4 : 1.9}
                />
              </div>
              <span
                className={`text-[10px] tracking-tight transition-colors ${
                  ativo
                    ? 'font-bold text-livion-texto'
                    : 'font-medium text-livion-secundario'
                }`}
              >
                {item.rotulo}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
