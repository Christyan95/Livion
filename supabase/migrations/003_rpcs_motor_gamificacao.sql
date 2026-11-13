-- ============================================================================
-- Migration  : 003_rpcs_motor_gamificacao.sql
-- Projeto    : Livion — Plataforma Social Gamificada de Leitura (PWA)
-- Schema     : livion
-- Convenção  : livion.rpc_<dominio>_<acao>
-- Descrição  : Stored Procedures em PL/pgSQL no schema `livion` para:
--              1. livion.rpc_gam_registrar_pulso_leitura (Anti-Fraude, XP, Ofensiva, Escudos)
--              2. livion.rpc_sis_sincronizar_dicionario (Dicionário Vivo pg_catalog -> livion)
--              3. livion.rpc_sis_executar_manutencao (Cron Job: Escudos e Liga da Semana)
--              4. livion.rpc_gam_obter_ranking_semanal e livion.rpc_gam_obter_mural_constancia
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SET LOCAL TIME ZONE 'America/Sao_Paulo';
SET LOCAL search_path TO livion, public;

-- ============================================================================
-- 1. RPC: SINCRONIZAR DICIONÁRIO DE DADOS VIVO (livion.rpc_sis_sincronizar_dicionario)
-- ============================================================================

CREATE OR REPLACE FUNCTION livion.rpc_sis_sincronizar_dicionario()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = livion, public, pg_temp
AS $$
DECLARE
    v_total_sincronizado INT := 0;
BEGIN
    PERFORM set_config('livion.motor_interno', 'true', true);

    WITH catalogo_colunas AS (
        SELECT
            c.table_name::VARCHAR(80) AS tabela,
            c.column_name::VARCHAR(80) AS coluna,
            UPPER(
                CASE
                    WHEN c.character_maximum_length IS NOT NULL
                        THEN c.udt_name || '(' || c.character_maximum_length || ')'
                    ELSE c.udt_name
                END
            )::VARCHAR(100) AS tipo_dado,
            (c.is_nullable = 'NO') AS obrigatorio,
            c.column_default AS valor_padrao,
            COALESCE(
                pgd.description,
                'Coluna ' || c.column_name || ' da tabela livion.' || c.table_name
            ) AS descricao_catalogo
        FROM information_schema.columns c
        JOIN pg_catalog.pg_class klass
            ON klass.relname = c.table_name
        JOIN pg_catalog.pg_namespace nsp
            ON nsp.oid = klass.relnamespace AND nsp.nspname = c.table_schema
        LEFT JOIN pg_catalog.pg_description pgd
            ON pgd.objoid = klass.oid AND pgd.objsubid = c.ordinal_position
        WHERE c.table_schema = 'livion'
          AND c.table_name ~ '^(sis_|cat_|usr_|gam_)'
    )
    INSERT INTO livion.sis_dicionario (
        dic_tabela,
        dic_coluna,
        dic_tipo_dado,
        dic_obrigatorio,
        dic_valor_padrao,
        dic_descricao_funcional,
        dic_editavel_admin,
        dic_atualizado_em
    )
    SELECT
        tabela,
        coluna,
        tipo_dado,
        obrigatorio,
        valor_padrao,
        descricao_catalogo,
        true,
        now()
    FROM catalogo_colunas
    ON CONFLICT (dic_tabela, dic_coluna) DO UPDATE SET
        dic_tipo_dado    = EXCLUDED.dic_tipo_dado,
        dic_obrigatorio  = EXCLUDED.dic_obrigatorio,
        dic_valor_padrao = EXCLUDED.dic_valor_padrao,
        -- Preserva a descrição se o Admin já tiver personalizado
        dic_descricao_funcional = CASE
            WHEN btrim(livion.sis_dicionario.dic_descricao_funcional) = ''
                THEN EXCLUDED.dic_descricao_funcional
            ELSE livion.sis_dicionario.dic_descricao_funcional
        END,
        dic_atualizado_em = now();

    GET DIAGNOSTICS v_total_sincronizado = ROW_COUNT;
    RETURN v_total_sincronizado;
