-- ============================================================================
-- Migration  : 002_rls_triggers_seguranca.sql
-- Projeto    : Livion — Plataforma Social Gamificada de Leitura (PWA)
-- Schema     : livion
-- Descrição  : Blindagem Row Level Security (RLS), Triggers de Onboarding
--              Automático (RN01), Proteção Anti-Tampering de Colunas Críticas
--              e Auditoria Forense Automática (RN07 / Seção 4) no schema `livion`.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SET LOCAL TIME ZONE 'America/Sao_Paulo';
SET LOCAL search_path TO livion, public;

-- ============================================================================
-- 1. FUNÇÃO AUXILIAR DE VERIFICAÇÃO DE PAPEL ADMIN (SECURITY DEFINER)
-- ============================================================================

CREATE OR REPLACE FUNCTION livion.fn_sis_usuario_eh_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = livion, public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM livion.usr_perfis
        WHERE per_id = auth.uid()
          AND per_papel = 'admin'
          AND per_banido = false
    );
$$;

COMMENT ON FUNCTION livion.fn_sis_usuario_eh_admin() IS
    'Verifica de forma segura se o usuário autenticado possui per_papel = admin e não está banido no schema livion.';

-- ============================================================================
-- 2. TRIGGER RN01: CRIAÇÃO AUTOMÁTICA DE PERFIL NO PRIMEIRO ACESSO
-- ============================================================================

CREATE OR REPLACE FUNCTION livion.fn_usr_criar_perfil_automatico()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = livion, public, pg_temp
AS $$
DECLARE
    v_nome_exibicao VARCHAR(80);
    v_avatar_url    TEXT;
