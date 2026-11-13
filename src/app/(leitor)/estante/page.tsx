'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BookMarked,
  BookOpen,
  CheckCircle2,
  Compass,
  FolderUp,
  HardDriveDownload,
  Play,
} from 'lucide-react';
import type { UsrBiblioteca } from '@/infra/supabase/tipos-banco';
import {
  importarLivroPdfLocalParaEstante,
  listarEstanteHibridaUsuario,
  obterEstanteCacheadaSincrona,
} from '@/modulos/usr/servico-usuario';

export default function PaginaEstanteLeitor() {
  const router = useRouter();
  const inputPdfRef = useRef<HTMLInputElement | null>(null);

  const [estante, setEstante] = useState<UsrBiblioteca[]>(
    () => obterEstanteCacheadaSincrona() ?? []
  );
  const [filtro, setFiltro] = useState<'todos' | 'lendo' | 'concluidos'>(
    'todos'
  );
  const [importandoPdf, setImportandoPdf] = useState(false);
  const [avisoSincronizacao, setAvisoSincronizacao] = useState<string | null>(
    null
  );

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      const est = await listarEstanteHibridaUsuario();
      if (ativo) {
        setEstante(est);
      }
    };
    void carregar();
    return () => {
      ativo = false;
    };
  }, [router]);

  const aoSelecionarPdfLocal = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;

    setImportandoPdf(true);
    setAvisoSincronizacao(null);

    try {
      const { itemBiblioteca, retomadoDeOutroDispositivo } =
        await importarLivroPdfLocalParaEstante(arquivo);
      const novaEstante = await listarEstanteHibridaUsuario();
      setEstante(novaEstante);

      if (retomadoDeOutroDispositivo) {
        setAvisoSincronizacao(
          `Livro reconhecido! Retomando "${
            itemBiblioteca.bib_titulo_customizado ?? 'seu PDF'
          }" na página ${itemBiblioteca.bib_pagina_atual}.`
        );
      } else {
        setAvisoSincronizacao(
          `"${
            itemBiblioteca.bib_titulo_customizado ?? arquivo.name
          }" foi adicionado à sua estante offline.`
        );
      }
    } catch {
      setAvisoSincronizacao(
        'Não foi possível abrir o arquivo PDF selecionado. Verifique se é um PDF válido.'
      );
    } finally {
      setImportandoPdf(false);
      if (inputPdfRef.current) {
        inputPdfRef.current.value = '';
      }
    }
  };

  const livrosFiltrados = estante.filter((item) => {
    const concluido =
      item.bib_status === 'concluido' ||
      (item.bib_total_paginas > 0 &&
        item.bib_pagina_atual >= item.bib_total_paginas);
    if (filtro === 'concluidos') return concluido;
    if (filtro === 'lendo') return !concluido;
    return true;
  });

  return (
    <div className="animar-surgir w-full pb-4">
      <main className="w-full space-y-7 px-5 pt-5 pb-8">
        {/* 1. CABEÇALHO DA ESTANTE + BOTÃO IMPORTAR PDF */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-extrabold text-livion-texto">
                <BookMarked className="h-5 w-5 text-[#F59E0B]" />
                <span>Minha Estante</span>
              </h1>
              <p className="text-xs text-livion-secundario">
                Seus livros salvos para ler mesmo sem internet
              </p>
            </div>

            <span className="rounded-full border border-livion-borda bg-livion-card px-3 py-1 text-xs font-bold text-livion-texto">
              {estante.length} {estante.length === 1 ? 'obra' : 'obras'}
            </span>
          </div>

          <input
            ref={inputPdfRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={aoSelecionarPdfLocal}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => inputPdfRef.current?.click()}
            disabled={importandoPdf}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F59E0B] to-[#EA580C] px-4 text-xs font-bold text-[#0F172A] shadow-md shadow-[#EA580C]/20 transition active:scale-[0.98]"
          >
            <FolderUp className="h-4 w-4" />
            <span>
              {importandoPdf
                ? 'Preparando seu livro...'
                : 'Importar meu próprio livro (PDF)'}
            </span>
          </button>

          {avisoSincronizacao && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-600 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>{avisoSincronizacao}</span>
            </div>
          )}

          {/* Abas de filtro da estante */}
          <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-livion-borda bg-livion-card p-1">
            {(
              [
                { id: 'todos', rotulo: 'Todos' },
                { id: 'lendo', rotulo: 'Em leitura' },
                { id: 'concluidos', rotulo: 'Concluídos' },
              ] as const
            ).map((aba) => (
              <button
                key={aba.id}
                type="button"
                onClick={() => setFiltro(aba.id)}
                className={`rounded-xl py-2 text-xs font-bold transition ${
                  filtro === aba.id
                    ? 'bg-[#312E81] text-[#FAF8F5] shadow-sm'
                    : 'text-livion-secundario hover:text-livion-texto'
                }`}
              >
                {aba.rotulo}
              </button>
            ))}
          </div>
        </section>

        {/* 2. LISTA DE LIVROS DA ESTANTE */}
        <section>
          {livrosFiltrados.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-livion-borda bg-livion-card p-6 text-center">
              <BookOpen className="mx-auto mb-2.5 h-8 w-8 text-[#F59E0B]" />
              <h2 className="text-sm font-bold text-livion-texto">
                Nenhum livro por aqui ainda
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-livion-secundario">
                Importe um PDF do seu aparelho no botão acima ou descubra obras
                no nosso catálogo gratuito.
              </p>
              <Link
                href="/explorar"
                prefetch
                className="mt-4 inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-[#312E81] px-4 text-xs font-bold text-[#FAF8F5] transition hover:bg-[#4338CA]"
              >
                <Compass className="h-3.5 w-3.5 text-[#F59E0B]" />
                <span>Explorar catálogo</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {livrosFiltrados.map((item) => {
                const titulo =
                  item.bib_titulo_customizado ||
                  item.cat_livros?.liv_titulo ||
                  'Obra Literária';
                const autor =
                  item.bib_autor_customizado ||
                  item.cat_livros?.liv_autor ||
                  'Autor';
                const capaWebpLocal = item.bib_metadados?.capa_local_webp as
                  | string
                  | undefined;
                const urlCapa = capaWebpLocal || item.cat_livros?.liv_url_capa;
                const progresso = Math.min(
                  100,
                  Math.round(
                    (item.bib_pagina_atual /
                      Math.max(1, item.bib_total_paginas)) *
                      100
                  )
                );

                return (
                  <Link
                    key={item.bib_id}
                    href={`/ler/${item.bib_id}`}
                    className="group flex gap-4 rounded-3xl border border-livion-borda bg-livion-card p-4 shadow-sm transition hover:border-[#F59E0B]/60"
                  >
                    <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-2xl border border-livion-borda bg-[#1E1B4B]">
                      {urlCapa ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={urlCapa}
                          alt={titulo}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-[#312E81] to-[#1E1B4B] p-1.5 text-center">
                          <BookOpen className="mb-1 h-5 w-5 text-[#F59E0B]" />
                          <span className="line-clamp-2 text-[9px] font-bold text-[#FAF8F5]">
                            {titulo}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col justify-between">
                      <div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-livion-elevado px-2 py-0.5 text-[10px] font-semibold text-livion-secundario">
                          <HardDriveDownload className="h-3 w-3 text-[#EA580C]" />
                          {item.bib_arquivo_local
                            ? 'PDF Pessoal • Offline'
                            : 'Acervo • Offline'}
                        </span>
                        <h3 className="mt-1 truncate text-sm font-bold text-livion-texto">
                          {titulo}
                        </h3>
                        <p className="truncate text-xs text-livion-secundario">
                          {autor}
                        </p>
                      </div>

                      <div className="mt-2">
                        <div className="mb-1 flex items-center justify-between text-[11px]">
                          <span className="font-medium text-livion-secundario">
                            Pág. {item.bib_pagina_atual} de{' '}
                            {item.bib_total_paginas}
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
                        <div className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-[#EA580C]">
                          <Play className="h-3 w-3 fill-current" />
                          <span>Abrir na página {item.bib_pagina_atual}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
