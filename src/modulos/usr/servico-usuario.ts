import {
  lerPaginaMemoriaInvisivel,
  obterCapaLocalWebP,
  salvarPaginaMemoriaInvisivel,
  salvarPdfNoIndexedDB,
} from '@/infra/indexeddb/banco-local';
import { extrairMetadadosECapaPdfLocal } from '@/infra/pdf-worker/processador-pdf';
import { obterClienteSupabaseNavegador } from '@/infra/supabase/cliente-navegador';
import {
  BIBLIOTECA_PADRAO_DEMO,
  CONQUISTAS_PADRAO,
  LIVROS_PADRAO,
  PERFIL_PADRAO_DEMO,
} from '@/infra/supabase/dados-demonstracao';
import type {
  CatLivro,
  GamConquista,
  UsrBiblioteca,
  UsrConquista,
  UsrPerfil,
} from '@/infra/supabase/tipos-banco';

const CHAVE_STORAGE_PERFIL = 'livion:usr_perfil';
const CHAVE_STORAGE_BIBLIOTECA = 'livion:usr_biblioteca';

// Cache de sessão em memória (Stale-While-Revalidate) para navegação instantânea
let cachePerfilMemoria: UsrPerfil | null = null;
let cacheBibliotecaMemoria: UsrBiblioteca[] | null = null;

export function obterPerfilCacheadoSincrono(): UsrPerfil | null {
  if (cachePerfilMemoria) return cachePerfilMemoria;
  if (typeof window !== 'undefined') {
    const salvo = window.localStorage.getItem(CHAVE_STORAGE_PERFIL);
    if (salvo) {
      try {
        cachePerfilMemoria = JSON.parse(salvo) as UsrPerfil;
        return cachePerfilMemoria;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function obterEstanteCacheadaSincrona(): UsrBiblioteca[] | null {
  if (cacheBibliotecaMemoria) return cacheBibliotecaMemoria;
  if (typeof window !== 'undefined') {
    const salvo = window.localStorage.getItem(CHAVE_STORAGE_BIBLIOTECA);
    if (salvo) {
      try {
        cacheBibliotecaMemoria = JSON.parse(salvo) as UsrBiblioteca[];
        return cacheBibliotecaMemoria;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function atualizarCachePerfil(perfil: UsrPerfil): UsrPerfil {
  cachePerfilMemoria = perfil;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CHAVE_STORAGE_PERFIL, JSON.stringify(perfil));
    window.dispatchEvent(
      new CustomEvent<UsrPerfil>('livion:perfil-atualizado', { detail: perfil })
    );
  }
  return perfil;
}

/**
 * Obtém exclusivamente o perfil real do usuário autenticado no Supabase (livion.usr_perfis).
 * Caso o usuário tenha acabado de autenticar via Google/E-mail e o registro ainda não exista,
 * sincroniza os metadados do provedor OAuth (nome e avatar) com livion.usr_perfis.
 */
export async function obterPerfilUsuarioAtual(): Promise<UsrPerfil | null> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      cachePerfilMemoria = null;
      return null;
    }

    const { data: perfilDb } = await supabase
      .from('usr_perfis')
      .select('*')
      .eq('per_id', user.id)
      .maybeSingle();

    const meta = user.user_metadata ?? {};
    const nomeProvedor =
      (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
      (typeof meta.name === 'string' && meta.name.trim()) ||
      user.email?.split('@')[0] ||
      'Leitor Livion';
    const avatarProvedor =
      (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) ||
      (typeof meta.picture === 'string' && meta.picture.trim()) ||
      null;

    if (perfilDb) {
      const perfilTipado = perfilDb as UsrPerfil;
      if (!perfilTipado.per_url_avatar && avatarProvedor) {
        await supabase
          .from('usr_perfis')
          .update({ per_url_avatar: avatarProvedor })
          .eq('per_id', user.id);
        perfilTipado.per_url_avatar = avatarProvedor;
      }
      return atualizarCachePerfil(perfilTipado);
    }

    const novoPerfilInicial: Partial<UsrPerfil> = {
      per_id: user.id,
      per_nome_exibicao: nomeProvedor.slice(0, 80),
      per_url_avatar: avatarProvedor,
      per_papel: 'leitor',
      per_meta_diaria_minutos: 15,
      per_niv_numero: 1,
    };

    const { data: inserido } = await supabase
      .from('usr_perfis')
      .upsert(novoPerfilInicial, { onConflict: 'per_id' })
      .select('*')
      .maybeSingle();

    if (inserido) {
      return atualizarCachePerfil(inserido as UsrPerfil);
    }

    return atualizarCachePerfil({
      per_id: user.id,
      per_apelido: null,
      per_nome_exibicao: nomeProvedor.slice(0, 80),
      per_url_avatar: avatarProvedor,
      per_papel: 'leitor',
      per_meta_diaria_minutos: 15,
      per_xp_total: 0,
      per_niv_numero: 1,
      per_ofensiva_atual: 0,
      per_maior_ofensiva: 0,
      per_escudos_ofensiva: 0,
      per_contador_dias_escudo: 0,
      per_data_ultima_meta: null,
      per_ultimo_pulso_em: null,
      per_banido: false,
      per_metadados: {},
      per_criado_em: new Date().toISOString(),
    });
  }

  const salvo = obterPerfilCacheadoSincrono();
  if (salvo) return salvo;

  return PERFIL_PADRAO_DEMO;
}

export async function encerrarSessaoUsuario(): Promise<void> {
  cachePerfilMemoria = null;
  cacheBibliotecaMemoria = null;
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    await supabase.auth.signOut();
  }
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(CHAVE_STORAGE_PERFIL);
    window.localStorage.removeItem(CHAVE_STORAGE_BIBLIOTECA);
  }
}

export function salvarPerfilLocalmente(perfil: UsrPerfil): void {
  atualizarCachePerfil(perfil);
}

/**
 * RN01.3: Salva os dados escolhidos no Modal de Boas-Vindas (@per_apelido e meta diária 10, 15 ou 30 min)
 */
export async function concluirOnboardingPerfil(params: {
  apelido: string;
  nomeExibicao: string;
  metaDiariaMinutos: number;
}): Promise<UsrPerfil> {
  const apelidoFormatado = params.apelido
    .toLowerCase()
    .trim()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 30);

  const metaValidada = Math.min(240, Math.max(5, params.metaDiariaMinutos));
  const perfilAtual = (await obterPerfilUsuarioAtual()) ?? PERFIL_PADRAO_DEMO;

  const novosMetadados = {
    ...(perfilAtual.per_metadados ?? {}),
    onboarding_concluido: true,
  };

  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (user) {
      const { data: atualizadoDb, error } = await supabase
        .from('usr_perfis')
        .update({
          per_apelido: apelidoFormatado,
          per_nome_exibicao:
            params.nomeExibicao.trim() || perfilAtual.per_nome_exibicao,
          per_meta_diaria_minutos: metaValidada,
          per_metadados: novosMetadados,
        })
        .eq('per_id', user.id)
        .select('*')
        .single();

      if (error) {
        throw new Error(error.message);
      }

      if (atualizadoDb) {
        return atualizarCachePerfil(atualizadoDb as UsrPerfil);
      }
    }
  }

  const atualizado: UsrPerfil = {
    ...perfilAtual,
    per_apelido: apelidoFormatado,
    per_nome_exibicao:
      params.nomeExibicao.trim() || perfilAtual.per_nome_exibicao,
    per_meta_diaria_minutos: metaValidada,
    per_metadados: novosMetadados,
  };

  return atualizarCachePerfil(atualizado);
}

