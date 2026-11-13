import {
  enfileirarPulsoOffline,
  salvarPaginaMemoriaInvisivel,
} from '@/infra/indexeddb/banco-local';
import { obterClienteSupabaseNavegador } from '@/infra/supabase/cliente-navegador';
import {
  CAMPEOES_SEMANAIS_DEMO,
  CONQUISTAS_PADRAO,
  MURAL_CONSTANCIA_DEMO,
  NIVEIS_PADRAO,
  PERFIL_PADRAO_DEMO,
  RANKING_SEMANAL_DEMO,
} from '@/infra/supabase/dados-demonstracao';
import type {
  GamCampeaoSemanal,
  GamConquista,
  GamNivel,
  ItemMuralConstancia,
  ItemRankingSemanal,
  ResultadoPulsoLeitura,
} from '@/infra/supabase/tipos-banco';
import {
  obterParametrosMotorCalibrados,
  registrarEventoAuditoriaLocal,
} from '@/modulos/sis/servico-sistema';
import {
  atualizarPaginaItemEstanteLocal,
  obterItemBibliotecaPorId,
  obterPerfilUsuarioAtual,
  salvarPerfilLocalmente,
} from '@/modulos/usr/servico-usuario';

const CHAVE_STORAGE_SEGUNDOS_HOJE = 'livion:gam_segundos_hoje:';
const CHAVE_STORAGE_COOLDOWN_PAGINA = 'livion:gam_vpg_24h';
const CHAVE_STORAGE_NIVEIS = 'livion:gam_niveis';
const CHAVE_STORAGE_CONQUISTAS = 'livion:gam_conquistas';

function obterDataBrtHoje(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function obterSegundosLidosHojeLocal(): number {
  if (typeof window === 'undefined') return 0;
  const hoje = obterDataBrtHoje();
  const salvo = window.localStorage.getItem(
    `${CHAVE_STORAGE_SEGUNDOS_HOJE}${hoje}`
  );
  if (!salvo) return 0;
  const num = parseInt(salvo, 10);
  return Number.isNaN(num) ? 0 : num;
}

/**
 * Busca a soma real de `ses_segundos_ativos` do usuário autenticado na data atual (BRT)
 * diretamente na tabela `livion.gam_sessoes`.
 */
export async function obterSegundosLidosHojeUsuario(): Promise<number> {
  const supabase = obterClienteSupabaseNavegador();
  const hojeBrt = obterDataBrtHoje();

  if (supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (user) {
      const { data, error } = await supabase
        .from('gam_sessoes')
        .select('ses_segundos_ativos')
        .eq('ses_per_id', user.id)
        .eq('ses_data_referencia', hojeBrt);

      if (!error && data) {
        const total = (data as Array<{ ses_segundos_ativos: number }>).reduce(
          (acc, row) => acc + (row.ses_segundos_ativos || 0),
          0
        );
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(
            `${CHAVE_STORAGE_SEGUNDOS_HOJE}${hojeBrt}`,
            String(total)
          );
        }
        return total;
      }
    }
  }

  return obterSegundosLidosHojeLocal();
}

