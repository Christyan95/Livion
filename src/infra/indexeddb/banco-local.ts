import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface RegistroPdfCache {
  chave: string; // 'pub:<liv_id>' ou 'local:<hash_sha256>'
  origem: 'catalogo_publico' | 'arquivo_local';
  titulo: string;
  autor: string;
  tamanho_bytes: number;
  total_paginas: number;
  binario: ArrayBuffer;
  capa_webp_data_url: string | null;
  salvo_em: string;
}

export interface PulsoOfflinePendente {
  id: string;
  bib_id: string;
  segundos_ativos: number;
  pagina_atual: number;
  paginas_validadas: number[];
  criado_em: string;
}

interface LivionOfflineDB extends DBSchema {
  livros_binarios: {
    key: string;
    value: RegistroPdfCache;
  };
  capas_locais: {
    key: string; // hash_sha256 ou bib_id
    value: {
      chave: string;
      capa_webp: string;
      atualizado_em: string;
    };
  };
  pulsos_pendentes: {
    key: string;
    value: PulsoOfflinePendente;
  };
}

const NOME_BANCO = 'livion-offline-db';
const VERSAO_BANCO = 1;
const PREFIXO_MEMORIA_PAGINA = 'livion:memoria_pagina:';

let promessaDb: Promise<IDBPDatabase<LivionOfflineDB>> | null = null;

function obterInstanciaDb(): Promise<IDBPDatabase<LivionOfflineDB>> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('IndexedDB disponível apenas no navegador.'));
  }

  if (!promessaDb) {
    promessaDb = openDB<LivionOfflineDB>(NOME_BANCO, VERSAO_BANCO, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('livros_binarios')) {
          db.createObjectStore('livros_binarios', { keyPath: 'chave' });
        }
        if (!db.objectStoreNames.contains('capas_locais')) {
          db.createObjectStore('capas_locais', { keyPath: 'chave' });
        }
        if (!db.objectStoreNames.contains('pulsos_pendentes')) {
          db.createObjectStore('pulsos_pendentes', { keyPath: 'id' });
        }
      },
    });
  }

  return promessaDb;
}

/**
 * RN02: Salva o binário PDF (público ou local) no IndexedDB do dispositivo.
 * - Livros locais jamais são enviados ao servidor.
 * - Livros públicos abertos ficam em cache para custo zero de tráfego repetido.
 */
export async function salvarPdfNoIndexedDB(registro: RegistroPdfCache): Promise<void> {
  const db = await obterInstanciaDb();
  await db.put('livros_binarios', registro);

  if (registro.capa_webp_data_url) {
    await db.put('capas_locais', {
      chave: registro.chave,
      capa_webp: registro.capa_webp_data_url,
      atualizado_em: new Date().toISOString(),
    });
  }
}

export async function obterPdfDoIndexedDB(chave: string): Promise<RegistroPdfCache | undefined> {
  if (typeof window === 'undefined') return undefined;
  const db = await obterInstanciaDb();
  return db.get('livros_binarios', chave);
}

export async function verificarPdfEmCache(chave: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const db = await obterInstanciaDb();
  const item = await db.getKey('livros_binarios', chave);
  return Boolean(item);
}

export async function obterCapaLocalWebP(chave: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const db = await obterInstanciaDb();
  const registro = await db.get('capas_locais', chave);
  return registro?.capa_webp ?? null;
}

/**
 * RN03.1: Memória Invisível Instantânea (Zero Marcadores Manuais).
 * Atualiza a página atual no localStorage no exato instante da virada de página.
 */
export function salvarPaginaMemoriaInvisivel(
  bibId: string,
  paginaAtual: number,
  hashArquivoLocal?: string | null
): void {
  if (typeof window === 'undefined') return;
  const pagSegura = Math.max(1, Math.floor(paginaAtual));
  window.localStorage.setItem(`${PREFIXO_MEMORIA_PAGINA}bib:${bibId}`, String(pagSegura));

  if (hashArquivoLocal) {
    window.localStorage.setItem(
      `${PREFIXO_MEMORIA_PAGINA}hash:${hashArquivoLocal}`,
      String(pagSegura)
    );
  }
}

export function lerPaginaMemoriaInvisivel(
  bibId: string,
  paginaBanco: number,
  hashArquivoLocal?: string | null
): number {
  if (typeof window === 'undefined') return paginaBanco;

  const salvoPorBib = window.localStorage.getItem(`${PREFIXO_MEMORIA_PAGINA}bib:${bibId}`);
  if (salvoPorBib) {
    const num = parseInt(salvoPorBib, 10);
    if (!Number.isNaN(num) && num >= 1) {
      return Math.max(num, paginaBanco);
    }
  }

  if (hashArquivoLocal) {
    const salvoPorHash = window.localStorage.getItem(
      `${PREFIXO_MEMORIA_PAGINA}hash:${hashArquivoLocal}`
    );
    if (salvoPorHash) {
      const num = parseInt(salvoPorHash, 10);
      if (!Number.isNaN(num) && num >= 1) {
        return Math.max(num, paginaBanco);
      }
    }
  }

  return Math.max(1, paginaBanco);
}

/**
 * Fila de pulsos offline para sincronização resiliente quando a internet oscilar
 */
export async function enfileirarPulsoOffline(pulso: PulsoOfflinePendente): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await obterInstanciaDb();
  await db.put('pulsos_pendentes', pulso);
}

export async function listarPulsosOfflinePendentes(): Promise<PulsoOfflinePendente[]> {
  if (typeof window === 'undefined') return [];
  const db = await obterInstanciaDb();
  return db.getAll('pulsos_pendentes');
}

export async function removerPulsoOfflinePendente(id: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await obterInstanciaDb();
  await db.delete('pulsos_pendentes', id);
}

