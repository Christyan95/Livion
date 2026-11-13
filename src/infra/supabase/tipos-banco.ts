// ============================================================================
// LIVION — TIPAGEM ESTRITA DO BANCO DE DADOS (ESPELHADA NOS 4 DOMÍNIOS)
// Domínios: sis_ | cat_ | usr_ | gam_
// ============================================================================

export type PapelUsuario = 'leitor' | 'admin' | 'moderador';
export type StatusBiblioteca = 'lendo' | 'concluido' | 'arquivado';
export type TipoDadoConfiguracao = 'numero' | 'booleano' | 'texto' | 'json';

// ----------------------------------------------------------------------------
// 1. Domínio sis_ (Sistema, Governança e Dicionário Vivo)
// ----------------------------------------------------------------------------
export interface SisDicionario {
  dic_id: string;
  dic_tabela: string;
  dic_coluna: string;
  dic_tipo_dado: string;
  dic_obrigatorio: boolean;
  dic_valor_padrao: string | null;
  dic_descricao_funcional: string;
  dic_editavel_admin: boolean;
  dic_atualizado_em: string;
}

export interface SisConfiguracao {
  cfg_chave: string;
  cfg_valor: number | boolean | string | Record<string, unknown>;
  cfg_tipo_dado: TipoDadoConfiguracao;
  cfg_descricao: string;
  cfg_atualizado_em: string;
  cfg_atualizado_por: string | null;
}

export interface SisAuditoria {
  aud_id: string;
  aud_per_id: string | null;
  aud_tabela_afetada: string;
  aud_acao: string;
  aud_valor_antigo: Record<string, unknown> | null;
  aud_valor_novo: Record<string, unknown> | null;
  aud_criado_em: string;
}

// ----------------------------------------------------------------------------
// 2. Domínio cat_ (Catálogo Literário e Categorias)
// ----------------------------------------------------------------------------
export interface CatCategoria {
  cat_id: string;
  cat_nome: string;
  cat_slug: string;
  cat_icone: string | null;
  cat_ordem_exibicao: number;
  cat_ativo: boolean;
  cat_metadados: Record<string, unknown>;
  cat_criado_em: string;
}

export interface CatLivro {
  liv_id: string;
  liv_cat_id: string | null;
  liv_titulo: string;
  liv_autor: string;
  liv_sinopse: string | null;
  liv_url_capa: string | null;
  liv_url_pdf: string;
  liv_tamanho_bytes: number | null;
  liv_total_paginas: number;
  liv_destaque_professora: boolean;
  liv_leitura_rapida: boolean;
  liv_publicado: boolean;
  liv_cadastrado_por: string | null;
  liv_metadados: Record<string, unknown>;
  liv_criado_em: string;
}

// ----------------------------------------------------------------------------
// 3. Domínio usr_ (Perfis, Estante Híbrida e Conquistas de Usuário)
// ----------------------------------------------------------------------------
export interface UsrPerfil {
  per_id: string;
  per_apelido: string | null;
  per_nome_exibicao: string;
  per_url_avatar: string | null;
  per_papel: PapelUsuario;
  per_meta_diaria_minutos: number;
  per_xp_total: number;
  per_niv_numero: number;
  per_ofensiva_atual: number;
  per_maior_ofensiva: number;
  per_escudos_ofensiva: number;
  per_contador_dias_escudo: number;
  per_data_ultima_meta: string | null;
  per_ultimo_pulso_em: string | null;
  per_banido: boolean;
  per_metadados: Record<string, unknown>;
  per_criado_em: string;
}

export interface UsrBiblioteca {
  bib_id: string;
  bib_per_id: string;
  bib_liv_id: string | null;
  bib_arquivo_local: boolean;
  bib_hash_arquivo_local: string | null;
  bib_titulo_customizado: string | null;
  bib_autor_customizado: string | null;
  bib_pagina_atual: number;
  bib_total_paginas: number;
  bib_status: StatusBiblioteca;
  bib_bonus_conclusao_resgatado: boolean;
  bib_ultima_leitura_em: string;
  bib_metadados: Record<string, unknown>;
  // Join opcional com cat_livros quando bib_liv_id está presente
  cat_livros?: CatLivro | null;
}