export function paginaEstaEmCooldown24hLocal(
  bibId: string,
  numeroPagina: number
): boolean {
  if (typeof window === 'undefined') return false;
  const salvo = window.localStorage.getItem(CHAVE_STORAGE_COOLDOWN_PAGINA);
  if (!salvo) return false;

  try {
    const mapa = JSON.parse(salvo) as Record<string, number>;
    const chave = `${bibId}:${numeroPagina}`;
    const ultimoTimestamp = mapa[chave];
    if (!ultimoTimestamp) return false;
    return Date.now() - ultimoTimestamp < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function registrarValidacaoPaginaCooldownLocal(
  bibId: string,
  paginas: number[]
): { aceitas: number; totalValidadasLivro: number } {
  if (typeof window === 'undefined') {
    return { aceitas: paginas.length, totalValidadasLivro: paginas.length };
  }

  let mapa: Record<string, number> = {};
  const salvo = window.localStorage.getItem(CHAVE_STORAGE_COOLDOWN_PAGINA);
  if (salvo) {
    try {
      mapa = JSON.parse(salvo) as Record<string, number>;
    } catch {
      mapa = {};
    }
  }

  const agora = Date.now();
  let aceitas = 0;

  for (const pag of Array.from(new Set(paginas)).slice(0, 12)) {
    const chave = `${bibId}:${pag}`;
    const anterior = mapa[chave];
    if (!anterior || agora - anterior >= 24 * 60 * 60 * 1000) {
      mapa[chave] = agora;
      aceitas += 1;
    }
  }

  window.localStorage.setItem(
    CHAVE_STORAGE_COOLDOWN_PAGINA,
    JSON.stringify(mapa)
  );

  const totalValidadasLivro = Object.keys(mapa).filter((k) =>
    k.startsWith(`${bibId}:`)
  ).length;

  return { aceitas, totalValidadasLivro };
}

/**
 * RN04, RN05 & Seção 4.2: Envia o pulso de sincronização ao banco via
 * `livion.rpc_gam_registrar_pulso_leitura`.
 */
export async function registrarPulsoLeituraAtiva(params: {
  bibId: string;
  segundosAtivos: number;
  paginaAtual: number;
  paginasValidadas: number[];
}): Promise<ResultadoPulsoLeitura> {
  const { bibId, segundosAtivos, paginaAtual, paginasValidadas } = params;

  // Atualiza memória invisível instantaneamente (RN03.1)
  salvarPaginaMemoriaInvisivel(bibId, paginaAtual);
  await atualizarPaginaItemEstanteLocal(bibId, paginaAtual);

  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc(
        'rpc_gam_registrar_pulso_leitura',
        {
          p_bib_id: bibId,
          p_segundos_ativos: segundosAtivos,
          p_pagina_atual: paginaAtual,
          p_paginas_validadas: paginasValidadas,
        }
      );

      if (!error && data) {
        const res = data as ResultadoPulsoLeitura;
        if (typeof window !== 'undefined') {
          const hojeBrt = obterDataBrtHoje();
          window.localStorage.setItem(
            `${CHAVE_STORAGE_SEGUNDOS_HOJE}${hojeBrt}`,
            String(res.segundos_hoje)
          );
        }
        registrarValidacaoPaginaCooldownLocal(bibId, paginasValidadas);
        return res;
      }

      if (error) {
        throw new Error(error.message);
      }
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes('TRAVA_ANTI_FRAUDE_TEMPO')
      ) {
        throw err;
      }
      // Se estiver offline, enfileira pulso no IndexedDB
      await enfileirarPulsoOffline({
        id: `pulso-${Date.now()}`,
        bib_id: bibId,
        segundos_ativos: segundosAtivos,
        pagina_atual: paginaAtual,
        paginas_validadas: paginasValidadas,
        criado_em: new Date().toISOString(),
      });
    }
  }

  // Fallback quando offline
  const [perfilBruto, cfg, itemBib, niveis] = await Promise.all([
    obterPerfilUsuarioAtual(),
    obterParametrosMotorCalibrados(),
    obterItemBibliotecaPorId(bibId),
    listarNiveisPatente(),
  ]);
  const perfil = perfilBruto ?? PERFIL_PADRAO_DEMO;

  const { aceitas, totalValidadasLivro } =
    registrarValidacaoPaginaCooldownLocal(bibId, paginasValidadas);

  const hojeBrt = obterDataBrtHoje();
  const segundosAntes = obterSegundosLidosHojeLocal();
  const segundosHoje = segundosAntes + segundosAtivos;

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      `${CHAVE_STORAGE_SEGUNDOS_HOJE}${hojeBrt}`,
      String(segundosHoje)
    );
  }

  const metaSegundos = perfil.per_meta_diaria_minutos * 60;
  let novaOfensiva = perfil.per_ofensiva_atual;
  let maiorOfensiva = perfil.per_maior_ofensiva;
  let novosEscudos = perfil.per_escudos_ofensiva;
  let novoContadorEscudo = perfil.per_contador_dias_escudo;
  let novaDataMeta = perfil.per_data_ultima_meta;
  let bateuMetaNestePulso = false;
  let ganhouEscudoNestePulso = false;

  if (
    segundosHoje >= metaSegundos &&
    (!perfil.per_data_ultima_meta || perfil.per_data_ultima_meta < hojeBrt)
  ) {
    bateuMetaNestePulso = true;
    novaDataMeta = hojeBrt;
    novaOfensiva += 1;
    maiorOfensiva = Math.max(maiorOfensiva, novaOfensiva);
    novoContadorEscudo += 1;

    if (novoContadorEscudo >= 7) {
      novoContadorEscudo = 0;
      if (novosEscudos < 2) {
        novosEscudos += 1;
        ganhouEscudoNestePulso = true;
      }
    }
  }

  const multiplicador =
    novaOfensiva >= 7 ? 1.5 : novaOfensiva >= 3 ? 1.2 : 1.0;

  const xpBase =
    (segundosAtivos / 60) * cfg.xp_por_minuto_ativo +
    aceitas * cfg.xp_por_pagina_validada;
  let xpGanhoPulso = Math.max(1, Math.round(xpBase * multiplicador));

  let xpBonusLivro = 0;
  let statusLivro = itemBib?.bib_status ?? 'lendo';

  if (
    itemBib &&
    itemBib.bib_total_paginas >= 30 &&
    !itemBib.bib_bonus_conclusao_resgatado &&
    totalValidadasLivro / itemBib.bib_total_paginas >= 0.9
  ) {
    xpBonusLivro = cfg.xp_bonus_livro_concluido;
    xpGanhoPulso += xpBonusLivro;
    statusLivro = 'concluido';
  }

  const novoXpTotal = perfil.per_xp_total + xpGanhoPulso;
  const nivelCalculado =
    niveis
      .filter((n) => n.niv_xp_minimo <= novoXpTotal)
      .reduce((max, n) => Math.max(max, n.niv_numero), 1) || 1;

  const subiuNivel = nivelCalculado > perfil.per_niv_numero;

  const perfilAtualizado = {
    ...perfil,
    per_xp_total: novoXpTotal,
    per_niv_numero: nivelCalculado,
    per_ofensiva_atual: novaOfensiva,
    per_maior_ofensiva: maiorOfensiva,
    per_escudos_ofensiva: novosEscudos,
    per_contador_dias_escudo: novoContadorEscudo,
    per_data_ultima_meta: novaDataMeta,
    per_ultimo_pulso_em: new Date().toISOString(),
  };

  salvarPerfilLocalmente(perfilAtualizado);

  return {
    sucesso: true,
    xp_ganho_pulso: xpGanhoPulso,
    xp_bonus_livro: xpBonusLivro,
    xp_bonus_conquistas: 0,
    xp_total_atualizado: novoXpTotal,
    multiplicador_aplicado: multiplicador,
    paginas_validadas_aceitas: aceitas,
    total_paginas_validadas_livro: totalValidadasLivro,
    segundos_hoje: segundosHoje,
    meta_segundos_diaria: metaSegundos,
    bateu_meta_hoje: segundosHoje >= metaSegundos,
    bateu_meta_neste_pulso: bateuMetaNestePulso,
    ofensiva_atual: novaOfensiva,
    escudos_ofensiva: novosEscudos,
    contador_dias_escudo: novoContadorEscudo,
    ganhou_escudo_neste_pulso: ganhouEscudoNestePulso,
    nivel_atual: nivelCalculado,
    subiu_nivel: subiuNivel,
    conquistas_desbloqueadas: [],
    status_livro: statusLivro,
  };
}