export async function listarEstanteHibridaUsuario(): Promise<UsrBiblioteca[]> {
  const supabase = obterClienteSupabaseNavegador();
  let listaBase: UsrBiblioteca[] = [];

  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      cacheBibliotecaMemoria = [];
      return [];
    }

    const { data, error } = await supabase
      .from('usr_biblioteca')
      .select('*, cat_livros(*)')
      .eq('bib_per_id', user.id)
      .order('bib_ultima_leitura_em', { ascending: false });

    if (!error && data) {
      listaBase = data as UsrBiblioteca[];
    }
  } else if (typeof window !== 'undefined') {
    const salvo = window.localStorage.getItem(CHAVE_STORAGE_BIBLIOTECA);
    if (salvo) {
      try {
        listaBase = JSON.parse(salvo) as UsrBiblioteca[];
      } catch {
        listaBase = BIBLIOTECA_PADRAO_DEMO;
      }
    } else {
      listaBase = BIBLIOTECA_PADRAO_DEMO;
    }
  }

  // Enriquecer com Memória Invisível (localStorage) e Capas WebP locais (IndexedDB)
  const enriquecida: UsrBiblioteca[] = [];
  for (const item of listaBase) {
    const paginaSincronizada = lerPaginaMemoriaInvisivel(
      item.bib_id,
      item.bib_pagina_atual,
      item.bib_hash_arquivo_local
    );

    let metadados = { ...(item.bib_metadados ?? {}) };
    if (item.bib_arquivo_local && item.bib_hash_arquivo_local) {
      const capaLocal = await obterCapaLocalWebP(
        `local:${item.bib_hash_arquivo_local}`
      );
      if (capaLocal) {
        metadados = { ...metadados, capa_local_webp: capaLocal };
      }
    }

    const livroCatalogo =
      item.cat_livros ||
      (item.bib_liv_id
        ? LIVROS_PADRAO.find((l) => l.liv_id === item.bib_liv_id) ?? null
        : null);

    enriquecida.push({
      ...item,
      bib_pagina_atual: Math.min(paginaSincronizada, item.bib_total_paginas),
      bib_metadados: metadados,
      cat_livros: livroCatalogo,
    });
  }

  cacheBibliotecaMemoria = enriquecida;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        CHAVE_STORAGE_BIBLIOTECA,
        JSON.stringify(enriquecida)
      );
    } catch {
      // Ignora caso estoure quota de localStorage
    }
  }

  return enriquecida;
}

