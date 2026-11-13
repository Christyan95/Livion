'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Award,
  BookOpen,
  ChevronRight,
  Clock,
  Compass,
  Flame,
  FolderUp,
  Play,
  Shield,
  Sparkles,
} from 'lucide-react';
import type {
  CatLivro,
  GamNivel,
  UsrBiblioteca,
  UsrPerfil,
} from '@/infra/supabase/tipos-banco';
import {
  listarLivrosCatalogo,
  obterLivrosCacheadosSincronos,
} from '@/modulos/cat/servico-catalogo';
import {
  listarNiveisPatente,
  obterNiveisCacheadosSincronos,
  obterSegundosLidosHojeLocal,
  obterSegundosLidosHojeUsuario,
} from '@/modulos/gam/servico-gamificacao';
import { ModalBoasVindasOnboarding } from '@/modulos/usr/ModalBoasVindasOnboarding';
import {
  adicionarLivroPublicoNaEstante,
  listarEstanteHibridaUsuario,
  obterEstanteCacheadaSincrona,
  obterPerfilCacheadoSincrono,
  obterPerfilUsuarioAtual,
} from '@/modulos/usr/servico-usuario';

export default function PaginaInicialLeitor() {
  const router = useRouter();

  // Inicialização instantânea via cache de sessão (Zero Layout Shift)
  const [perfil, setPerfil] = useState<UsrPerfil | null>(() =>
    obterPerfilCacheadoSincrono()
  );
  const [estante, setEstante] = useState<UsrBiblioteca[]>(
    () => obterEstanteCacheadaSincrona() ?? []
  );
  const [livrosCatalogo, setLivrosCatalogo] = useState<CatLivro[]>(() =>
    obterLivrosCacheadosSincronos()
  );
  const [niveis, setNiveis] = useState<GamNivel[]>(() =>
    obterNiveisCacheadosSincronos()
  );
  const [segundosHoje, setSegundosHoje] = useState(() =>
    obterSegundosLidosHojeLocal()
  );
  const [exibirOnboarding, setExibirOnboarding] = useState(false);

  useEffect(() => {
    let ativo = true;

    const carregarTudo = async () => {
      const [per, est, livs, nivs, segHoje] = await Promise.all([
        obterPerfilUsuarioAtual(),
        listarEstanteHibridaUsuario(),
        listarLivrosCatalogo(),
        listarNiveisPatente(),
        obterSegundosLidosHojeUsuario(),
      ]);

      if (!ativo) return;

      if (!per) {
        router.push('/entrar');
        return;
      }

      setPerfil(per);
      setEstante(est);
      setLivrosCatalogo(livs);
      setNiveis(nivs);
      setSegundosHoje(segHoje);

      const params = new URLSearchParams(window.location.search);
      if (!per.per_apelido || params.get('onboarding') === '1') {
        setExibirOnboarding(true);
      }
    };

    void carregarTudo();
    return () => {
      ativo = false;
    };
  }, [router]);

  const abrirLivroDoCatalogo = async (livro: CatLivro) => {
    const item = await adicionarLivroPublicoNaEstante(livro);
    router.push(`/ler/${item.bib_id}`);
  };

  const metaSegundos = (perfil?.per_meta_diaria_minutos ?? 15) * 60;
  const percentualMetaHoje = Math.min(
    100,
    Math.round((segundosHoje / Math.max(1, metaSegundos)) * 100)
  );
  const minutosLidosHoje = Math.floor(segundosHoje / 60);

  const patenteAtual =
    niveis.find((n) => n.niv_numero === (perfil?.per_niv_numero ?? 1)) ??
    niveis[0];

  const livroEmLeitura = estante[0] ?? null;
  const destaquePrincipal =
    livrosCatalogo.find((l) => l.liv_destaque_professora) ??
    livrosCatalogo[0] ??
    null;

  return (
    <div className="animar-surgir w-full pb-4">
      {exibirOnboarding && perfil && (
        <ModalBoasVindasOnboarding
          perfil={perfil}
          aoConcluir={(atualizado) => {
            setPerfil(atualizado);
            setExibirOnboarding(false);
          }}
        />
      )}

      <main className="w-full space-y-7 px-5 pt-5 pb-8">
        {/* 1. SAUDAÇÃO LIMPA + META DIÁRIA */}
        <section className="space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-livion-secundario">
                Bom te ver por aqui,
              </p>
              <h1 className="text-xl font-extrabold tracking-tight text-livion-texto">
                {perfil?.per_nome_exibicao?.split(' ')[0] ?? 'Leitor'}
              </h1>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#6D28D9]/30 bg-[#6D28D9]/15 px-3 py-1 text-[11px] font-bold text-[#6D28D9] dark:text-violet-300">
              <Award className="h-3.5 w-3.5 text-[#F59E0B]" />
              <span>
                Nív. {perfil?.per_niv_numero ?? 1} •{' '}
                {patenteAtual?.niv_titulo_patente ?? 'Iniciante'}
              </span>
            </span>
          </div>

          {/* Cartão de Ritmo Diário */}
          <div className="rounded-3xl border border-livion-borda bg-livion-card p-5 shadow-sm transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#F59E0B]/15 text-[#EA580C]">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xs font-bold text-livion-texto">
                    Ritmo de hoje
                  </h2>
                  <p className="text-[11px] text-livion-secundario">
                    {minutosLidosHoje} de {perfil?.per_meta_diaria_minutos ?? 15}{' '}
                    min concluídos
                  </p>
                </div>
              </div>

              <span className="text-sm font-extrabold text-[#EA580C]">
                {percentualMetaHoje}%
              </span>
            </div>

            <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-livion-elevado">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] via-[#EA580C] to-[#6D28D9] transition-all duration-500"
                style={{ width: `${percentualMetaHoje}%` }}
              />
            </div>

            <div className="mt-3.5 flex items-center justify-between border-t border-livion-borda pt-3 text-[11px] text-livion-secundario">
              <span className="inline-flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-cyan-500" />
                <span>
                  Escudos: {perfil?.per_escudos_ofensiva ?? 0}/2 ativos
                </span>
              </span>

              <button
                type="button"
                onClick={() => setExibirOnboarding(true)}
                className="font-bold text-[#EA580C] hover:underline"
              >
                Ajustar meta
              </button>
            </div>
          </div>
        </section>

        {/* 2. CONTINUAR LENDO (FOCO EM UMA ÚNICA OBRA ATIVA) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-livion-texto">
              Continuar lendo
            </h2>
            <Link
              href="/estante"
              prefetch
              className="inline-flex items-center gap-0.5 text-xs font-bold text-[#EA580C]"
            >
              <span>Minha estante</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {livroEmLeitura ? (
            (() => {
              const titulo =
                livroEmLeitura.bib_titulo_customizado ||
                livroEmLeitura.cat_livros?.liv_titulo ||
                'Obra Literária';
              const autor =
                livroEmLeitura.bib_autor_customizado ||
                livroEmLeitura.cat_livros?.liv_autor ||
                'Autor';
              const capaWebpLocal = livroEmLeitura.bib_metadados
                ?.capa_local_webp as string | undefined;
              const urlCapa =
                capaWebpLocal || livroEmLeitura.cat_livros?.liv_url_capa;
              const progresso = Math.min(
                100,
                Math.round(
                  (livroEmLeitura.bib_pagina_atual /
                    Math.max(1, livroEmLeitura.bib_total_paginas)) *
                    100
                )
              );

              return (
                <Link
                  href={`/ler/${livroEmLeitura.bib_id}`}
                  className="group flex gap-4 rounded-3xl border border-livion-borda bg-livion-card p-5 shadow-sm transition hover:border-[#F59E0B]/60"
                >
                  <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-2xl border border-livion-borda bg-[#1E1B4B] shadow-md">
                    {urlCapa ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={urlCapa}
                        alt={titulo}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-[#312E81] to-[#1E1B4B] p-2 text-center">
                        <BookOpen className="mb-1 h-5 w-5 text-[#F59E0B]" />
                        <span className="line-clamp-2 text-[9px] font-bold text-[#FAF8F5]">
                          {titulo}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-between">
                    <div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#F59E0B]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#EA580C]">
                        <Flame className="h-3 w-3 fill-[#F59E0B]" />
                        <span>Em andamento</span>
                      </span>
                      <h3 className="mt-1.5 truncate text-base font-bold text-livion-texto">
                        {titulo}
                      </h3>
                      <p className="truncate text-xs text-livion-secundario">
                        {autor}
                      </p>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="text-livion-secundario">
                          Pág. {livroEmLeitura.bib_pagina_atual} de{' '}
                          {livroEmLeitura.bib_total_paginas}
                        </span>
                        <span className="font-bold text-[#EA580C]">
                          {progresso}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-livion-elevado">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] to-[#EA580C]"
                          style={{ width: `${progresso}%` }}
                        />
                      </div>
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[#EA580C]">
                        <Play className="h-3.5 w-3.5 fill-current" />
                        <span>Retomar leitura</span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })()
          ) : (
            <div className="rounded-3xl border border-livion-borda bg-livion-card p-6 text-center shadow-sm">
              <div className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F59E0B]/15 text-[#EA580C]">
                <BookOpen className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold text-livion-texto">
                Qual será sua próxima leitura?
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-livion-secundario">
                Escolha um clássico gratuito no catálogo ou abra um livro PDF do
                seu celular.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <Link
                  href="/explorar"
                  prefetch
                  className="flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-r from-[#F59E0B] to-[#EA580C] px-3 text-xs font-bold text-[#0F172A] shadow-sm transition active:scale-95"
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>Explorar acervo</span>
                </Link>
                <Link
                  href="/estante"
                  prefetch
                  className="flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-livion-borda bg-livion-elevado px-3 text-xs font-bold text-livion-texto transition active:scale-95"
                >
                  <FolderUp className="h-3.5 w-3.5 text-[#EA580C]" />
                  <span>Importar PDF</span>
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* 3. CURADORIA DO DIA (1 ÚNICO DESTAQUE PARA NÃO POLUIR) */}
        {destaquePrincipal && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-livion-texto">
                <Sparkles className="h-4 w-4 text-[#6D28D9]" />
                <span>Sugestão da Livion</span>
              </h2>
              <Link
                href="/explorar"
                prefetch
                className="inline-flex items-center gap-0.5 text-xs font-bold text-[#EA580C]"
              >
                <span>Ver catálogo</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="rounded-3xl border border-livion-borda bg-livion-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-[#6D28D9]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6D28D9]">
                  Leitura Recomendada
                </span>
                <span className="text-xs font-medium text-livion-secundario">
                  {destaquePrincipal.liv_total_paginas} págs
                </span>
              </div>

              <h3 className="mt-2.5 text-base font-bold text-livion-texto">
                {destaquePrincipal.liv_titulo}
              </h3>
              <p className="mt-0.5 text-xs font-semibold text-[#EA580C]">
                {destaquePrincipal.liv_autor}
              </p>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-livion-secundario">
                {destaquePrincipal.liv_sinopse}
              </p>

              <button
                type="button"
                onClick={() => void abrirLivroDoCatalogo(destaquePrincipal)}
                className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#312E81] text-xs font-bold text-[#FAF8F5] shadow-sm transition hover:bg-[#4338CA] active:scale-[0.98]"
              >
                <BookOpen className="h-3.5 w-3.5 text-[#F59E0B]" />
                <span>Começar a ler agora</span>
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