/**
 * RN06.1: Aba 1 — Liga da Semana (Competição por XP Semanal no schema `livion`)
 */
export async function obterRankingLigaDaSemana(): Promise<ItemRankingSemanal[]> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data, error } = await supabase.rpc('rpc_gam_obter_ranking_semanal', {
      p_limite: 50,
    });
    if (!error && data) {
      return data as ItemRankingSemanal[];
    }
    return [];
  }

  return RANKING_SEMANAL_DEMO;
}

/**
 * RN06.2: Aba 2 — Mural de Constância (Competição por Hábito no schema `livion`)
 */
export async function obterMuralDeConstancia(): Promise<ItemMuralConstancia[]> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data, error } = await supabase.rpc(
      'rpc_gam_obter_mural_constancia',
      {
        p_limite: 50,
      }
    );
    if (!error && data) {
      return data as ItemMuralConstancia[];
    }
    return [];
  }

  return MURAL_CONSTANCIA_DEMO;
}

export async function listarCampeoesSemanaisPodio(): Promise<
  GamCampeaoSemanal[]
> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data, error } = await supabase
      .from('gam_campeoes_semanais')
      .select('*, usr_perfis(per_apelido, per_nome_exibicao, per_url_avatar)')
      .order('cam_data_inicio_semana', { ascending: false })
      .order('cam_posicao_podio', { ascending: true })
      .limit(3);

    if (!error && data) {
      return data as GamCampeaoSemanal[];
    }
    return [];
  }

  return CAMPEOES_SEMANAIS_DEMO;
}

let cacheNiveisMemoria: GamNivel[] | null = null;

