import {
  obterPdfDoIndexedDB,
  salvarPdfNoIndexedDB,
} from '@/infra/indexeddb/banco-local';
import { gerarPdfLiterarioDemo } from '@/infra/pdf-worker/processador-pdf';
import { obterClienteSupabaseNavegador } from '@/infra/supabase/cliente-navegador';
import {
  CATEGORIAS_PADRAO,
  LIVROS_PADRAO,
} from '@/infra/supabase/dados-demonstracao';
import type { CatCategoria, CatLivro } from '@/infra/supabase/tipos-banco';
import { registrarEventoAuditoriaLocal } from '@/modulos/sis/servico-sistema';

const CHAVE_STORAGE_CATS = 'livion:cat_categorias';
const CHAVE_STORAGE_LIVS = 'livion:cat_livros';

let cacheCategoriasMemoria: CatCategoria[] | null = null;
let cacheLivrosMemoria: CatLivro[] | null = null;

export function obterCategoriasCacheadasSincronas(): CatCategoria[] {
  if (cacheCategoriasMemoria) return cacheCategoriasMemoria;
  if (typeof window !== 'undefined') {
    const salvo = window.localStorage.getItem(CHAVE_STORAGE_CATS);
    if (salvo) {
      try {
        cacheCategoriasMemoria = JSON.parse(salvo) as CatCategoria[];
        return cacheCategoriasMemoria.filter((c) => c.cat_ativo);
      } catch {
        // Fallback
      }
    }
  }
  return CATEGORIAS_PADRAO.filter((c) => c.cat_ativo);
}

export function obterLivrosCacheadosSincronos(): CatLivro[] {
  if (cacheLivrosMemoria) return cacheLivrosMemoria;
  if (typeof window !== 'undefined') {
    const salvo = window.localStorage.getItem(CHAVE_STORAGE_LIVS);
    if (salvo) {
      try {
        cacheLivrosMemoria = JSON.parse(salvo) as CatLivro[];
        return cacheLivrosMemoria.filter((l) => l.liv_publicado);
      } catch {
        // Fallback
      }
    }
  }
  return LIVROS_PADRAO.filter((l) => l.liv_publicado);
}

export interface SugestaoLivroExterno {
  fonte: 'Google Books' | 'Open Library' | 'Gutendex';
  titulo: string;
  autor: string;
  sinopse: string;
  totalPaginas: number;
  urlCapa: string | null;
  urlPdfDominioPublico?: string | null;
}

export async function listarCategoriasAtivas(incluirInativas = false): Promise<CatCategoria[]> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    let query = supabase
      .from('cat_categorias')
      .select('*')
      .order('cat_ordem_exibicao', { ascending: true });

    if (!incluirInativas) {
      query = query.eq('cat_ativo', true);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      const tipadas = data as CatCategoria[];
      cacheCategoriasMemoria = tipadas;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CHAVE_STORAGE_CATS, JSON.stringify(tipadas));
      }
      return tipadas;
    }
  }

  return incluirInativas
    ? CATEGORIAS_PADRAO
    : obterCategoriasCacheadasSincronas();
}

export async function listarLivrosCatalogo(incluirOcultos = false): Promise<CatLivro[]> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    let query = supabase
      .from('cat_livros')
      .select('*')
      .order('liv_criado_em', { ascending: false });

    if (!incluirOcultos) {
      query = query.eq('liv_publicado', true);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      const tipados = data as CatLivro[];
      cacheLivrosMemoria = tipados;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CHAVE_STORAGE_LIVS, JSON.stringify(tipados));
      }
      return tipados;
    }
  }

  return incluirOcultos ? LIVROS_PADRAO : obterLivrosCacheadosSincronos();
}