export async function obterItemBibliotecaPorId(
  bibId: string
): Promise<UsrBiblioteca | null> {
  const estante = await listarEstanteHibridaUsuario();
  return estante.find((item) => item.bib_id === bibId) ?? null;
}

/**
 * Adiciona um livro do catálogo público (livion.cat_livros) à estante do usuário (livion.usr_biblioteca)
 * ou retorna o registro existente se já estiver na estante.
 */
export async function adicionarLivroPublicoNaEstante(
  livro: CatLivro
): Promise<UsrBiblioteca> {
  const estanteAtual = await listarEstanteHibridaUsuario();
  const existente = estanteAtual.find((b) => b.bib_liv_id === livro.liv_id);
  if (existente) {
    return existente;
  }

  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      const { data, error } = await supabase
        .from('usr_biblioteca')
        .upsert(
          {
            bib_per_id: authData.user.id,
            bib_liv_id: livro.liv_id,
            bib_arquivo_local: false,
            bib_pagina_atual: 1,
            bib_total_paginas: livro.liv_total_paginas,
            bib_status: 'lendo',
          },
          { onConflict: 'bib_per_id,bib_liv_id' }
        )
        .select('*, cat_livros(*)')
        .single();

      if (!error && data) {
        return data as UsrBiblioteca;
      }
    }
  }

  const perfil = (await obterPerfilUsuarioAtual()) ?? PERFIL_PADRAO_DEMO;
  const novoItem: UsrBiblioteca = {
    bib_id: `bib-pub-${Date.now()}`,
    bib_per_id: perfil.per_id,
    bib_liv_id: livro.liv_id,
    bib_arquivo_local: false,
    bib_hash_arquivo_local: null,
    bib_titulo_customizado: null,
    bib_autor_customizado: null,
    bib_pagina_atual: 1,
    bib_total_paginas: livro.liv_total_paginas,
    bib_status: 'lendo',
    bib_bonus_conclusao_resgatado: false,
    bib_ultima_leitura_em: new Date().toISOString(),
    bib_metadados: {},
    cat_livros: livro,
  };

  const novaEstante = [novoItem, ...estanteAtual];
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      CHAVE_STORAGE_BIBLIOTECA,
      JSON.stringify(novaEstante)
    );
  }

  return novoItem;
}

/**
 * RN02.2: Importação Local pelo Leitor (bib_arquivo_local = true)
 */