export function obterNiveisCacheadosSincronos(): GamNivel[] {
  if (cacheNiveisMemoria) return cacheNiveisMemoria;
  if (typeof window !== 'undefined') {
    const salvo = window.localStorage.getItem(CHAVE_STORAGE_NIVEIS);
    if (salvo) {
      try {
        cacheNiveisMemoria = JSON.parse(salvo) as GamNivel[];
        return cacheNiveisMemoria;
      } catch {
        // Fallback
      }
    }
  }
  return NIVEIS_PADRAO;
}

export async function listarNiveisPatente(): Promise<GamNivel[]> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data, error } = await supabase
      .from('gam_niveis')
      .select('*')
      .order('niv_numero', { ascending: true });

    if (!error && data && data.length > 0) {
      const tipados = data as GamNivel[];
      cacheNiveisMemoria = tipados;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          CHAVE_STORAGE_NIVEIS,
          JSON.stringify(tipados)
        );
      }
      return tipados;
    }
  }

  return obterNiveisCacheadosSincronos();
}

export async function salvarNivelPatenteAdmin(
  nivel: GamNivel
): Promise<GamNivel[]> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    await supabase
      .from('gam_niveis')
      .upsert(nivel, { onConflict: 'niv_numero' });
  }

  const atuais = await listarNiveisPatente();
  const existe = atuais.some((n) => n.niv_numero === nivel.niv_numero);
  const atualizados = existe
    ? atuais.map((n) => (n.niv_numero === nivel.niv_numero ? nivel : n))
    : [...atuais, nivel].sort((a, b) => a.niv_numero - b.niv_numero);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      CHAVE_STORAGE_NIVEIS,
      JSON.stringify(atualizados)
    );
    registrarEventoAuditoriaLocal({
      aud_tabela_afetada: 'gam_niveis',
      aud_acao: existe ? 'UPDATE' : 'INSERT',
      aud_valor_antigo: null,
      aud_valor_novo: { ...nivel },
    });
  }

  return atualizados;
}

export async function listarConquistasAdmin(): Promise<GamConquista[]> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data, error } = await supabase
      .from('gam_conquistas')
      .select('*')
      .order('con_recompensa_xp', { ascending: true });

    if (!error && data && data.length > 0) {
      return data as GamConquista[];
    }
  }

  if (typeof window !== 'undefined') {
    const salvo = window.localStorage.getItem(CHAVE_STORAGE_CONQUISTAS);
    if (salvo) {
      try {
        return JSON.parse(salvo) as GamConquista[];
      } catch {
        // Fallback
      }
    }
  }

  return CONQUISTAS_PADRAO;
}

export async function salvarConquistaAdmin(
  conquista: Partial<GamConquista> & {
    con_codigo: string;
    con_titulo: string;
    con_descricao: string;
  }
): Promise<GamConquista[]> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    await supabase.from('gam_conquistas').upsert(
      {
        con_codigo: conquista.con_codigo.toUpperCase().trim(),
        con_titulo: conquista.con_titulo,
        con_descricao: conquista.con_descricao,
        con_icone: conquista.con_icone ?? 'Trophy',
        con_regra_gatilho: conquista.con_regra_gatilho ?? { tipo: 'custom' },
        con_recompensa_xp: conquista.con_recompensa_xp ?? 50,
        con_ativo: conquista.con_ativo ?? true,
      },
      { onConflict: 'con_codigo' }
    );
  }

  const atuais = await listarConquistasAdmin();
  const codigoFormatado = conquista.con_codigo.toUpperCase().trim();
  const existente = atuais.find((c) => c.con_codigo === codigoFormatado);

  const registro: GamConquista = {
    con_id: existente?.con_id ?? `con-${Date.now()}`,
    con_codigo: codigoFormatado,
    con_titulo: conquista.con_titulo,
    con_descricao: conquista.con_descricao,
    con_icone: conquista.con_icone ?? 'Trophy',
    con_regra_gatilho: conquista.con_regra_gatilho ?? { tipo: 'custom' },
    con_recompensa_xp: conquista.con_recompensa_xp ?? 50,
    con_ativo: conquista.con_ativo ?? true,
  };

  const atualizados = existente
    ? atuais.map((c) => (c.con_codigo === codigoFormatado ? registro : c))
    : [...atuais, registro];

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(
      CHAVE_STORAGE_CONQUISTAS,
      JSON.stringify(atualizados)
    );
    registrarEventoAuditoriaLocal({
      aud_tabela_afetada: 'gam_conquistas',
      aud_acao: existente ? 'UPDATE' : 'INSERT',
      aud_valor_antigo: null,
      aud_valor_novo: {
        con_codigo: codigoFormatado,
        con_titulo: registro.con_titulo,
      },
    });
  }

  return atualizados;
}