END;
$$;

COMMENT ON FUNCTION livion.rpc_sis_sincronizar_dicionario() IS
    'Sincroniza automaticamente livion.sis_dicionario com information_schema.columns e pg_catalog.pg_description das tabelas do schema livion.';

-- ============================================================================
-- 2. RPC: REGISTRAR PULSO DE LEITURA ATIVA (livion.rpc_gam_registrar_pulso_leitura)
-- ============================================================================

CREATE OR REPLACE FUNCTION livion.rpc_gam_registrar_pulso_leitura(
    p_bib_id            UUID,
    p_segundos_ativos   INT,
    p_pagina_atual      INT,
    p_paginas_validadas INT[] DEFAULT '{}'::INT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = livion, public, pg_temp
AS $$
DECLARE
    v_user_id                   UUID := auth.uid();
    v_perfil                    livion.usr_perfis%ROWTYPE;
    v_bib                       livion.usr_biblioteca%ROWTYPE;
    v_agora                     TIMESTAMPTZ := now();
    v_hoje_brt                  DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
    v_inicio_semana             DATE := date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE;
    v_hora_brt                  INT  := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::INT;
    v_intervalo_real_seg        NUMERIC;

    -- Parâmetros dinâmicos (livion.sis_configuracoes)
    v_cfg_xp_minuto             NUMERIC := 10;
    v_cfg_xp_pagina             INT     := 5;
    v_cfg_xp_conclusao          INT     := 200;
    v_cfg_trava_pulso_seg       INT     := 45;

    -- Contadores do pulso
    v_pag                       INT;
    v_paginas_aceitas           INT := 0;
    v_total_validadas_livro     INT := 0;
    v_segundos_acumulados_hoje  INT := 0;
    v_meta_segundos             INT := 900;

    -- Ofensiva e escudos
    v_bateu_meta_hoje_agora     BOOLEAN := false;
    v_ganhou_escudo_agora       BOOLEAN := false;
    v_nova_ofensiva             INT;
    v_maior_ofensiva            INT;
    v_novos_escudos             INT;
    v_novo_contador_escudo      INT;
    v_nova_data_meta            DATE;

    -- Cálculo de XP e nível
    v_multiplicador             NUMERIC(4,2) := 1.00;
    v_xp_base                   NUMERIC;
    v_xp_ganho_pulso            INT := 0;
    v_xp_bonus_livro            INT := 0;
    v_xp_conquistas_ganho       INT := 0;
    v_novo_xp_total             BIGINT;
    v_novo_nivel                INT;
    v_subiu_nivel               BOOLEAN := false;
    v_novo_status_bib           VARCHAR(20);
    v_resgatou_bonus_livro      BOOLEAN;

    -- Conquistas desbloqueadas neste pulso
    v_conquista_rec             RECORD;
    v_conquistas_novas          JSONB := '[]'::jsonb;
    v_total_livros_concluidos   INT := 0;
    v_total_livros_locais       INT := 0;
BEGIN
    -- 1. Validação de autenticação
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'NAO_AUTENTICADO: Sessão de usuário inválida.'
            USING ERRCODE = '28000';
    END IF;

    IF p_segundos_ativos IS NULL OR p_segundos_ativos <= 0 OR p_segundos_ativos > 120 THEN
        RAISE EXCEPTION 'PARAMETRO_INVALIDO: p_segundos_ativos deve estar entre 1 e 120 segundos.'
            USING ERRCODE = '22023';
    END IF;

    -- Ativa flag interna da transação para permitir escrita nas tabelas blindadas
    PERFORM set_config('livion.motor_interno', 'true', true);

    -- 2. Lock pessimista na linha do perfil e da biblioteca (evita Race Conditions)
    SELECT * INTO v_perfil
    FROM livion.usr_perfis
    WHERE per_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PERFIL_NAO_ENCONTRADO: Perfil do leitor não localizado em livion.usr_perfis.'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_bib
    FROM livion.usr_biblioteca
    WHERE bib_id = p_bib_id
      AND bib_per_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'LIVRO_NAO_ENCONTRADO: Item da estante não pertence ao leitor.'
            USING ERRCODE = 'P0002';
    END IF;

    -- 3. Leitura de parâmetros dinâmicos em livion.sis_configuracoes
    SELECT COALESCE((cfg_valor #>> '{}')::NUMERIC, 10)
      INTO v_cfg_xp_minuto
      FROM livion.sis_configuracoes WHERE cfg_chave = 'xp_por_minuto_ativo';
    v_cfg_xp_minuto := COALESCE(v_cfg_xp_minuto, 10);

    SELECT COALESCE((cfg_valor #>> '{}')::INT, 5)
      INTO v_cfg_xp_pagina
      FROM livion.sis_configuracoes WHERE cfg_chave = 'xp_por_pagina_validada';
    v_cfg_xp_pagina := COALESCE(v_cfg_xp_pagina, 5);

    SELECT COALESCE((cfg_valor #>> '{}')::INT, 200)
      INTO v_cfg_xp_conclusao
      FROM livion.sis_configuracoes WHERE cfg_chave = 'xp_bonus_livro_concluido';
    v_cfg_xp_conclusao := COALESCE(v_cfg_xp_conclusao, 200);

    SELECT COALESCE((cfg_valor #>> '{}')::INT, 45)
      INTO v_cfg_trava_pulso_seg
      FROM livion.sis_configuracoes WHERE cfg_chave = 'intervalo_minimo_pulso_seg';
    v_cfg_trava_pulso_seg := COALESCE(v_cfg_trava_pulso_seg, 45);

    -- 4. TRAVA ANTI-REPLAY DE TEMPO FÍSICO (Seção 4.2)
    -- Se o último pulso ocorreu há menos de 45 segundos reais no relógio do servidor, aborta!
    IF v_perfil.per_ultimo_pulso_em IS NOT NULL THEN
        v_intervalo_real_seg := EXTRACT(EPOCH FROM (v_agora - v_perfil.per_ultimo_pulso_em));
        IF v_intervalo_real_seg < v_cfg_trava_pulso_seg THEN
            RAISE EXCEPTION 'TRAVA_ANTI_FRAUDE_TEMPO: Pulso rejeitado. Intervalo físico no servidor (% s) menor que o mínimo exigido (% s).',
                round(v_intervalo_real_seg, 1), v_cfg_trava_pulso_seg
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- 5. TRAVA ANTI-FARMING DE RELEITURA POR PÁGINA (RN04.5 — Cooldown de 24h)
    -- Limite físico: em um pulso de 60s com T_min >= 5s, no máximo 12 páginas podem ser validadas
    IF p_paginas_validadas IS NOT NULL AND array_length(p_paginas_validadas, 1) > 0 THEN
        FOR v_pag IN
            SELECT DISTINCT unnest(p_paginas_validadas)
            LIMIT 12
        LOOP
            IF v_pag >= 1 AND v_pag <= v_bib.bib_total_paginas THEN
                INSERT INTO livion.gam_validacoes_pagina (
                    vpg_per_id,
                    vpg_bib_id,
                    vpg_numero_pagina,
                    vpg_validada_em
                )
                VALUES (
                    v_user_id,
                    p_bib_id,
                    v_pag,
                    v_agora
                )
                ON CONFLICT (vpg_per_id, vpg_bib_id, vpg_numero_pagina) DO UPDATE
                    SET vpg_validada_em = EXCLUDED.vpg_validada_em
                    WHERE livion.gam_validacoes_pagina.vpg_validada_em <= (v_agora - INTERVAL '24 hours');

                IF FOUND THEN
                    v_paginas_aceitas := v_paginas_aceitas + 1;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 6. APURAÇÃO DA META DIÁRIA E OFENSIVA (RN05.3 — Fuso America/Sao_Paulo)
    SELECT COALESCE(SUM(ses_segundos_ativos), 0)
      INTO v_segundos_acumulados_hoje
      FROM livion.gam_sessoes
     WHERE ses_per_id = v_user_id
       AND ses_data_referencia = v_hoje_brt;

    v_segundos_acumulados_hoje := v_segundos_acumulados_hoje + p_segundos_ativos;
    v_meta_segundos := v_perfil.per_meta_diaria_minutos * 60;

    v_nova_ofensiva        := v_perfil.per_ofensiva_atual;
    v_maior_ofensiva       := v_perfil.per_maior_ofensiva;
    v_novos_escudos        := v_perfil.per_escudos_ofensiva;
    v_novo_contador_escudo := v_perfil.per_contador_dias_escudo;
    v_nova_data_meta       := v_perfil.per_data_ultima_meta;

    IF v_segundos_acumulados_hoje >= v_meta_segundos
       AND (v_perfil.per_data_ultima_meta IS NULL OR v_perfil.per_data_ultima_meta < v_hoje_brt) THEN
        v_bateu_meta_hoje_agora := true;
        v_nova_data_meta        := v_hoje_brt;
        v_nova_ofensiva         := v_perfil.per_ofensiva_atual + 1;
        v_maior_ofensiva        := GREATEST(v_perfil.per_maior_ofensiva, v_nova_ofensiva);
        v_novo_contador_escudo  := v_perfil.per_contador_dias_escudo + 1;

        IF v_novo_contador_escudo >= 7 THEN
            v_novo_contador_escudo := 0;
            IF v_novos_escudos < 2 THEN
                v_novos_escudos       := v_novos_escudos + 1;
                v_ganhou_escudo_agora := true;
            END IF;
        END IF;
    END IF;

    -- 7. MULTIPLICADOR DE CONSTÂNCIA (RN05.2)
    v_multiplicador := CASE
        WHEN v_nova_ofensiva >= 7 THEN 1.50
        WHEN v_nova_ofensiva >= 3 THEN 1.20
        ELSE 1.00
    END;

    -- 8. CÁLCULO DE XP DO PULSO E BÔNUS DE CONCLUSÃO DE LIVRO (RN05.1)
    v_xp_base := ((p_segundos_ativos::NUMERIC / 60.0) * v_cfg_xp_minuto)
               + (v_paginas_aceitas * v_cfg_xp_pagina);

    v_xp_ganho_pulso := GREATEST(1, round(v_xp_base * v_multiplicador)::INT);

    -- Verifica quantas páginas distintas do livro já foram validadas historicamente
    SELECT COUNT(*)
      INTO v_total_validadas_livro
      FROM livion.gam_validacoes_pagina
     WHERE vpg_per_id = v_user_id
       AND vpg_bib_id = p_bib_id;

    v_resgatou_bonus_livro := v_bib.bib_bonus_conclusao_resgatado;
    v_novo_status_bib      := v_bib.bib_status;

    IF v_bib.bib_total_paginas >= 30
       AND NOT v_bib.bib_bonus_conclusao_resgatado
       AND (v_total_validadas_livro::NUMERIC / v_bib.bib_total_paginas::NUMERIC) >= 0.90 THEN
        v_xp_bonus_livro       := v_cfg_xp_conclusao;
        v_xp_ganho_pulso       := v_xp_ganho_pulso + v_xp_bonus_livro;
        v_resgatou_bonus_livro := true;
        v_novo_status_bib      := 'concluido';
    ELSIF p_pagina_atual >= v_bib.bib_total_paginas
          AND (v_total_validadas_livro::NUMERIC / v_bib.bib_total_paginas::NUMERIC) >= 0.90 THEN
        v_novo_status_bib      := 'concluido';
    END IF;

    -- 9. ATUALIZAÇÃO DA ESTANTE (MEMÓRIA INVISÍVEL — RN03.1)
    UPDATE livion.usr_biblioteca
       SET bib_pagina_atual              = LEAST(GREATEST(1, p_pagina_atual), v_bib.bib_total_paginas),
           bib_status                    = v_novo_status_bib,
           bib_bonus_conclusao_resgatado = v_resgatou_bonus_livro,
           bib_ultima_leitura_em         = v_agora
     WHERE bib_id = p_bib_id;

    -- 10. REGISTRO DA SESSÃO EM livion.gam_sessoes
    INSERT INTO livion.gam_sessoes (
        ses_per_id,
        ses_bib_id,
        ses_data_referencia,
        ses_data_inicio_semana,
        ses_segundos_ativos,
        ses_paginas_validadas,
        ses_xp_ganho,
        ses_criado_em
    )
    VALUES (
        v_user_id,
        p_bib_id,
        v_hoje_brt,
        v_inicio_semana,
        p_segundos_ativos,
        v_paginas_aceitas,
        v_xp_ganho_pulso,
        v_agora
    );

    -- 11. AVALIAÇÃO AUTOMÁTICA DE CONQUISTAS (livion.gam_conquistas -> livion.usr_conquistas)
    SELECT COUNT(*) INTO v_total_livros_concluidos
      FROM livion.usr_biblioteca
     WHERE bib_per_id = v_user_id AND bib_status = 'concluido';

    SELECT COUNT(*) INTO v_total_livros_locais
      FROM livion.usr_biblioteca
     WHERE bib_per_id = v_user_id AND bib_arquivo_local = true;

    FOR v_conquista_rec IN
        SELECT c.*
          FROM livion.gam_conquistas c
         WHERE c.con_ativo = true
           AND NOT EXISTS (
               SELECT 1 FROM livion.usr_conquistas u
                WHERE u.uco_per_id = v_user_id
                  AND u.uco_con_id = c.con_id
           )
    LOOP
        IF (v_conquista_rec.con_codigo = 'PRIMEIRA_SESSAO')
           OR (v_conquista_rec.con_codigo = 'PRIMEIRO_LIVRO' AND v_total_livros_concluidos >= 1)
           OR (v_conquista_rec.con_codigo = 'CORUJA_MADRUGADA' AND v_hora_brt BETWEEN 0 AND 4)
           OR (v_conquista_rec.con_codigo = 'OFENSIVA_3_DIAS' AND v_nova_ofensiva >= 3)
           OR (v_conquista_rec.con_codigo = 'SEMANA_IMPECAVEL' AND v_nova_ofensiva >= 7)
           OR (v_conquista_rec.con_codigo = 'BIBLIOTECARIO_LOCAL' AND v_total_livros_locais >= 1)
           OR (v_conquista_rec.con_codigo = 'MESTRE_1000_XP' AND (v_perfil.per_xp_total + v_xp_ganho_pulso) >= 1000)
        THEN
            INSERT INTO livion.usr_conquistas (uco_per_id, uco_con_id, uco_desbloqueada_em)
            VALUES (v_user_id, v_conquista_rec.con_id, v_agora)
            ON CONFLICT (uco_per_id, uco_con_id) DO NOTHING;

            v_xp_conquistas_ganho := v_xp_conquistas_ganho + v_conquista_rec.con_recompensa_xp;
            v_conquistas_novas := v_conquistas_novas || jsonb_build_object(
                'con_codigo', v_conquista_rec.con_codigo,
                'con_titulo', v_conquista_rec.con_titulo,
                'con_recompensa_xp', v_conquista_rec.con_recompensa_xp,
                'con_icone', v_conquista_rec.con_icone
            );
        END IF;
    END LOOP;

    -- 12. ATUALIZAÇÃO DE XP VITALÍCIO E CÁLCULO DE PATENTE (livion.gam_niveis)
    v_novo_xp_total := v_perfil.per_xp_total + v_xp_ganho_pulso + v_xp_conquistas_ganho;

    SELECT COALESCE(MAX(niv_numero), 1)
      INTO v_novo_nivel
      FROM livion.gam_niveis
     WHERE niv_xp_minimo <= v_novo_xp_total;

    v_subiu_nivel := (v_novo_nivel > v_perfil.per_niv_numero);

    UPDATE livion.usr_perfis
       SET per_xp_total                = v_novo_xp_total,
           per_niv_numero              = v_novo_nivel,
           per_ofensiva_atual          = v_nova_ofensiva,
           per_maior_ofensiva          = v_maior_ofensiva,
           per_escudos_ofensiva        = v_novos_escudos,
           per_contador_dias_escudo    = v_novo_contador_escudo,
           per_data_ultima_meta        = v_nova_data_meta,
           per_ultimo_pulso_em         = v_agora
     WHERE per_id = v_user_id;

    RETURN jsonb_build_object(
        'sucesso', true,
        'xp_ganho_pulso', v_xp_ganho_pulso,
        'xp_bonus_livro', v_xp_bonus_livro,
        'xp_bonus_conquistas', v_xp_conquistas_ganho,
        'xp_total_atualizado', v_novo_xp_total,
        'multiplicador_aplicado', v_multiplicador,
        'paginas_validadas_aceitas', v_paginas_aceitas,
        'total_paginas_validadas_livro', v_total_validadas_livro,
        'segundos_hoje', v_segundos_acumulados_hoje,
        'meta_segundos_diaria', v_meta_segundos,
        'bateu_meta_hoje', (v_segundos_acumulados_hoje >= v_meta_segundos),
        'bateu_meta_neste_pulso', v_bateu_meta_hoje_agora,
        'ofensiva_atual', v_nova_ofensiva,
        'escudos_ofensiva', v_novos_escudos,
        'contador_dias_escudo', v_novo_contador_escudo,
        'ganhou_escudo_neste_pulso', v_ganhou_escudo_agora,
        'nivel_atual', v_novo_nivel,
        'subiu_nivel', v_subiu_nivel,
        'conquistas_desbloqueadas', v_conquistas_novas,
        'status_livro', v_novo_status_bib
    );
END;
$$;

COMMENT ON FUNCTION livion.rpc_gam_registrar_pulso_leitura(UUID, INT, INT, INT[]) IS
    'Motor PL/pgSQL central de leitura ativa no schema livion: valida trava de 45s no servidor, cooldown de 24h por página, XP com multiplicador de ofensiva, escudos e conquistas.';

-- ============================================================================
-- 3. RPC: MANUTENÇÃO AUTOMÁTICA E VIRADA DE RANKING (livion.rpc_sis_executar_manutencao)
-- ============================================================================

CREATE OR REPLACE FUNCTION livion.rpc_sis_executar_manutencao()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = livion, public, pg_temp
AS $$
DECLARE
    v_hoje_brt              DATE := (now() AT TIME ZONE 'America/Sao_Paulo')::DATE;
    v_ontem_brt             DATE := ((now() AT TIME ZONE 'America/Sao_Paulo')::DATE - INTERVAL '1 day')::DATE;
    v_inicio_semana_atual   DATE := date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE;
    v_semana_anterior       DATE := (date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE - INTERVAL '7 days')::DATE;
    v_escudos_consumidos    INT  := 0;
    v_ofensivas_zeradas     INT  := 0;
    v_campeoes_registrados  INT  := 0;
    v_colunas_sincronizadas INT  := 0;
BEGIN
    PERFORM set_config('livion.motor_interno', 'true', true);

    -- 1. PROTEÇÃO AUTOMÁTICA DE FALHA DE OFENSIVA (RN05.3)
    WITH protegidos AS (
        UPDATE livion.usr_perfis
           SET per_escudos_ofensiva = per_escudos_ofensiva - 1,
               per_data_ultima_meta = v_ontem_brt
         WHERE per_ofensiva_atual > 0
           AND per_escudos_ofensiva > 0
           AND (per_data_ultima_meta IS NULL OR per_data_ultima_meta < v_ontem_brt)
        RETURNING per_id
    )
    SELECT COUNT(*) INTO v_escudos_consumidos FROM protegidos;

    WITH zerados AS (
        UPDATE livion.usr_perfis
           SET per_ofensiva_atual       = 0,
               per_contador_dias_escudo = 0
         WHERE per_ofensiva_atual > 0
           AND per_escudos_ofensiva = 0
           AND (per_data_ultima_meta IS NULL OR per_data_ultima_meta < v_ontem_brt)
        RETURNING per_id
    )
    SELECT COUNT(*) INTO v_ofensivas_zeradas FROM zerados;

    -- 2. ENCERRAMENTO DA LIGA DA SEMANA E PÓDIO OFICIAL (RN06.1)
    IF NOT EXISTS (
        SELECT 1 FROM livion.gam_campeoes_semanais
         WHERE cam_data_inicio_semana = v_semana_anterior
    ) THEN
        WITH ranking_semana_anterior AS (
            SELECT
                s.ses_per_id AS per_id,
                SUM(s.ses_xp_ganho)::BIGINT AS xp_semana,
                ROW_NUMBER() OVER (
                    ORDER BY SUM(s.ses_xp_ganho) DESC, MIN(s.ses_criado_em) ASC
                ) AS posicao
            FROM livion.gam_sessoes s
            JOIN livion.usr_perfis p ON p.per_id = s.ses_per_id
            WHERE s.ses_data_inicio_semana = v_semana_anterior
              AND p.per_banido = false
            GROUP BY s.ses_per_id
            HAVING SUM(s.ses_xp_ganho) > 0
            LIMIT 3
        ),
        inseridos AS (
            INSERT INTO livion.gam_campeoes_semanais (
                cam_data_inicio_semana,
                cam_per_id,
                cam_posicao_podio,
                cam_xp_acumulado_semana
            )
            SELECT
                v_semana_anterior,
                per_id,
                posicao::INT,
                xp_semana
            FROM ranking_semana_anterior
            ON CONFLICT (cam_data_inicio_semana, cam_posicao_podio) DO NOTHING
            RETURNING cam_id
        )
        SELECT COUNT(*) INTO v_campeoes_registrados FROM inseridos;
    END IF;

    -- 3. SINCRONIZAÇÃO DO DICIONÁRIO DE DADOS VIVO
    v_colunas_sincronizadas := livion.rpc_sis_sincronizar_dicionario();

    RETURN jsonb_build_object(
        'schema', 'livion',
        'executado_em', now(),
        'data_referencia_brt', v_hoje_brt,
        'escudos_consumidos', v_escudos_consumidos,
        'ofensivas_zeradas', v_ofensivas_zeradas,
        'campeoes_semanais_registrados', v_campeoes_registrados,
        'colunas_dicionario_sincronizadas', v_colunas_sincronizadas
    );
END;
$$;

COMMENT ON FUNCTION livion.rpc_sis_executar_manutencao() IS
    'Rotina diária/semanal chamada pelo Vercel Cron Job no schema livion: processa escudos de ofensiva à meia-noite, consagra o Top 3 semanal e sincroniza o dicionário de dados.';

-- ============================================================================
-- 4. RPCs DE CONSULTA DO DUPLO RANKING DA COMUNIDADE (RN06)
-- ============================================================================

CREATE OR REPLACE FUNCTION livion.rpc_gam_obter_ranking_semanal(p_limite INT DEFAULT 50)
RETURNS TABLE (
    posicao                 BIGINT,
    per_id                  UUID,
    per_apelido             VARCHAR(30),
    per_nome_exibicao       VARCHAR(80),
    per_url_avatar          TEXT,
    per_niv_numero          INT,
    niv_titulo_patente      VARCHAR(80),
    niv_icone_insignia      VARCHAR(50),
    per_ofensiva_atual      INT,
    xp_semana               BIGINT,
    minutos_semana          INT,
    paginas_semana          BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = livion, public, pg_temp
AS $$
    WITH semana_atual AS (
        SELECT date_trunc('week', (now() AT TIME ZONE 'America/Sao_Paulo'))::DATE AS dt_inicio
    ),
    agregado AS (
        SELECT
            p.per_id,
            p.per_apelido,
            p.per_nome_exibicao,
            p.per_url_avatar,
            p.per_niv_numero,
            n.niv_titulo_patente,
            n.niv_icone_insignia,
            p.per_ofensiva_atual,
            COALESCE(SUM(s.ses_xp_ganho), 0)::BIGINT AS xp_semana,
            ROUND(COALESCE(SUM(s.ses_segundos_ativos), 0) / 60.0)::INT AS minutos_semana,
            COALESCE(SUM(s.ses_paginas_validadas), 0)::BIGINT AS paginas_semana
        FROM livion.usr_perfis p
        JOIN livion.gam_niveis n ON n.niv_numero = p.per_niv_numero
        CROSS JOIN semana_atual sa
        LEFT JOIN livion.gam_sessoes s
            ON s.ses_per_id = p.per_id
           AND s.ses_data_inicio_semana = sa.dt_inicio
        WHERE p.per_banido = false
        GROUP BY
            p.per_id,
            p.per_apelido,
            p.per_nome_exibicao,
            p.per_url_avatar,
            p.per_niv_numero,
            n.niv_titulo_patente,
            n.niv_icone_insignia,
            p.per_ofensiva_atual,
            p.per_xp_total
    )
    SELECT
        ROW_NUMBER() OVER (ORDER BY xp_semana DESC, per_ofensiva_atual DESC) AS posicao,
        per_id,
        per_apelido,
        per_nome_exibicao,
        per_url_avatar,
        per_niv_numero,
        niv_titulo_patente,
        niv_icone_insignia,
        per_ofensiva_atual,
        xp_semana,
        minutos_semana,
        paginas_semana
    FROM agregado
    ORDER BY xp_semana DESC, per_ofensiva_atual DESC
    LIMIT LEAST(GREATEST(1, p_limite), 200);
$$;

COMMENT ON FUNCTION livion.rpc_gam_obter_ranking_semanal(INT) IS
    'Retorna a Liga da Semana (Aba 1 do Ranking) ordenando leitores não banidos pelo XP ganho desde a segunda-feira vigente.';

CREATE OR REPLACE FUNCTION livion.rpc_gam_obter_mural_constancia(p_limite INT DEFAULT 50)
RETURNS TABLE (
    posicao                 BIGINT,
    per_id                  UUID,
    per_apelido             VARCHAR(30),
    per_nome_exibicao       VARCHAR(80),
    per_url_avatar          TEXT,
    per_niv_numero          INT,
    niv_titulo_patente      VARCHAR(80),
    niv_icone_insignia      VARCHAR(50),
    per_ofensiva_atual      INT,
    per_maior_ofensiva      INT,
    per_xp_total            BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = livion, public, pg_temp
AS $$
    SELECT
        ROW_NUMBER() OVER (ORDER BY p.per_ofensiva_atual DESC, p.per_xp_total DESC) AS posicao,
        p.per_id,
        p.per_apelido,
        p.per_nome_exibicao,
        p.per_url_avatar,
        p.per_niv_numero,
        n.niv_titulo_patente,
        n.niv_icone_insignia,
        p.per_ofensiva_atual,
        p.per_maior_ofensiva,
        p.per_xp_total
    FROM livion.usr_perfis p
    JOIN livion.gam_niveis n ON n.niv_numero = p.per_niv_numero
    WHERE p.per_banido = false
    ORDER BY p.per_ofensiva_atual DESC, p.per_xp_total DESC
    LIMIT LEAST(GREATEST(1, p_limite), 200);
$$;

COMMENT ON FUNCTION livion.rpc_gam_obter_mural_constancia(INT) IS
    'Retorna o Mural de Constância (Aba 2 do Ranking) ordenando por per_ofensiva_atual DESC, per_xp_total DESC.';

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA livion TO anon, authenticated, service_role;

COMMIT;
