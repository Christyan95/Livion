'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Award,
  BookOpen,
  Flame,
  Shield,
  WifiOff,
} from 'lucide-react';

const COOKIE_INTRO_VISTA = 'livion_intro_vista';

const SLIDES = [
  {
    icone: BookOpen,
    cor: 'from-[#312E81] to-[#1E1B4B] border-[#4338CA]/40',
    destaque: 'text-[#FBBF24]',
    etiqueta: 'Estante Híbrida',
    titulo: 'Sua leitura, sempre onde você parou',
    texto:
      'Leia obras clássicas selecionadas pela Livion ou importe seus próprios PDFs. Abra e continue exatamente na página certa, mesmo sem internet.',
    selos: [
      { icone: WifiOff, rotulo: 'Funciona offline' },
      { icone: BookOpen, rotulo: 'Memória automática' },
    ],
  },
  {
    icone: Flame,
    cor: 'from-[#F59E0B] to-[#EA580C] border-[#FBBF24]/40',
    destaque: 'text-[#FBBF24]',
    etiqueta: 'Hábito Diário',
    titulo: 'Transforme minutos em constância',
    texto:
      'Escolha uma meta leve a partir de 10 minutos por dia. Cada meta cumprida mantém sua chama acesa, multiplica seu XP e gera escudos protetores.',
    selos: [
      { icone: Flame, rotulo: 'Bônus até 1,5x XP' },
      { icone: Shield, rotulo: 'Escudos de proteção' },
    ],
  },
  {
    icone: Award,
    cor: 'from-[#6D28D9] to-[#4C1D95] border-[#8B5CF6]/40',
    destaque: 'text-violet-300',
    etiqueta: 'Comunidade Literária',
    titulo: 'Evolua junto com outros leitores',
    texto:
      'Conquiste patentes literárias, desbloqueie medalhas no seu perfil e participe da Liga da Semana em um ambiente acolhedor.',
    selos: [
      { icone: Award, rotulo: '10 patentes' },
      { icone: Flame, rotulo: 'Liga da Semana' },
    ],
  },
];

export default function PaginaBoasVindas() {
  const router = useRouter();
  const [fase, setFase] = useState<'splash' | 'intro'>('splash');
  const [indice, setIndice] = useState(0);
  const toqueX = useRef<number | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setFase('intro'), 1500);
    return () => window.clearTimeout(t);
  }, []);

  const seguirParaAcesso = () => {
    document.cookie = `${COOKIE_INTRO_VISTA}=1; path=/; max-age=31536000; samesite=lax`;
    router.push('/entrar');
  };

  const avancar = () => {
    if (indice < SLIDES.length - 1) {
      setIndice(indice + 1);
    } else {
      seguirParaAcesso();
    }
  };

  const aoFimToque = (e: React.TouchEvent) => {
    if (toqueX.current === null) return;
    const delta = (e.changedTouches[0]?.clientX ?? 0) - toqueX.current;
    toqueX.current = null;
    if (delta < -45 && indice < SLIDES.length - 1) setIndice(indice + 1);
    if (delta > 45 && indice > 0) setIndice(indice - 1);
  };

  /* ---------- 1. TELA DE CARREGAMENTO INICIAL (SPLASH) ---------- */
  if (fase === 'splash') {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-between overflow-hidden bg-[#0F172A] px-6 py-10">
        <div className="h-4" />

        <div className="animar-surgir flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/marca/logo-completa.png"
            alt="Livion"
            width={144}
            height={120}
            style={{ width: 144, height: 120 }}
            className="object-contain"
          />
          <p className="mt-4 text-xs font-medium tracking-wide text-slate-400">
            Leitura que ilumina e cria hábito
          </p>
        </div>

        <div className="w-32 overflow-hidden rounded-full bg-[#1E1B4B] p-0.5">
          <div className="animar-carregar h-1 rounded-full bg-gradient-to-r from-[#F59E0B] to-[#EA580C]" />
        </div>
      </div>
    );
  }

  const slide = SLIDES[indice]!;
  const Icone = slide.icone;
  const ultimo = indice === SLIDES.length - 1;

  /* ---------- 2. SLIDES DE BOAS-VINDAS (QUADRO ÚNICO, ZERO SCROLL) ---------- */
  return (
    <div
      className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-[#0F172A] px-6 py-5"
      onTouchStart={(e) => (toqueX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={aoFimToque}
    >
      {/* Brilho sutil de fundo */}
      <div className="pointer-events-none absolute -top-28 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[#312E81]/30 blur-3xl" />

      {/* Topo: Wordmark com tamanho travado + Botão Pular */}
      <header className="relative z-10 flex h-9 shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
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
            width={90}
            height={18}
            style={{ width: 90, height: 18 }}
            className="object-contain"
          />
        </div>

        {!ultimo ? (
          <button
            type="button"
            onClick={seguirParaAcesso}
            className="rounded-full px-3 py-1 text-xs font-medium text-slate-400 transition hover:bg-[#1E1B4B] hover:text-[#FAF8F5]"
          >
            Pular
          </button>
        ) : (
          <span className="w-12" />
        )}
      </header>

      {/* Miolo Central: Ícone + Etiqueta + Título + Texto + Selos */}
      <main
        key={indice}
        className="animar-surgir relative z-10 my-auto flex flex-col items-center text-center"
      >
        <div
          className={`mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border bg-gradient-to-br ${slide.cor} shadow-xl shadow-black/40`}
        >
          <Icone className="h-9 w-9 text-[#FAF8F5]" strokeWidth={1.8} />
        </div>

        <span className="mb-2 rounded-full border border-[#312E81] bg-[#1E1B4B]/80 px-3 py-0.5 text-[11px] font-semibold text-[#FBBF24]">
          {slide.etiqueta}
        </span>

        <h1 className="max-w-[280px] text-[21px] font-bold leading-snug text-[#FAF8F5]">
          {slide.titulo}
        </h1>

        <p className="mt-2.5 max-w-[300px] text-[13px] leading-relaxed text-slate-300">
          {slide.texto}
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {slide.selos.map((s) => {
            const IconeSelo = s.icone;
            return (
              <span
                key={s.rotulo}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#312E81]/80 bg-[#1E1B4B]/60 px-3 py-1 text-xs font-medium text-slate-200"
              >
                <IconeSelo className={`h-3.5 w-3.5 ${slide.destaque}`} />
                <span>{s.rotulo}</span>
              </span>
            );
          })}
        </div>
      </main>

      {/* Rodapé: Paginação + Botão Principal */}
      <footer className="relative z-10 shrink-0 pt-2">
        <div className="mb-4 flex justify-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir para a apresentação ${i + 1}`}
              onClick={() => setIndice(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === indice ? 'w-6 bg-[#F59E0B]' : 'w-2 bg-[#312E81]'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={avancar}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-sm font-bold text-[#0F172A] shadow-lg shadow-[#EA580C]/25 transition active:scale-[0.98]"
        >
          <span>{ultimo ? 'Entrar ou criar conta' : 'Continuar'}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </footer>
    </div>
  );
}