BEGIN
    v_nome_exibicao := COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(btrim(NEW.raw_user_meta_data ->> 'name'), ''),
        NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
        'Leitor Livion'
    );

    v_avatar_url := COALESCE(
        NULLIF(btrim(NEW.raw_user_meta_data ->> 'avatar_url'), ''),
        NULLIF(btrim(NEW.raw_user_meta_data ->> 'picture'), '')
    );

    INSERT INTO livion.usr_perfis (
        per_id,
        per_nome_exibicao,
        per_url_avatar,
        per_papel,
        per_meta_diaria_minutos,
        per_niv_numero
    )
    VALUES (
        NEW.id,
        left(v_nome_exibicao, 80),
        v_avatar_url,
        'leitor',
        15,
        1
    )
    ON CONFLICT (per_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usr_criar_perfil_automatico ON auth.users;
CREATE TRIGGER trg_usr_criar_perfil_automatico
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION livion.fn_usr_criar_perfil_automatico();

-- ============================================================================
-- 3. TRIGGER DE BLINDAGEM DE COLUNAS EM livion.usr_perfis E livion.usr_biblioteca (SEÇÃO 4.1)
-- ============================================================================
-- Impede que o usuário edite diretamente seu próprio XP, nível, ofensiva,
-- escudos, papel ou trava de tempo via API cliente do navegador.

CREATE OR REPLACE FUNCTION livion.fn_usr_blindar_atualizacao_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = livion, public, pg_temp
AS $$
DECLARE
    v_motor_interno BOOLEAN := (current_setting('livion.motor_interno', true) = 'true');
    v_eh_admin      BOOLEAN := livion.fn_sis_usuario_eh_admin();
BEGIN
    -- Normaliza apelido sempre para minúsculo sem espaços
    IF NEW.per_apelido IS NOT NULL THEN
        NEW.per_apelido := lower(btrim(NEW.per_apelido));
    END IF;

    -- Se a chamada NÃO veio de uma RPC oficial do motor nem de um Admin/Service Role:
    IF NOT v_motor_interno AND NOT v_eh_admin AND current_user NOT IN ('postgres', 'service_role') THEN
        NEW.per_id                   := OLD.per_id;
        NEW.per_papel                := OLD.per_papel;
        NEW.per_xp_total             := OLD.per_xp_total;
        NEW.per_niv_numero           := OLD.per_niv_numero;
        NEW.per_ofensiva_atual       := OLD.per_ofensiva_atual;
        NEW.per_maior_ofensiva       := OLD.per_maior_ofensiva;
        NEW.per_escudos_ofensiva     := OLD.per_escudos_ofensiva;
        NEW.per_contador_dias_escudo := OLD.per_contador_dias_escudo;
        NEW.per_data_ultima_meta     := OLD.per_data_ultima_meta;
        NEW.per_ultimo_pulso_em      := OLD.per_ultimo_pulso_em;
        NEW.per_banido               := OLD.per_banido;
        NEW.per_criado_em            := OLD.per_criado_em;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usr_blindar_perfil ON livion.usr_perfis;
CREATE TRIGGER trg_usr_blindar_perfil
    BEFORE UPDATE ON livion.usr_perfis
    FOR EACH ROW
    EXECUTE FUNCTION livion.fn_usr_blindar_atualizacao_perfil();

CREATE OR REPLACE FUNCTION livion.fn_usr_blindar_biblioteca()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = livion, public, pg_temp
AS $$
DECLARE
    v_motor_interno BOOLEAN := (current_setting('livion.motor_interno', true) = 'true');
BEGIN
    IF TG_OP = 'INSERT' AND NOT v_motor_interno THEN
        NEW.bib_bonus_conclusao_resgatado := false;
    ELSIF TG_OP = 'UPDATE' AND NOT v_motor_interno THEN
        NEW.bib_bonus_conclusao_resgatado := OLD.bib_bonus_conclusao_resgatado;
        NEW.bib_per_id := OLD.bib_per_id;
    END IF;

    -- Impede que a página atual ultrapasse o total de páginas
    IF NEW.bib_pagina_atual > NEW.bib_total_paginas THEN
        NEW.bib_pagina_atual := NEW.bib_total_paginas;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usr_blindar_biblioteca ON livion.usr_biblioteca;
CREATE TRIGGER trg_usr_blindar_biblioteca
    BEFORE INSERT OR UPDATE ON livion.usr_biblioteca
    FOR EACH ROW
    EXECUTE FUNCTION livion.fn_usr_blindar_biblioteca();

-- ============================================================================
-- 4. TRIGGER DE AUDITORIA FORENSE AUTOMÁTICA EM livion.sis_auditoria (RN07)
-- ============================================================================

CREATE OR REPLACE FUNCTION livion.fn_sis_registrar_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = livion, public, pg_temp
AS $$
DECLARE
    v_acao        VARCHAR(30);
    v_json_antigo JSONB := NULL;
    v_json_novo   JSONB := NULL;
BEGIN
    v_acao := TG_OP;

    IF TG_OP = 'INSERT' THEN
        v_json_novo := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_json_antigo := to_jsonb(OLD);
        v_json_novo   := to_jsonb(NEW);

        -- Em usr_perfis, audita apenas mudanças administrativas de papel ou banimento
        IF TG_TABLE_NAME = 'usr_perfis' THEN
            IF OLD.per_banido IS NOT DISTINCT FROM NEW.per_banido
               AND OLD.per_papel IS NOT DISTINCT FROM NEW.per_papel THEN
                RETURN NEW;
            END IF;
            v_acao := CASE
                WHEN OLD.per_banido IS DISTINCT FROM NEW.per_banido THEN 'MOD_BANIMENTO'
                ELSE 'MOD_PAPEL'
            END;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        v_json_antigo := to_jsonb(OLD);
    END IF;

    INSERT INTO livion.sis_auditoria (
        aud_per_id,
        aud_tabela_afetada,
        aud_acao,
        aud_valor_antigo,
        aud_valor_novo
    )
    VALUES (
        auth.uid(),
        TG_TABLE_NAME,
        v_acao,
        v_json_antigo,
        v_json_novo
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_sis_configuracoes ON livion.sis_configuracoes;
CREATE TRIGGER trg_auditoria_sis_configuracoes
    AFTER INSERT OR UPDATE OR DELETE ON livion.sis_configuracoes
    FOR EACH ROW EXECUTE FUNCTION livion.fn_sis_registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_cat_livros ON livion.cat_livros;
CREATE TRIGGER trg_auditoria_cat_livros
    AFTER INSERT OR UPDATE OR DELETE ON livion.cat_livros
    FOR EACH ROW EXECUTE FUNCTION livion.fn_sis_registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_cat_categorias ON livion.cat_categorias;
CREATE TRIGGER trg_auditoria_cat_categorias
    AFTER INSERT OR UPDATE OR DELETE ON livion.cat_categorias
    FOR EACH ROW EXECUTE FUNCTION livion.fn_sis_registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_gam_niveis ON livion.gam_niveis;
CREATE TRIGGER trg_auditoria_gam_niveis
    AFTER INSERT OR UPDATE OR DELETE ON livion.gam_niveis
    FOR EACH ROW EXECUTE FUNCTION livion.fn_sis_registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_gam_conquistas ON livion.gam_conquistas;
CREATE TRIGGER trg_auditoria_gam_conquistas
    AFTER INSERT OR UPDATE OR DELETE ON livion.gam_conquistas
    FOR EACH ROW EXECUTE FUNCTION livion.fn_sis_registrar_auditoria();

DROP TRIGGER IF EXISTS trg_auditoria_usr_perfis ON livion.usr_perfis;
CREATE TRIGGER trg_auditoria_usr_perfis
    AFTER UPDATE ON livion.usr_perfis
    FOR EACH ROW EXECUTE FUNCTION livion.fn_sis_registrar_auditoria();

-- ============================================================================
-- 5. HABILITAÇÃO E POLÍTICAS DE ROW LEVEL SECURITY (RLS INTRANSPONÍVEL)
-- ============================================================================

ALTER TABLE livion.sis_dicionario        ENABLE ROW LEVEL SECURITY;
ALTER TABLE livion.sis_configuracoes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE livion.sis_auditoria         ENABLE ROW LEVEL SECURITY;
ALTER TABLE livion.cat_categorias        ENABLE ROW LEVEL SECURITY;
ALTER TABLE livion.cat_livros            ENABLE ROW LEVEL SECURITY;
ALTER TABLE livion.usr_perfis            ENABLE ROW LEVEL SECURITY;
ALTER TABLE livion.usr_biblioteca        ENABLE ROW LEVEL SECURITY;
ALTER TABLE livion.usr_conquistas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE livion.gam_niveis            ENABLE ROW LEVEL SECURITY;
ALTER TABLE livion.gam_sessoes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE livion.gam_validacoes_pagina ENABLE ROW LEVEL SECURITY;
ALTER TABLE livion.gam_conquistas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE livion.gam_campeoes_semanais ENABLE ROW LEVEL SECURITY;

-- 5.1. Políticas livion.sis_dicionario
DROP POLICY IF EXISTS pol_sis_dicionario_select ON livion.sis_dicionario;
CREATE POLICY pol_sis_dicionario_select ON livion.sis_dicionario
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pol_sis_dicionario_admin_all ON livion.sis_dicionario;
CREATE POLICY pol_sis_dicionario_admin_all ON livion.sis_dicionario
    FOR ALL TO authenticated
    USING (livion.fn_sis_usuario_eh_admin())
    WITH CHECK (livion.fn_sis_usuario_eh_admin());

-- 5.2. Políticas livion.sis_configuracoes
DROP POLICY IF EXISTS pol_sis_configuracoes_select ON livion.sis_configuracoes;
CREATE POLICY pol_sis_configuracoes_select ON livion.sis_configuracoes
    FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS pol_sis_configuracoes_admin_all ON livion.sis_configuracoes;
CREATE POLICY pol_sis_configuracoes_admin_all ON livion.sis_configuracoes
    FOR ALL TO authenticated
    USING (livion.fn_sis_usuario_eh_admin())
    WITH CHECK (livion.fn_sis_usuario_eh_admin());

-- 5.3. Políticas livion.sis_auditoria (Somente leitura para Admin)
DROP POLICY IF EXISTS pol_sis_auditoria_admin_select ON livion.sis_auditoria;
CREATE POLICY pol_sis_auditoria_admin_select ON livion.sis_auditoria
    FOR SELECT TO authenticated
    USING (livion.fn_sis_usuario_eh_admin());

-- 5.4. Políticas livion.cat_categorias
DROP POLICY IF EXISTS pol_cat_categorias_select ON livion.cat_categorias;
CREATE POLICY pol_cat_categorias_select ON livion.cat_categorias
    FOR SELECT TO authenticated, anon
    USING (cat_ativo = true OR livion.fn_sis_usuario_eh_admin());

DROP POLICY IF EXISTS pol_cat_categorias_admin_all ON livion.cat_categorias;
CREATE POLICY pol_cat_categorias_admin_all ON livion.cat_categorias
    FOR ALL TO authenticated
    USING (livion.fn_sis_usuario_eh_admin())
    WITH CHECK (livion.fn_sis_usuario_eh_admin());

-- 5.5. Políticas livion.cat_livros
DROP POLICY IF EXISTS pol_cat_livros_select ON livion.cat_livros;
CREATE POLICY pol_cat_livros_select ON livion.cat_livros
    FOR SELECT TO authenticated, anon
    USING (liv_publicado = true OR livion.fn_sis_usuario_eh_admin());

DROP POLICY IF EXISTS pol_cat_livros_admin_all ON livion.cat_livros;
CREATE POLICY pol_cat_livros_admin_all ON livion.cat_livros
    FOR ALL TO authenticated
    USING (livion.fn_sis_usuario_eh_admin())
    WITH CHECK (livion.fn_sis_usuario_eh_admin());

-- 5.6. Políticas livion.usr_perfis
DROP POLICY IF EXISTS pol_usr_perfis_select ON livion.usr_perfis;
CREATE POLICY pol_usr_perfis_select ON livion.usr_perfis
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS pol_usr_perfis_insert ON livion.usr_perfis;
CREATE POLICY pol_usr_perfis_insert ON livion.usr_perfis
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = per_id);

DROP POLICY IF EXISTS pol_usr_perfis_update ON livion.usr_perfis;
CREATE POLICY pol_usr_perfis_update ON livion.usr_perfis
    FOR UPDATE TO authenticated
    USING (auth.uid() = per_id OR livion.fn_sis_usuario_eh_admin())
    WITH CHECK (auth.uid() = per_id OR livion.fn_sis_usuario_eh_admin());

-- 5.7. Políticas livion.usr_biblioteca (Acesso estrito ao dono da estante)
DROP POLICY IF EXISTS pol_usr_biblioteca_select ON livion.usr_biblioteca;
CREATE POLICY pol_usr_biblioteca_select ON livion.usr_biblioteca
    FOR SELECT TO authenticated
    USING (auth.uid() = bib_per_id OR livion.fn_sis_usuario_eh_admin());

DROP POLICY IF EXISTS pol_usr_biblioteca_insert ON livion.usr_biblioteca;
CREATE POLICY pol_usr_biblioteca_insert ON livion.usr_biblioteca
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = bib_per_id);

