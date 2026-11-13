import { obterClienteSupabaseNavegador } from '@/infra/supabase/cliente-navegador';
import {
  AUDITORIA_PADRAO_DEMO,
  CONFIGURACOES_PADRAO,
  DICIONARIO_VIVO_DEMO,
} from '@/infra/supabase/dados-demonstracao';
import type {
  SisAuditoria,
  SisConfiguracao,
  SisDicionario,
} from '@/infra/supabase/tipos-banco';

const CHAVE_STORAGE_CFG = 'livion:sis_configuracoes';
const CHAVE_STORAGE_DIC = 'livion:sis_dicionario';
const CHAVE_STORAGE_AUD = 'livion:sis_auditoria';

export interface ParametrosMotorCalibrados {
  velocidade_maxima_ppm: number;
  tempo_minimo_pagina_seg: number;
  tempo_maximo_pagina_seg: number;
  tempo_limite_ociosidade_seg: number;
  intervalo_pulso_sincronizacao_seg: number;
  intervalo_minimo_pulso_seg: number;
  xp_por_minuto_ativo: number;
  xp_por_pagina_validada: number;
  xp_bonus_livro_concluido: number;
}

export async function listarConfiguracoesSistema(): Promise<SisConfiguracao[]> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data, error } = await supabase
      .from('sis_configuracoes')
      .select('*')
      .order('cfg_chave', { ascending: true });

    if (!error && data && data.length > 0) {
      return data as SisConfiguracao[];
    }
  }

  if (typeof window !== 'undefined') {
    const salvo = window.localStorage.getItem(CHAVE_STORAGE_CFG);
    if (salvo) {
      try {
        return JSON.parse(salvo) as SisConfiguracao[];
      } catch {
        // Fallback padrão
      }
    }
  }

  return CONFIGURACOES_PADRAO;
}

export async function obterParametrosMotorCalibrados(): Promise<ParametrosMotorCalibrados> {
  const lista = await listarConfiguracoesSistema();
  const mapa = new Map<string, unknown>();
  for (const item of lista) {
    mapa.set(item.cfg_chave, item.cfg_valor);
  }

  return {
    velocidade_maxima_ppm: Number(mapa.get('velocidade_maxima_ppm') ?? 350),
    tempo_minimo_pagina_seg: Number(mapa.get('tempo_minimo_pagina_seg') ?? 5),
    tempo_maximo_pagina_seg: Number(mapa.get('tempo_maximo_pagina_seg') ?? 60),
    tempo_limite_ociosidade_seg: Number(mapa.get('tempo_limite_ociosidade_seg') ?? 120),
    intervalo_pulso_sincronizacao_seg: Number(
      mapa.get('intervalo_pulso_sincronizacao_seg') ?? 60
    ),
    intervalo_minimo_pulso_seg: Number(mapa.get('intervalo_minimo_pulso_seg') ?? 45),
    xp_por_minuto_ativo: Number(mapa.get('xp_por_minuto_ativo') ?? 10),
    xp_por_pagina_validada: Number(mapa.get('xp_por_pagina_validada') ?? 5),
    xp_bonus_livro_concluido: Number(mapa.get('xp_bonus_livro_concluido') ?? 200),
  };
}

export async function atualizarConfiguracaoSistema(
  cfgChave: string,
  novoValor: number | boolean | string
): Promise<SisConfiguracao[]> {
  const supabase = obterClienteSupabaseNavegador();
  const agora = new Date().toISOString();

  if (supabase) {
    const { data: userResp } = await supabase.auth.getUser();
    await supabase
      .from('sis_configuracoes')
      .update({
        cfg_valor: novoValor,
        cfg_atualizado_em: agora,
        cfg_atualizado_por: userResp.user?.id ?? null,
      })
      .eq('cfg_chave', cfgChave);
  }

  const atuais = await listarConfiguracoesSistema();
  const antigo = atuais.find((c) => c.cfg_chave === cfgChave);
  const atualizadas = atuais.map((c) =>
    c.cfg_chave === cfgChave
      ? { ...c, cfg_valor: novoValor, cfg_atualizado_em: agora }
      : c
  );

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CHAVE_STORAGE_CFG, JSON.stringify(atualizadas));
    registrarEventoAuditoriaLocal({
      aud_tabela_afetada: 'sis_configuracoes',
      aud_acao: 'CALIBRAGEM',
      aud_valor_antigo: antigo ? { cfg_chave: cfgChave, cfg_valor: antigo.cfg_valor } : null,
      aud_valor_novo: { cfg_chave: cfgChave, cfg_valor: novoValor },
    });
  }

  return atualizadas;
}