export async function salvarOuAtualizarCategoriaAdmin(
  categoria: Partial<CatCategoria> & { cat_nome: string }
): Promise<CatCategoria[]> {
  const slug =
    categoria.cat_slug ||
    categoria.cat_nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    if (categoria.cat_id) {
      await supabase
        .from('cat_categorias')
        .update({
          cat_nome: categoria.cat_nome,
          cat_slug: slug,
          cat_icone: categoria.cat_icone ?? 'BookOpen',
          cat_ordem_exibicao: categoria.cat_ordem_exibicao ?? 0,
          cat_ativo: categoria.cat_ativo ?? true,
        })
        .eq('cat_id', categoria.cat_id);
    } else {
      await supabase.from('cat_categorias').insert({
        cat_nome: categoria.cat_nome,
        cat_slug: slug,
        cat_icone: categoria.cat_icone ?? 'BookOpen',
        cat_ordem_exibicao: categoria.cat_ordem_exibicao ?? 0,
        cat_ativo: categoria.cat_ativo ?? true,
      });
    }
  }

  const atuais = await listarCategoriasAtivas(true);
  let atualizadas: CatCategoria[];

  if (categoria.cat_id) {
    atualizadas = atuais.map((c) =>
      c.cat_id === categoria.cat_id
        ? {
            ...c,
            cat_nome: categoria.cat_nome,
            cat_slug: slug,
            cat_icone: categoria.cat_icone ?? c.cat_icone,
            cat_ordem_exibicao: categoria.cat_ordem_exibicao ?? c.cat_ordem_exibicao,
            cat_ativo: categoria.cat_ativo ?? c.cat_ativo,
          }
        : c
    );
  } else {
    const nova: CatCategoria = {
      cat_id: `cat-${Date.now()}`,
      cat_nome: categoria.cat_nome,
      cat_slug: slug,
      cat_icone: categoria.cat_icone ?? 'BookOpen',
      cat_ordem_exibicao: categoria.cat_ordem_exibicao ?? atuais.length + 1,
      cat_ativo: true,
      cat_metadados: {},
      cat_criado_em: new Date().toISOString(),
    };
    atualizadas = [...atuais, nova];
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CHAVE_STORAGE_CATS, JSON.stringify(atualizadas));
    registrarEventoAuditoriaLocal({
      aud_tabela_afetada: 'cat_categorias',
      aud_acao: categoria.cat_id ? 'UPDATE' : 'INSERT',
      aud_valor_antigo: null,
      aud_valor_novo: { cat_nome: categoria.cat_nome, cat_slug: slug },
    });
  }

  return atualizadas;
}