export async function importarLivroPdfLocalParaEstante(arquivo: File): Promise<{
  itemBiblioteca: UsrBiblioteca;
  retomadoDeOutroDispositivo: boolean;
}> {
  const { buffer, metadados } = await extrairMetadadosECapaPdfLocal(arquivo);
  const chaveLocal = `local:${metadados.hashSha256}`;

  // 1. Salva o binário PDF e a capa WebP exclusivamente no IndexedDB do dispositivo
  await salvarPdfNoIndexedDB({
    chave: chaveLocal,
    origem: 'arquivo_local',
    titulo: metadados.tituloDetectado,
    autor: metadados.autorDetectado,
    tamanho_bytes: metadados.tamanhoBytes,
    total_paginas: metadados.totalPaginas,
    binario: buffer,
    capa_webp_data_url: metadados.capaWebpDataUrl,
    salvo_em: new Date().toISOString(),
  });

  const estanteAtual = await listarEstanteHibridaUsuario();
  const existentePorHash = estanteAtual.find(
    (b) => b.bib_hash_arquivo_local === metadados.hashSha256
  );

  if (existentePorHash) {
    salvarPaginaMemoriaInvisivel(
      existentePorHash.bib_id,
      existentePorHash.bib_pagina_atual,
      metadados.hashSha256
    );
    return {
      itemBiblioteca: {
        ...existentePorHash,
        bib_metadados: {
          ...existentePorHash.bib_metadados,
          capa_local_webp: metadados.capaWebpDataUrl,
        },
      },
      retomadoDeOutroDispositivo: true,
    };
  }

  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user) {
      const { data: jaNoBanco } = await supabase
        .from('usr_biblioteca')
        .select('*')
        .eq('bib_per_id', authData.user.id)
        .eq('bib_hash_arquivo_local', metadados.hashSha256)
        .maybeSingle();

      if (jaNoBanco) {
        const itemExistente = jaNoBanco as UsrBiblioteca;
        salvarPaginaMemoriaInvisivel(
          itemExistente.bib_id,
          itemExistente.bib_pagina_atual,
          metadados.hashSha256
        );
        return {
          itemBiblioteca: {
            ...itemExistente,
            bib_metadados: {
              ...(itemExistente.bib_metadados ?? {}),
              capa_local_webp: metadados.capaWebpDataUrl,
            },
          },
          retomadoDeOutroDispositivo: true,
        };
      }

      const { data: criadoDb, error } = await supabase
        .from('usr_biblioteca')
        .insert({
          bib_per_id: authData.user.id,
          bib_arquivo_local: true,
          bib_hash_arquivo_local: metadados.hashSha256,
          bib_titulo_customizado: metadados.tituloDetectado,
          bib_autor_customizado: metadados.autorDetectado,
          bib_pagina_atual: 1,
          bib_total_paginas: metadados.totalPaginas,
          bib_status: 'lendo',
          bib_metadados: { tamanho_bytes: metadados.tamanhoBytes },
        })
        .select('*')
        .single();

      if (!error && criadoDb) {
        return {
          itemBiblioteca: {
            ...(criadoDb as UsrBiblioteca),
            bib_metadados: {
              ...((criadoDb as UsrBiblioteca).bib_metadados ?? {}),
              capa_local_webp: metadados.capaWebpDataUrl,
            },
          },
          retomadoDeOutroDispositivo: false,
        };
      }
    }
  }

  const perfil = (await obterPerfilUsuarioAtual()) ?? PERFIL_PADRAO_DEMO;
  const novoItemLocal: UsrBiblioteca = {
    bib_id: `bib-loc-${Date.now()}`,
    bib_per_id: perfil.per_id,
    bib_liv_id: null,
    bib_arquivo_local: true,
    bib_hash_arquivo_local: metadados.hashSha256,
    bib_titulo_customizado: metadados.tituloDetectado,
    bib_autor_customizado: metadados.autorDetectado,
    bib_pagina_atual: 1,
    bib_total_paginas: metadados.totalPaginas,
    bib_status: 'lendo',
    bib_bonus_conclusao_resgatado: false,
    bib_ultima_leitura_em: new Date().toISOString(),
    bib_metadados: {
      tamanho_bytes: metadados.tamanhoBytes,
      capa_local_webp: metadados.capaWebpDataUrl,
    },
    cat_livros: null,
  };

  const novaEstante = [novoItemLocal, ...estanteAtual];
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      CHAVE_STORAGE_BIBLIOTECA,
      JSON.stringify(novaEstante)
    );
  }

  return {
    itemBiblioteca: novoItemLocal,
    retomadoDeOutroDispositivo: false,
  };
}

export async function atualizarPaginaItemEstanteLocal(
  bibId: string,
  novaPagina: number
): Promise<void> {
  const estante = await listarEstanteHibridaUsuario();
  const alvo = estante.find((b) => b.bib_id === bibId);
  if (!alvo) return;

  const paginaSegura = Math.min(Math.max(1, novaPagina), alvo.bib_total_paginas);
  salvarPaginaMemoriaInvisivel(
    bibId,
    paginaSegura,
    alvo.bib_hash_arquivo_local
  );

  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    await supabase
      .from('usr_biblioteca')
      .update({
        bib_pagina_atual: paginaSegura,
        bib_ultima_leitura_em: new Date().toISOString(),
      })
      .eq('bib_id', bibId);
  }
}

export async function listarConquistasComStatusUsuario(): Promise<
  Array<
    GamConquista & { desbloqueada: boolean; desbloqueada_em: string | null }
  >
> {
  const supabase = obterClienteSupabaseNavegador();
  let catalogo = CONQUISTAS_PADRAO;
  const desbloqueadasMap = new Map<string, string>();

  if (supabase) {
    const [{ data: conData }, { data: authData }] = await Promise.all([
      supabase.from('gam_conquistas').select('*').eq('con_ativo', true),
      supabase.auth.getUser(),
    ]);

    if (conData && conData.length > 0) {
      catalogo = conData as GamConquista[];
    }

    if (authData.user) {
      const { data: ucoData } = await supabase
        .from('usr_conquistas')
        .select('*')
        .eq('uco_per_id', authData.user.id);

      for (const u of (ucoData ?? []) as UsrConquista[]) {
        desbloqueadasMap.set(u.uco_con_id, u.uco_desbloqueada_em);
      }
    }
  }

  return catalogo.map((c) => ({
    ...c,
    desbloqueada:
      desbloqueadasMap.has(c.con_id) || desbloqueadasMap.has(c.con_codigo),
    desbloqueada_em:
      desbloqueadasMap.get(c.con_id) ??
      desbloqueadasMap.get(c.con_codigo) ??
      null,
  }));
}
