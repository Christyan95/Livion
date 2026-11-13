'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Compass, Search, Sparkles, Zap } from 'lucide-react';
import type { CatCategoria, CatLivro } from '@/infra/supabase/tipos-banco';
import {
  listarCategoriasAtivas,
  listarLivrosCatalogo,
  obterCategoriasCacheadasSincronas,
  obterLivrosCacheadosSincronos,
} from '@/modulos/cat/servico-catalogo';
import { adicionarLivroPublicoNaEstante } from '@/modulos/usr/servico-usuario';

export default function PaginaExplorarAcervo() {
  const router = useRouter();
  const [categorias, setCategorias] = useState<CatCategoria[]>(() =>
    obterCategoriasCacheadasSincronas()
  );
  const [livrosCatalogo, setLivrosCatalogo] = useState<CatLivro[]>(() =>
    obterLivrosCacheadosSincronos()
  );
  const [categoriaSelecionada, setCategoriaSelecionada] =
    useState<string>('todas');
  const [termoBusca, setTermoBusca] = useState('');

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      const [cats, livs] = await Promise.all([
        listarCategoriasAtivas(),
        listarLivrosCatalogo(),
      ]);
      if (ativo) {
        setCategorias(cats);
        setLivrosCatalogo(livs);
      }
    };
    void carregar();
    return () => {
      ativo = false;
    };
  }, []);

  const abrirLivroDoCatalogo = async (livro: CatLivro) => {
    const item = await adicionarLivroPublicoNaEstante(livro);
    router.push(`/ler/${item.bib_id}`);
  };

  const termoLimpo = termoBusca.trim().toLowerCase();

  const livrosDestaqueLivion = livrosCatalogo.filter(
    (l) => l.liv_destaque_professora
  );
  const livrosLeituraRapida = livrosCatalogo.filter(
    (l) => l.liv_leitura_rapida
  );

  const livrosFiltrados = livrosCatalogo.filter((l) => {
    const bateCategoria =
      categoriaSelecionada === 'todas' || l.liv_cat_id === categoriaSelecionada;
    const bateBusca =
      !termoLimpo ||
      l.liv_titulo.toLowerCase().includes(termoLimpo) ||
      l.liv_autor.toLowerCase().includes(termoLimpo);
    return bateCategoria && bateBusca;
  });

  return (
    <div className="animar-surgir w-full pb-4">
      <main className="w-full space-y-8 px-5 pt-5 pb-8">
        {/* 1. CABEÇALHO + BUSCA + FILTRO DE CATEGORIAS */}
        <section className="space-y-3.5">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-extrabold text-livion-texto">
              <Compass className="h-5 w-5 text-[#F59E0B]" />
              <span>Explorar Acervo</span>
            </h1>
            <p className="text-xs text-livion-secundario">
              Clássicos, contos de 15 minutos e curadoria literária
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-livion-apoio" />
            <input
              type="search"
              value={termoBusca}
              onChange={(e) => setTermoBusca(e.target.value)}
              placeholder="Buscar por título ou autor..."
              className="h-10 w-full rounded-2xl border border-livion-borda bg-livion-card pl-10 pr-3.5 text-xs text-livion-texto placeholder-livion-apoio focus:border-[#F59E0B] focus:outline-none"
            />
          </div>

          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setCategoriaSelecionada('todas')}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                categoriaSelecionada === 'todas'
                  ? 'bg-[#F59E0B] text-[#0F172A]'
                  : 'border border-livion-borda bg-livion-card text-livion-secundario'
              }`}
            >
              Todas
            </button>
            {categorias.map((cat) => (
              <button
                key={cat.cat_id}
                type="button"
                onClick={() => setCategoriaSelecionada(cat.cat_id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  categoriaSelecionada === cat.cat_id
                    ? 'bg-[#F59E0B] text-[#0F172A]'
                    : 'border border-livion-borda bg-livion-card text-livion-secundario'
                }`}
              >
                {cat.cat_nome}
              </button>
            ))}
          </div>
        </section>

        {/* 2. INDICAÇÕES DA LIVION (quando sem filtro de busca) */}
        {!termoLimpo &&
          categoriaSelecionada === 'todas' &&
          livrosDestaqueLivion.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-livion-texto">
                  <Sparkles className="h-4 w-4 text-[#6D28D9]" />
                  <span>Indicações da Livion</span>
                </h2>
                <p className="text-[11px] text-livion-secundario">
                  Obras selecionadas para debate e repertório
                </p>
              </div>

              <div className="space-y-4">
                {livrosDestaqueLivion.map((livro) => (
                  <div
                    key={livro.liv_id}
                    className="rounded-3xl border border-livion-borda bg-livion-card p-5 shadow-sm"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="rounded-full bg-[#6D28D9]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6D28D9]">
                        Destaque da Livion
                      </span>
                      <span className="text-xs font-medium text-livion-secundario">
                        {livro.liv_total_paginas} págs
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-livion-texto">
                      {livro.liv_titulo}
                    </h3>
                    <p className="text-xs font-semibold text-[#EA580C]">
                      {livro.liv_autor}
                    </p>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-livion-secundario">
                      {livro.liv_sinopse}
                    </p>

                    <button
                      type="button"
                      onClick={() => void abrirLivroDoCatalogo(livro)}
                      className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-xs font-bold text-[#0F172A] shadow-sm transition active:scale-[0.98]"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Ler agora</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

        {/* 3. CONTOS DE 15 MINUTOS */}
        {!termoLimpo &&
          categoriaSelecionada === 'todas' &&
          livrosLeituraRapida.length > 0 && (
            <section className="space-y-3">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-bold text-livion-texto">
                  <Zap className="h-4 w-4 text-emerald-500" />
                  <span>Leituras Rápidas (15 min)</span>
                </h2>
                <p className="text-[11px] text-livion-secundario">
                  Conclua uma obra completa em uma única sessão
                </p>
              </div>

              <div className="space-y-3.5">
                {livrosLeituraRapida.map((livro) => (
                  <div
                    key={livro.liv_id}
                    className="flex items-center justify-between gap-3.5 rounded-3xl border border-livion-borda bg-livion-card p-4 shadow-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="inline-block rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        ~15 min • {livro.liv_total_paginas} págs
                      </span>
                      <h3 className="mt-1.5 truncate text-sm font-bold text-livion-texto">
                        {livro.liv_titulo}
                      </h3>
                      <p className="truncate text-xs text-livion-secundario">
                        {livro.liv_autor}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void abrirLivroDoCatalogo(livro)}
                      className="shrink-0 rounded-2xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-[#0F172A] transition active:scale-[0.98]"
                    >
                      Ler conto
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

        {/* 4. CATÁLOGO COMPLETO */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-livion-texto">
              Catálogo Completo
            </h2>
            <span className="text-xs font-medium text-livion-secundario">
              {livrosFiltrados.length}{' '}
              {livrosFiltrados.length === 1 ? 'obra' : 'obras'}
            </span>
          </div>

          <div className="space-y-4">
            {livrosFiltrados.map((livro) => (
              <div
                key={livro.liv_id}
                className="rounded-3xl border border-livion-borda bg-livion-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-livion-texto">
                      {livro.liv_titulo}
                    </h3>
                    <p className="text-xs font-medium text-livion-secundario">
                      {livro.liv_autor}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-livion-elevado px-2.5 py-0.5 text-[11px] font-semibold text-livion-secundario">
                    {livro.liv_total_paginas} págs
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-livion-secundario">
                  {livro.liv_sinopse}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-livion-borda pt-3">
                  <span className="text-[11px] font-bold text-[#EA580C]">
                    {livro.liv_total_paginas >= 30
                      ? '+200 XP ao concluir'
                      : '+5 XP por página'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void abrirLivroDoCatalogo(livro)}
                    className="rounded-xl bg-[#312E81] px-4 py-2 text-xs font-bold text-[#FAF8F5] transition hover:bg-[#4338CA]"
                  >
                    Abrir livro
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