DROP POLICY IF EXISTS pol_usr_biblioteca_update ON livion.usr_biblioteca;
CREATE POLICY pol_usr_biblioteca_update ON livion.usr_biblioteca
    FOR UPDATE TO authenticated
    USING (auth.uid() = bib_per_id)
    WITH CHECK (auth.uid() = bib_per_id);

DROP POLICY IF EXISTS pol_usr_biblioteca_delete ON livion.usr_biblioteca;
CREATE POLICY pol_usr_biblioteca_delete ON livion.usr_biblioteca
    FOR DELETE TO authenticated
    USING (auth.uid() = bib_per_id);

-- 5.8. Políticas livion.usr_conquistas (BLINDADA: ZERO escrita pelo cliente)
DROP POLICY IF EXISTS pol_usr_conquistas_select ON livion.usr_conquistas;
CREATE POLICY pol_usr_conquistas_select ON livion.usr_conquistas
    FOR SELECT TO authenticated, anon
    USING (true);

-- 5.9. Políticas livion.gam_niveis
DROP POLICY IF EXISTS pol_gam_niveis_select ON livion.gam_niveis;
CREATE POLICY pol_gam_niveis_select ON livion.gam_niveis
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS pol_gam_niveis_admin_all ON livion.gam_niveis;
CREATE POLICY pol_gam_niveis_admin_all ON livion.gam_niveis
    FOR ALL TO authenticated
    USING (livion.fn_sis_usuario_eh_admin())
    WITH CHECK (livion.fn_sis_usuario_eh_admin());