export async function cadastrarOuAtualizarLivroAdmin(
  dadosLivro: Partial<CatLivro> & {
    liv_titulo: string;
    liv_autor: string;
    liv_total_paginas: number;
  },
  arquivoPdfOpcional?: File | null
): Promise<CatLivro[]> {
  const supabase = obterClienteSupabaseNavegador();
  let urlPdfFinal = dadosLivro.liv_url_pdf || `demo://${Date.now()}`;
  let tamanhoBytes = dadosLivro.liv_tamanho_bytes ?? null;

  if (arquivoPdfOpcional && supabase) {
    const nomeSeguro = `${Date.now()}-${arquivoPdfOpcional.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('acervo-pdfs')
      .upload(nomeSeguro, arquivoPdfOpcional, { upsert: true });

    if (!uploadErr && uploadData) {
      const { data: pubUrl } = supabase.storage
        .from('acervo-pdfs')
        .getPublicUrl(uploadData.path);
      urlPdfFinal = pubUrl.publicUrl;
      tamanhoBytes = arquivoPdfOpcional.size;
    }
  }

  if (supabase) {
    if (dadosLivro.liv_id) {
      await supabase
        .from('cat_livros')
        .update({
          liv_cat_id: dadosLivro.liv_cat_id ?? null,
          liv_titulo: dadosLivro.liv_titulo,
          liv_autor: dadosLivro.liv_autor,
          liv_sinopse: dadosLivro.liv_sinopse ?? null,
          liv_url_capa: dadosLivro.liv_url_capa ?? null,
          liv_url_pdf: urlPdfFinal,
          liv_tamanho_bytes: tamanhoBytes,
          liv_total_paginas: dadosLivro.liv_total_paginas,
          liv_destaque_professora: dadosLivro.liv_destaque_professora ?? false,
          liv_leitura_rapida: dadosLivro.liv_leitura_rapida ?? false,
          liv_publicado: dadosLivro.liv_publicado ?? true,
        })
        .eq('liv_id', dadosLivro.liv_id);
    } else {
      await supabase.from('cat_livros').insert({
        liv_cat_id: dadosLivro.liv_cat_id ?? null,
        liv_titulo: dadosLivro.liv_titulo,
        liv_autor: dadosLivro.liv_autor,
        liv_sinopse: dadosLivro.liv_sinopse ?? null,
        liv_url_capa: dadosLivro.liv_url_capa ?? null,
        liv_url_pdf: urlPdfFinal,
        liv_tamanho_bytes: tamanhoBytes,
        liv_total_paginas: dadosLivro.liv_total_paginas,
        liv_destaque_professora: dadosLivro.liv_destaque_professora ?? false,
        liv_leitura_rapida: dadosLivro.liv_leitura_rapida ?? false,
        liv_publicado: dadosLivro.liv_publicado ?? true,
      });
    }
  }

  const atuais = await listarLivrosCatalogo(true);
  const novoId = dadosLivro.liv_id || `liv-${Date.now()}`;

  const registroLivro: CatLivro = {
    liv_id: novoId,
    liv_cat_id: dadosLivro.liv_cat_id ?? CATEGORIAS_PADRAO[0].cat_id,
    liv_titulo: dadosLivro.liv_titulo,
    liv_autor: dadosLivro.liv_autor,
    liv_sinopse: dadosLivro.liv_sinopse ?? '',
    liv_url_capa: dadosLivro.liv_url_capa ?? null,
    liv_url_pdf: urlPdfFinal,
    liv_tamanho_bytes: tamanhoBytes ?? arquivoPdfOpcional?.size ?? 250000,
    liv_total_paginas: Math.max(1, dadosLivro.liv_total_paginas),
    liv_destaque_professora: dadosLivro.liv_destaque_professora ?? false,
    liv_leitura_rapida: dadosLivro.liv_leitura_rapida ?? false,
    liv_publicado: dadosLivro.liv_publicado ?? true,
    liv_cadastrado_por: null,
    liv_metadados: dadosLivro.liv_metadados ?? {},
    liv_criado_em: new Date().toISOString(),
  };

  // Se o Admin enviou o binário PDF localmente, também já coloca no cache IndexedDB
  if (arquivoPdfOpcional && typeof window !== 'undefined') {
    const buffer = await arquivoPdfOpcional.arrayBuffer();
    await salvarPdfNoIndexedDB({
      chave: `pub:${novoId}`,
      origem: 'catalogo_publico',
      titulo: registroLivro.liv_titulo,
      autor: registroLivro.liv_autor,
      tamanho_bytes: arquivoPdfOpcional.size,
      total_paginas: registroLivro.liv_total_paginas,
      binario: buffer,
      capa_webp_data_url: registroLivro.liv_url_capa,
      salvo_em: new Date().toISOString(),
    });
  }

  const atualizados = dadosLivro.liv_id
    ? atuais.map((l) => (l.liv_id === dadosLivro.liv_id ? registroLivro : l))
    : [registroLivro, ...atuais];

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CHAVE_STORAGE_LIVS, JSON.stringify(atualizados));
    registrarEventoAuditoriaLocal({
      aud_tabela_afetada: 'cat_livros',
      aud_acao: dadosLivro.liv_id ? 'UPDATE' : 'INSERT',
      aud_valor_antigo: null,
      aud_valor_novo: {
        liv_titulo: registroLivro.liv_titulo,
        liv_autor: registroLivro.liv_autor,
        liv_destaque_professora: registroLivro.liv_destaque_professora,
      },
    });
  }

  return atualizados;
}

/**
 * RN02.1: Obtém o binário PDF de um livro público priorizando o IndexedDB local
 * (leitura offline instantânea e custo zero de tráfego repetido).
 */
export async function obterOuBaixarBinarioLivroPublico(livro: CatLivro): Promise<ArrayBuffer> {
  const chaveCache = `pub:${livro.liv_id}`;
  const emCache = await obterPdfDoIndexedDB(chaveCache);
  if (emCache && emCache.binario.byteLength > 0) {
    return emCache.binario;
  }

  let buffer: ArrayBuffer;

  if (livro.liv_url_pdf.startsWith('http')) {
    try {
      const resp = await fetch(livro.liv_url_pdf);
      if (resp.ok) {
        buffer = await resp.arrayBuffer();
      } else {
        buffer = gerarPdfLiterarioDemo(
          livro.liv_titulo,
          livro.liv_autor,
          livro.liv_total_paginas
        );
      }
    } catch {
      buffer = gerarPdfLiterarioDemo(
        livro.liv_titulo,
        livro.liv_autor,
        livro.liv_total_paginas
      );
    }
  } else {
    buffer = gerarPdfLiterarioDemo(
      livro.liv_titulo,
      livro.liv_autor,
      livro.liv_total_paginas
    );
  }

  await salvarPdfNoIndexedDB({
    chave: chaveCache,
    origem: 'catalogo_publico',
    titulo: livro.liv_titulo,
    autor: livro.liv_autor,
    tamanho_bytes: buffer.byteLength,
    total_paginas: livro.liv_total_paginas,
    binario: buffer,
    capa_webp_data_url: livro.liv_url_capa,
    salvo_em: new Date().toISOString(),
  });

  return buffer;
}

/**
 * RN07.1: Auto-Fill no Painel Admin consultando Google Books API, Open Library API e Gutendex API
 */
export async function buscarMetadadosLivroExterno(
  termoBusca: string
): Promise<SugestaoLivroExterno[]> {
  const termo = termoBusca.trim();
  if (!termo) return [];

  const resultados: SugestaoLivroExterno[] = [];

  // 1. Consulta Google Books API
  try {
    const respGoogle = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(termo)}&maxResults=4`
    );
    if (respGoogle.ok) {
      const json = (await respGoogle.json()) as {
        items?: Array<{
          volumeInfo?: {
            title?: string;
            authors?: string[];
            description?: string;
            pageCount?: number;
            imageLinks?: { thumbnail?: string; smallThumbnail?: string };
          };
        }>;
      };

      for (const item of json.items ?? []) {
        const info = item.volumeInfo;
        if (!info?.title) continue;
        const capaCrua = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || null;
        resultados.push({
          fonte: 'Google Books',
          titulo: info.title,
          autor: info.authors?.join(', ') || 'Autor Desconhecido',
          sinopse: info.description || 'Obra catalogada via Google Books.',
          totalPaginas: info.pageCount && info.pageCount > 0 ? info.pageCount : 80,
          urlCapa: capaCrua ? capaCrua.replace(/^http:\/\//i, 'https://') : null,
        });
      }
    }
  } catch {
    // Segue para Open Library / Gutendex
  }

  // 2. Consulta Gutendex API (Obras em Domínio Público em Português — Seção 1.1)
  try {
    const respGutendex = await fetch(
      `https://gutendex.com/books?languages=pt&search=${encodeURIComponent(termo)}`
    );
    if (respGutendex.ok) {
      const json = (await respGutendex.json()) as {
        results?: Array<{
          title?: string;
          authors?: Array<{ name?: string }>;
          summaries?: string[];
          formats?: Record<string, string>;
        }>;
      };

      for (const item of (json.results ?? []).slice(0, 3)) {
        if (!item.title) continue;
        const formatos = item.formats ?? {};
        const capa = formatos['image/jpeg'] || null;
        const pdfUrl = formatos['application/pdf'] || null;
        resultados.push({
          fonte: 'Gutendex',
          titulo: item.title,
          autor: item.authors?.map((a) => a.name).join('; ') || 'Domínio Público',
          sinopse:
            item.summaries?.[0] ||
            'Obra clássica em domínio público em língua portuguesa (Projeto Gutenberg / Gutendex).',
          totalPaginas: 64,
          urlCapa: capa,
          urlPdfDominioPublico: pdfUrl,
        });
      }
    }
  } catch {
    // Continua
  }

  // 3. Fallback Open Library API se necessário
  if (resultados.length === 0) {
    try {
      const respOl = await fetch(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(termo)}&limit=3`
      );
      if (respOl.ok) {
        const json = (await respOl.json()) as {
          docs?: Array<{
            title?: string;
            author_name?: string[];
            number_of_pages_median?: number;
            cover_i?: number;
          }>;
        };

        for (const doc of json.docs ?? []) {
          if (!doc.title) continue;
          resultados.push({
            fonte: 'Open Library',
            titulo: doc.title,
            autor: doc.author_name?.join(', ') || 'Autor Clássico',
            sinopse: `Edição catalogada na Open Library (${doc.title}).`,
            totalPaginas: doc.number_of_pages_median || 96,
            urlCapa: doc.cover_i
              ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
              : null,
          });
        }
      }
    } catch {
      // Sem rede
    }
  }

  return resultados;
}