export async function listarDicionarioDadosVivo(): Promise<SisDicionario[]> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data, error } = await supabase
      .from('sis_dicionario')
      .select('*')
      .order('dic_tabela', { ascending: true })
      .order('dic_coluna', { ascending: true });

    if (!error && data && data.length > 0) {
      return data as SisDicionario[];
    }
  }

  if (typeof window !== 'undefined') {
    const salvo = window.localStorage.getItem(CHAVE_STORAGE_DIC);
    if (salvo) {
      try {
        return JSON.parse(salvo) as SisDicionario[];
      } catch {
        // Fallback
      }
    }
  }

  return DICIONARIO_VIVO_DEMO;
}

export async function atualizarDescricaoDicionario(
  dicId: string,
  novaDescricao: string
): Promise<SisDicionario[]> {
  const supabase = obterClienteSupabaseNavegador();
  const agora = new Date().toISOString();

  if (supabase) {
    await supabase
      .from('sis_dicionario')
      .update({
        dic_descricao_funcional: novaDescricao.trim(),
        dic_atualizado_em: agora,
      })
      .eq('dic_id', dicId);
  }

  const atuais = await listarDicionarioDadosVivo();
  const atualizados = atuais.map((d) =>
    d.dic_id === dicId
      ? { ...d, dic_descricao_funcional: novaDescricao.trim(), dic_atualizado_em: agora }
      : d
  );

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(CHAVE_STORAGE_DIC, JSON.stringify(atualizados));
  }

  return atualizados;
}

export async function sincronizarDicionarioVivo(): Promise<number> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data, error } = await supabase.rpc('rpc_sis_sincronizar_dicionario');
    if (!error && typeof data === 'number') {
      return data;
    }
  }

  const lista = await listarDicionarioDadosVivo();
  return lista.length;
}

export async function listarAuditoriaSistema(): Promise<SisAuditoria[]> {
  const supabase = obterClienteSupabaseNavegador();
  if (supabase) {
    const { data, error } = await supabase
      .from('sis_auditoria')
      .select('*')
      .order('aud_criado_em', { ascending: false })
      .limit(50);

    if (!error && data && data.length > 0) {
      return data as SisAuditoria[];
    }
  }

  if (typeof window !== 'undefined') {
    const salvo = window.localStorage.getItem(CHAVE_STORAGE_AUD);
    if (salvo) {
      try {
        return JSON.parse(salvo) as SisAuditoria[];
      } catch {
        // Fallback
      }
    }
  }

  return AUDITORIA_PADRAO_DEMO;
}

export function registrarEventoAuditoriaLocal(evento: {
  aud_tabela_afetada: string;
  aud_acao: string;
  aud_valor_antigo: Record<string, unknown> | null;
  aud_valor_novo: Record<string, unknown> | null;
}): void {
  if (typeof window === 'undefined') return;
  const salvo = window.localStorage.getItem(CHAVE_STORAGE_AUD);
  let lista: SisAuditoria[] = AUDITORIA_PADRAO_DEMO;
  if (salvo) {
    try {
      lista = JSON.parse(salvo) as SisAuditoria[];
    } catch {
      lista = AUDITORIA_PADRAO_DEMO;
    }
  }

  const novo: SisAuditoria = {
    aud_id: `aud-${Date.now()}`,
    aud_per_id: '00000000-0000-4000-8000-000000000001',
    aud_tabela_afetada: evento.aud_tabela_afetada,
    aud_acao: evento.aud_acao,
    aud_valor_antigo: evento.aud_valor_antigo,
    aud_valor_novo: evento.aud_valor_novo,
    aud_criado_em: new Date().toISOString(),
  };

  window.localStorage.setItem(
    CHAVE_STORAGE_AUD,
    JSON.stringify([novo, ...lista].slice(0, 100))
  );
}