-- 5.10. Políticas livion.gam_conquistas
DROP POLICY IF EXISTS pol_gam_conquistas_select ON livion.gam_conquistas;
CREATE POLICY pol_gam_conquistas_select ON livion.gam_conquistas
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS pol_gam_conquistas_admin_all ON livion.gam_conquistas;
CREATE POLICY pol_gam_conquistas_admin_all ON livion.gam_conquistas
    FOR ALL TO authenticated
    USING (livion.fn_sis_usuario_eh_admin())
    WITH CHECK (livion.fn_sis_usuario_eh_admin());

-- 5.11. Políticas livion.gam_sessoes (BLINDADA: ZERO escrita pelo cliente)
DROP POLICY IF EXISTS pol_gam_sessoes_select ON livion.gam_sessoes;
CREATE POLICY pol_gam_sessoes_select ON livion.gam_sessoes
    FOR SELECT TO authenticated, anon
    USING (true);

-- 5.12. Políticas livion.gam_validacoes_pagina (BLINDADA: ZERO escrita pelo cliente)
DROP POLICY IF EXISTS pol_gam_validacoes_pagina_select ON livion.gam_validacoes_pagina;
CREATE POLICY pol_gam_validacoes_pagina_select ON livion.gam_validacoes_pagina
    FOR SELECT TO authenticated
    USING (auth.uid() = vpg_per_id OR livion.fn_sis_usuario_eh_admin());

-- 5.13. Políticas livion.gam_campeoes_semanais (BLINDADA: ZERO escrita pelo cliente)
DROP POLICY IF EXISTS pol_gam_campeoes_semanais_select ON livion.gam_campeoes_semanais;
CREATE POLICY pol_gam_campeoes_semanais_select ON livion.gam_campeoes_semanais
    FOR SELECT TO authenticated, anon
    USING (true);

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA livion TO anon, authenticated, service_role;

COMMIT;
