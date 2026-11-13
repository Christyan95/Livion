'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Moon,
  PauseCircle,
  Sparkles,
  Sun,
} from 'lucide-react';
import {
  obterPdfDoIndexedDB,
  salvarPaginaMemoriaInvisivel,
} from '@/infra/indexeddb/banco-local';
import {
  gerarPdfLiterarioDemo,
  renderizarPaginaPdfNoCanvas,
} from '@/infra/pdf-worker/processador-pdf';
import type {
  ResultadoPulsoLeitura,
  UsrBiblioteca,
} from '@/infra/supabase/tipos-banco';
import { obterOuBaixarBinarioLivroPublico } from '@/modulos/cat/servico-catalogo';
import { useMotorLeituraAtiva } from '@/modulos/gam/use-motor-leitura-ativa';
import {
  obterParametrosMotorCalibrados,
  type ParametrosMotorCalibrados,
} from '@/modulos/sis/servico-sistema';
import {
  atualizarPaginaItemEstanteLocal,
  obterItemBibliotecaPorId,
} from '@/modulos/usr/servico-usuario';

type ModoConfortoVisual = 'sepia' | 'noturno';

export default function PaginaLeitorImersivo() {
  const params = useParams<{ bibId: string }>();
  const router = useRouter();
  const bibId = params.bibId;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchInicioXRef = useRef<number | null>(null);

  const [itemBib, setItemBib] = useState<UsrBiblioteca | null>(null);
  const [cfgMotor, setCfgMotor] = useState<ParametrosMotorCalibrados | null>(
    null
  );
  const [bufferPdf, setBufferPdf] = useState<ArrayBuffer | null>(null);
  const [paginaAtual, setPaginaAtual] = useState<number>(1);
  const [totalPaginas, setTotalPaginas] = useState<number>(12);
  const [tempoMinimoPaginaSeg, setTempoMinimoPaginaSeg] = useState<number>(15);
  const [modoVisual, setModoVisual] = useState<ModoConfortoVisual>('sepia');
  const [hudVisivel, setHudVisivel] = useState<boolean>(true);
  const [carregandoPdf, setCarregandoPdf] = useState<boolean>(true);
  const [feedbackPulso, setFeedbackPulso] =
    useState<ResultadoPulsoLeitura | null>(null);
  const [avisoRapido, setAvisoRapido] = useState<string | null>(null);

  // Carrega dados do livro na estante, parâmetros calibrados e binário do IndexedDB
  useEffect(() => {
    const inicializarLeitor = async () => {
      setCarregandoPdf(true);
      const [item, cfg] = await Promise.all([
        obterItemBibliotecaPorId(bibId),
        obterParametrosMotorCalibrados(),
      ]);

      setCfgMotor(cfg);

      if (!item) {
        router.push('/estante');
        return;
      }

      setItemBib(item);
      setPaginaAtual(item.bib_pagina_atual);
      setTotalPaginas(item.bib_total_paginas);

      let binario: ArrayBuffer | null = null;

      if (item.bib_arquivo_local && item.bib_hash_arquivo_local) {
        const cacheLocal = await obterPdfDoIndexedDB(
          `local:${item.bib_hash_arquivo_local}`
        );
        if (cacheLocal) {
          binario = cacheLocal.binario;
        }
      } else if (item.cat_livros) {
        binario = await obterOuBaixarBinarioLivroPublico(item.cat_livros);
      }

      if (!binario) {
        binario = gerarPdfLiterarioDemo(
          item.bib_titulo_customizado ||
            item.cat_livros?.liv_titulo ||
            'Obra Livion',
          item.bib_autor_customizado ||
            item.cat_livros?.liv_autor ||
            'Autor Clássico',
          item.bib_total_paginas
        );
      }

      setBufferPdf(binario);
      setCarregandoPdf(false);
    };

    void inicializarLeitor();
  }, [bibId, router]);

  // Renderiza a página atual no Canvas e calcula W_p e T_min (em background)
  useEffect(() => {
    if (!bufferPdf || !canvasRef.current) return;

    let cancelado = false;
    const renderizar = async () => {
      if (!canvasRef.current) return;
      const largura =
        containerRef.current?.clientWidth ||
        (typeof window !== 'undefined'
          ? Math.min(window.innerWidth - 24, 380)
          : 360);

      try {
        const res = await renderizarPaginaPdfNoCanvas({
          buffer: bufferPdf,
          numeroPagina: paginaAtual,
          canvas: canvasRef.current,
          larguraContainerPx: largura,
          velocidadeMaximaPpm: cfgMotor?.velocidade_maxima_ppm ?? 350,
          tempoMinimoSeg: cfgMotor?.tempo_minimo_pagina_seg ?? 5,
          tempoMaximoSeg: cfgMotor?.tempo_maximo_pagina_seg ?? 60,
        });

        if (!cancelado) {
          setTotalPaginas(res.totalPaginas);
          setTempoMinimoPaginaSeg(res.tempoMinimoSegundos);
        }
      } catch {
        // Fallback gracioso
      }
    };

    void renderizar();
    return () => {
      cancelado = true;
    };
  }, [bufferPdf, cfgMotor, paginaAtual]);

  // Hook do Motor Anti-Fraude de Leitura Ativa (executado 100% em background)
  const {
    estadoCronometro,
    retomarDeOciosidade,
    forcarSincronizacaoAoSair,
  } = useMotorLeituraAtiva({
    bibId,
    paginaAtual,
    tempoMinimoPaginaSeg,
    tempoLimiteOciosidadeSeg: cfgMotor?.tempo_limite_ociosidade_seg ?? 120,
    intervaloPulsoSeg: cfgMotor?.intervalo_pulso_sincronizacao_seg ?? 60,
    aoReceberResultadoPulso: (res) => {
      setFeedbackPulso(res);
      window.setTimeout(() => setFeedbackPulso(null), 3500);
    },
  });

  // RN03.1: Memória Invisível a cada virada de página
  const irParaPagina = useCallback(
    (destino: number) => {
      const novaPagina = Math.min(Math.max(1, destino), totalPaginas);
      if (novaPagina === paginaAtual) return;

      setPaginaAtual(novaPagina);
      salvarPaginaMemoriaInvisivel(
        bibId,
        novaPagina,
        itemBib?.bib_hash_arquivo_local
      );
      void atualizarPaginaItemEstanteLocal(bibId, novaPagina);
    },
    [bibId, itemBib?.bib_hash_arquivo_local, paginaAtual, totalPaginas]
  );

  // Gestos Touch (Swipe Lateral — RN03.2)
  const aoIniciarToque = (e: React.TouchEvent) => {
    touchInicioXRef.current = e.touches[0]?.clientX ?? null;
  };

  const aoFinalizarToque = (e: React.TouchEvent) => {
    if (touchInicioXRef.current === null) return;
    const fimX = e.changedTouches[0]?.clientX ?? touchInicioXRef.current;
    const deltaX = fimX - touchInicioXRef.current;
    touchInicioXRef.current = null;

    if (Math.abs(deltaX) > 50) {
      if (deltaX < 0) {
        irParaPagina(paginaAtual + 1);
      } else {
        irParaPagina(paginaAtual - 1);
      }
    }
  };

  // Toque inteligente nas bordas (avançar/voltar) ou no centro (retrair/expandir HUD)
  const aoClicarAreaLeitura = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRelativo = (e.clientX - rect.left) / Math.max(1, rect.width);

    if (xRelativo < 0.22) {
      irParaPagina(paginaAtual - 1);
    } else if (xRelativo > 0.78) {
      irParaPagina(paginaAtual + 1);
    } else {
      setHudVisivel((v) => !v);
    }
  };

  // Alterna entre Creme Papiro (Light) e Tinta Noturna (Night)
  const alternarTema = () => {
    setModoVisual((prev) => (prev === 'noturno' ? 'sepia' : 'noturno'));
  };

  const tituloLivro =
    itemBib?.bib_titulo_customizado ||
    itemBib?.cat_livros?.liv_titulo ||
    'Leitor Livion';

  const classesFundoModo: Record<ModoConfortoVisual, string> = {
    sepia: 'bg-[#FAF8F5] text-[#1E293B]',
    noturno: 'bg-[#0F172A] text-[#FAF8F5]',
  };

  const classesFiltroCanvas: Record<ModoConfortoVisual, string> = {
    sepia: 'filtro-canvas-sepia',
    noturno: 'filtro-canvas-noturno',
  };

  return (
    <div
      className={`relative flex min-h-full w-full flex-1 flex-col items-center justify-center transition-colors duration-300 ${classesFundoModo[modoVisual]}`}
    >
      {/* =====================================================================
          1. BARRA SUPERIOR RETRÁTIL — MINIMALISTA (Apenas Voltar e Tema)
         ===================================================================== */}
      <header
        className={`fixed left-0 right-0 top-0 z-30 flex items-center justify-between border-b px-3 py-2.5 backdrop-blur-md transition-all duration-300 ${
          modoVisual === 'noturno'
            ? 'border-slate-800/80 bg-[#0F172A]/90 text-slate-100'
            : 'border-stone-200/90 bg-[#FAF8F5]/90 text-stone-900'
        } ${hudVisivel ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}
      >
        {/* Seta para Voltar */}
        <button
          type="button"
          onClick={() => {
            forcarSincronizacaoAoSair();
            if (typeof window !== 'undefined' && window.history.length > 1) {
              router.back();
            } else {
              router.push('/estante');
            }
          }}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90 ${
            modoVisual === 'noturno'
              ? 'hover:bg-slate-800 text-slate-200'
              : 'hover:bg-stone-200/70 text-stone-800'
          }`}
          aria-label="Voltar para a Estante"
          title="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Título Discreto da Obra */}
        <div className="min-w-0 flex-1 px-3 text-center">
          <h1 className="truncate text-xs font-semibold tracking-tight opacity-90">
            {tituloLivro}
          </h1>
        </div>

        {/* Ícone de Alterar Tema (Light para Night) */}
        <button
          type="button"
          onClick={alternarTema}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition active:scale-90 ${
            modoVisual === 'noturno'
              ? 'hover:bg-slate-800 text-amber-300'
              : 'hover:bg-stone-200/70 text-slate-700'
          }`}
          aria-label={
            modoVisual === 'noturno'
              ? 'Mudar para tema claro (Creme Papiro)'
              : 'Mudar para tema noturno (Tinta Noturna)'
          }
          title={
            modoVisual === 'noturno'
              ? 'Modo Claro'
              : 'Modo Noturno'
          }
        >
          {modoVisual === 'noturno' ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>
      </header>

      {/* =====================================================================
          2. ÁREA CENTRAL DE RENDERIZAÇÃO DA PÁGINA (Canvas PDF.js)
         ===================================================================== */}
      <div
        ref={containerRef}
        onClick={aoClicarAreaLeitura}
        onTouchStart={aoIniciarToque}
        onTouchEnd={aoFinalizarToque}
        className="flex min-h-full w-full flex-1 cursor-pointer select-none flex-col items-center justify-center px-2 py-14"
      >
        {carregandoPdf ? (
          <div className="rounded-2xl border border-indigo-500/20 bg-slate-900/90 px-6 py-6 text-center text-white shadow-xl backdrop-blur-md">
            <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-xs font-medium text-slate-300">
              Carregando leitura...
            </p>
          </div>
        ) : (
          <div className="relative flex items-center justify-center overflow-hidden rounded-xl shadow-lg">
            <canvas
              ref={canvasRef}
              className={`max-w-full rounded-lg transition-all duration-200 ${classesFiltroCanvas[modoVisual]}`}
            />
          </div>
        )}
      </div>

      {/* =====================================================================
          3. BARRA INFERIOR RETRÁTIL — LIMPA E MODERNA (Pouco conteúdo textual)
         ===================================================================== */}
      <footer
        className={`fixed bottom-0 left-0 right-0 z-30 border-t px-4 py-2.5 backdrop-blur-md transition-all duration-300 ${
          modoVisual === 'noturno'
            ? 'border-slate-800/80 bg-[#0F172A]/90 text-slate-100'
            : 'border-stone-200/90 bg-[#FAF8F5]/90 text-stone-900'
        } ${hudVisivel ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
      >
        <div className="mx-auto flex max-w-sm items-center gap-3">
          {/* Botão Página Anterior */}
          <button
            type="button"
            onClick={() => irParaPagina(paginaAtual - 1)}
            disabled={paginaAtual <= 1}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-20 ${
              modoVisual === 'noturno'
                ? 'hover:bg-slate-800 text-slate-200'
                : 'hover:bg-stone-200/70 text-stone-800'
            }`}
            aria-label="Página anterior"
            title="Anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* Scrubber / Slider com indicador limpo de página */}
          <div className="flex flex-1 items-center gap-3">
            <input
              type="range"
              min={1}
              max={Math.max(1, totalPaginas)}
              value={paginaAtual}
              onChange={(e) => irParaPagina(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full accent-indigo-600 dark:accent-indigo-400 bg-stone-300 dark:bg-slate-700"
              aria-label="Selecionar página"
            />
            <span className="shrink-0 text-xs font-semibold tabular-nums opacity-80 min-w-[50px] text-right">
              {paginaAtual} / {totalPaginas}
            </span>
          </div>

          {/* Botão Próxima Página */}
          <button
            type="button"
            onClick={() => irParaPagina(paginaAtual + 1)}
            disabled={paginaAtual >= totalPaginas}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-20 ${
              modoVisual === 'noturno'
                ? 'hover:bg-slate-800 text-slate-200'
                : 'hover:bg-stone-200/70 text-stone-800'
            }`}
            aria-label="Próxima página"
            title="Próxima"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </footer>

      {/* =====================================================================
          4. FEEDBACK DE XP DISCRETO E NÃO INVASIVO
         ===================================================================== */}
      {feedbackPulso && (
        <div className="pointer-events-none fixed top-14 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-indigo-500/40 bg-indigo-950/90 px-3.5 py-1 text-xs font-semibold text-indigo-200 shadow-lg backdrop-blur-md animar-surgir">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          <span>+{feedbackPulso.xp_ganho_pulso} XP</span>
          {feedbackPulso.bateu_meta_neste_pulso && (
            <span className="font-bold text-amber-400">• Meta diária! 🔥</span>
          )}
        </div>
      )}

      {/* Toast Rápido (se houver aviso transitório) */}
      {avisoRapido && (
        <div className="pointer-events-none fixed bottom-14 left-1/2 z-40 -translate-x-1/2 rounded-full border border-slate-700 bg-slate-900/90 px-3.5 py-1 text-xs font-medium text-slate-200 shadow-md backdrop-blur-md animar-surgir">
          {avisoRapido}
        </div>
      )}

      {/* =====================================================================
          5. AVISO TRANSLÚCIDO DE PAUSA POR OCIOSIDADE OU PERDA DE FOCO
         ===================================================================== */}
      {estadoCronometro !== 'ATIVO' && (
        <div
          onClick={retomarDeOciosidade}
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
        >
          <div className="max-w-xs rounded-3xl border border-amber-500/30 bg-slate-900/95 p-6 text-center text-white shadow-2xl">
            <PauseCircle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
            <h2 className="text-base font-bold">Leitura em Pausa</h2>
            <p className="mt-1.5 text-xs text-slate-300">
              Toque na tela para retomar sua leitura ativa.
            </p>
            <button
              type="button"
              onClick={retomarDeOciosidade}
              className="mt-4 w-full rounded-xl bg-amber-500 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-amber-400 active:scale-95"
            >
              Continuar Lendo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