export interface UsrConquista {
  uco_id: string;
  uco_per_id: string;
  uco_con_id: string;
  uco_desbloqueada_em: string;
  gam_conquistas?: GamConquista;
}

// ----------------------------------------------------------------------------
// 4. Domínio gam_ (Motor de Pontuação, Sessões, Níveis e Ranking)
// ----------------------------------------------------------------------------
export interface GamNivel {
  niv_numero: number;
  niv_titulo_patente: string;
  niv_xp_minimo: number;
  niv_icone_insignia: string | null;
}

export interface GamSessao {
  ses_id: string;
  ses_per_id: string;
  ses_bib_id: string;
  ses_data_referencia: string;
  ses_data_inicio_semana: string;
  ses_segundos_ativos: number;
  ses_paginas_validadas: number;
  ses_xp_ganho: number;
  ses_criado_em: string;
}

export interface GamValidacaoPagina {
  vpg_per_id: string;
  vpg_bib_id: string;
  vpg_numero_pagina: number;
  vpg_validada_em: string;
}

export interface GamConquista {
  con_id: string;
  con_codigo: string;
  con_titulo: string;
  con_descricao: string;
  con_icone: string | null;
  con_regra_gatilho: Record<string, unknown>;
  con_recompensa_xp: number;
  con_ativo: boolean;
}

export interface GamCampeaoSemanal {
  cam_id: string;
  cam_data_inicio_semana: string;
  cam_per_id: string;
  cam_posicao_podio: 1 | 2 | 3;
  cam_xp_acumulado_semana: number;
  cam_registrado_em: string;
  usr_perfis?: Pick<UsrPerfil, 'per_apelido' | 'per_nome_exibicao' | 'per_url_avatar'>;
}

// ----------------------------------------------------------------------------
// 5. Retornos das Funções RPC (rpc_<dominio>_<acao>)
// ----------------------------------------------------------------------------
export interface ResultadoPulsoLeitura {
  sucesso: boolean;
  xp_ganho_pulso: number;
  xp_bonus_livro: number;
  xp_bonus_conquistas: number;
  xp_total_atualizado: number;
  multiplicador_aplicado: number;
  paginas_validadas_aceitas: number;
  total_paginas_validadas_livro: number;
  segundos_hoje: number;
  meta_segundos_diaria: number;
  bateu_meta_hoje: boolean;
  bateu_meta_neste_pulso: boolean;
  ofensiva_atual: number;
  escudos_ofensiva: number;
  contador_dias_escudo: number;
  ganhou_escudo_neste_pulso: boolean;
  nivel_atual: number;
  subiu_nivel: boolean;
  conquistas_desbloqueadas: Array<{
    con_codigo: string;
    con_titulo: string;
    con_recompensa_xp: number;
    con_icone: string;
  }>;
  status_livro: StatusBiblioteca;
}

export interface ItemRankingSemanal {
  posicao: number;
  per_id: string;
  per_apelido: string | null;
  per_nome_exibicao: string;
  per_url_avatar: string | null;
  per_niv_numero: number;
  niv_titulo_patente: string;
  niv_icone_insignia: string | null;
  per_ofensiva_atual: number;
  xp_semana: number;
  minutos_semana: number;
  paginas_semana: number;
}

export interface ItemMuralConstancia {
  posicao: number;
  per_id: string;
  per_apelido: string | null;
  per_nome_exibicao: string;
  per_url_avatar: string | null;
  per_niv_numero: number;
  niv_titulo_patente: string;
  niv_icone_insignia: string | null;
  per_ofensiva_atual: number;
  per_maior_ofensiva: number;
  per_xp_total: number;
}

export interface ResultadoManutencaoCron {
  executado_em: string;
  data_referencia_brt: string;
  escudos_consumidos: number;
  ofensivas_zeradas: number;
  campeoes_semanais_registrados: number;
  colunas_dicionario_sincronizadas: number;
}

