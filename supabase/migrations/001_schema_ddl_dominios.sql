-- ============================================================================
-- Migration  : 001_schema_ddl_dominios.sql
-- Projeto    : Livion — Plataforma Social Gamificada de Leitura (PWA)
-- Arquitetura: PostgreSQL 15+ / Supabase
-- Schema     : livion (Isolamento lógico dedicado da aplicação)
-- Domínios   : sis_ (Sistema), cat_ (Catálogo), usr_ (Usuários), gam_ (Gamificação)
-- Descrição  : Criação do schema dedicado `livion`, permissões PostgREST,
--              tabelas padronizadas, constraints, índices, buckets de Storage
--              e metadados nativos (COMMENT ON TABLE / COLUMN).
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SET LOCAL TIME ZONE 'America/Sao_Paulo';

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 0. CRIAÇÃO DO SCHEMA DEDICADO `livion` E PERMISSÕES SUPABASE POSTGREST
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS livion;

COMMENT ON SCHEMA livion IS
    'Schema dedicado da plataforma Livion contendo os 4 domínios padronizados (sis_, cat_, usr_, gam_).';

-- Concede USAGE no schema para as roles da API do Supabase
GRANT USAGE ON SCHEMA livion TO anon, authenticated, service_role;

-- Configura privilégios padrão para objetos criados no schema `livion`
-- (O controle fino linha a linha e bloqueio de escrita é garantido pelo RLS na Migration 002)
ALTER DEFAULT PRIVILEGES IN SCHEMA livion
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA livion
    GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA livion
    GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA livion
    GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Define o search_path da sessão atual para priorizar `livion`
SET LOCAL search_path TO livion, public;

-- ============================================================================
-- 1. DOMÍNIO gam_ (BASE DE NÍVEIS E CONQUISTAS — PRÉ-REQUISITO DE FKs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS livion.gam_niveis (
    niv_numero          INT          NOT NULL,
    niv_titulo_patente  VARCHAR(80)  NOT NULL,
    niv_xp_minimo       BIGINT       NOT NULL DEFAULT 0,
    niv_icone_insignia  VARCHAR(50)  DEFAULT 'Award',

    CONSTRAINT pk_gam_niveis PRIMARY KEY (niv_numero),
    CONSTRAINT ck_gam_niveis_numero_positivo CHECK (niv_numero >= 1),
    CONSTRAINT ck_gam_niveis_xp_nao_negativo CHECK (niv_xp_minimo >= 0),
    CONSTRAINT ck_gam_niveis_titulo_nao_vazio CHECK (btrim(niv_titulo_patente) <> '')
);

COMMENT ON TABLE livion.gam_niveis IS 'Tabela de patentes e níveis de prestígio literário baseados no XP acumulado vitalício.';
COMMENT ON COLUMN livion.gam_niveis.niv_numero IS 'Número sequencial do nível (PK). Ex: 1, 2, 3...';
COMMENT ON COLUMN livion.gam_niveis.niv_titulo_patente IS 'Título honorífico da patente exibido no perfil e no ranking.';
COMMENT ON COLUMN livion.gam_niveis.niv_xp_minimo IS 'Quantidade mínima de XP total (per_xp_total) necessária para alcançar este nível.';
COMMENT ON COLUMN livion.gam_niveis.niv_icone_insignia IS 'Identificador do ícone Lucide correspondente à insígnia do nível.';

-- Garantir nível 1 padrão imediatamente para integridade referencial de novos perfis
INSERT INTO livion.gam_niveis (niv_numero, niv_titulo_patente, niv_xp_minimo, niv_icone_insignia)
VALUES (1, 'Leitor Iniciante', 0, 'BookOpen')
ON CONFLICT (niv_numero) DO NOTHING;

CREATE TABLE IF NOT EXISTS livion.gam_conquistas (
    con_id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    con_codigo          VARCHAR(50)  NOT NULL,
    con_titulo          VARCHAR(100) NOT NULL,
    con_descricao       TEXT         NOT NULL,
    con_icone           VARCHAR(50)  DEFAULT 'Trophy',
    con_regra_gatilho   JSONB        NOT NULL DEFAULT '{}'::jsonb,
    con_recompensa_xp   INT          NOT NULL DEFAULT 50,
    con_ativo           BOOLEAN      NOT NULL DEFAULT true,

    CONSTRAINT pk_gam_conquistas PRIMARY KEY (con_id),
    CONSTRAINT uk_gam_conquistas_codigo UNIQUE (con_codigo),
    CONSTRAINT ck_gam_conquistas_recompensa_positiva CHECK (con_recompensa_xp >= 0)
);

COMMENT ON TABLE livion.gam_conquistas IS 'Catálogo de medalhas e conquistas desbloqueáveis automaticamente por gatilhos de leitura.';
COMMENT ON COLUMN livion.gam_conquistas.con_id IS 'Identificador único UUID da conquista (PK).';
COMMENT ON COLUMN livion.gam_conquistas.con_codigo IS 'Código semântico único da conquista (ex: PRIMEIRO_LIVRO, CORUJA_MADRUGADA).';
COMMENT ON COLUMN livion.gam_conquistas.con_titulo IS 'Título público da medalha/conquista.';
COMMENT ON COLUMN livion.gam_conquistas.con_descricao IS 'Explicação clara de como o leitor desbloqueia esta conquista.';
COMMENT ON COLUMN livion.gam_conquistas.con_icone IS 'Nome do ícone Lucide representativo da medalha.';
COMMENT ON COLUMN livion.gam_conquistas.con_regra_gatilho IS 'Estrutura JSONB com os critérios avaliados pelo motor de gamificação.';
COMMENT ON COLUMN livion.gam_conquistas.con_recompensa_xp IS 'Bônus de XP vitalício concedido no instante do desbloqueio.';
COMMENT ON COLUMN livion.gam_conquistas.con_ativo IS 'Indica se a conquista está ativa e disponível para desbloqueio.';

-- ============================================================================
-- 2. DOMÍNIO usr_ (PERFIS, ESTANTE HÍBRIDA E CONQUISTAS DESBLOQUEADAS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS livion.usr_perfis (
    per_id                      UUID         NOT NULL,
    per_apelido                 VARCHAR(30)   NULL,
    per_nome_exibicao           VARCHAR(80)  NOT NULL,
    per_url_avatar              TEXT         NULL,
    per_papel                   VARCHAR(20)  NOT NULL DEFAULT 'leitor',
    per_meta_diaria_minutos     INT          NOT NULL DEFAULT 15,
    per_xp_total                BIGINT       NOT NULL DEFAULT 0,
    per_niv_numero              INT          NOT NULL DEFAULT 1,
    per_ofensiva_atual          INT          NOT NULL DEFAULT 0,
    per_maior_ofensiva          INT          NOT NULL DEFAULT 0,
    per_escudos_ofensiva        INT          NOT NULL DEFAULT 0,
    per_contador_dias_escudo    INT          NOT NULL DEFAULT 0,
    per_data_ultima_meta        DATE         NULL,
    per_ultimo_pulso_em         TIMESTAMPTZ  NULL,
    per_banido                  BOOLEAN      NOT NULL DEFAULT false,
    per_metadados               JSONB        NOT NULL DEFAULT '{}'::jsonb,
    per_criado_em               TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT pk_usr_perfis PRIMARY KEY (per_id),
    CONSTRAINT fk_usr_perfis_auth_users FOREIGN KEY (per_id)
        REFERENCES auth.users (id) ON DELETE CASCADE,
    CONSTRAINT fk_usr_perfis_gam_niveis FOREIGN KEY (per_niv_numero)
        REFERENCES livion.gam_niveis (niv_numero) ON UPDATE CASCADE,
    CONSTRAINT uk_usr_perfis_apelido UNIQUE (per_apelido),
    CONSTRAINT ck_usr_perfis_apelido_formato CHECK (
        per_apelido IS NULL OR per_apelido ~ '^[a-z0-9_]{3,30}$'
    ),
    CONSTRAINT ck_usr_perfis_papel CHECK (
        per_papel IN ('leitor', 'admin', 'moderador')
    ),
    CONSTRAINT ck_usr_perfis_meta_diaria CHECK (
        per_meta_diaria_minutos BETWEEN 5 AND 240
    ),
    CONSTRAINT ck_usr_perfis_xp_nao_negativo CHECK (per_xp_total >= 0),
    CONSTRAINT ck_usr_perfis_ofensiva_nao_negativa CHECK (
        per_ofensiva_atual >= 0 AND per_maior_ofensiva >= 0
    ),
    CONSTRAINT ck_usr_perfis_escudos_intervalo CHECK (
        per_escudos_ofensiva BETWEEN 0 AND 2
    ),
    CONSTRAINT ck_usr_perfis_contador_escudo_intervalo CHECK (
        per_contador_dias_escudo BETWEEN 0 AND 7
    )
);

CREATE INDEX IF NOT EXISTS idx_usr_perfis_apelido ON livion.usr_perfis (per_apelido);
CREATE INDEX IF NOT EXISTS idx_usr_perfis_ranking_constancia
    ON livion.usr_perfis (per_ofensiva_atual DESC, per_xp_total DESC)
    WHERE per_banido = false;

COMMENT ON TABLE livion.usr_perfis IS 'Perfis públicos e estado gamificado dos leitores vinculados 1:1 com auth.users.';
COMMENT ON COLUMN livion.usr_perfis.per_id IS 'UUID do usuário idêntico ao auth.users.id (PK e FK).';
COMMENT ON COLUMN livion.usr_perfis.per_apelido IS '[PII] Apelido único (@username) escolhido pelo leitor no onboarding (3 a 30 caracteres alfanuméricos/underscore).';
COMMENT ON COLUMN livion.usr_perfis.per_nome_exibicao IS '[PII] Nome público exibido na comunidade e nos rankings.';
COMMENT ON COLUMN livion.usr_perfis.per_url_avatar IS 'URL da foto de perfil ou avatar do leitor.';
COMMENT ON COLUMN livion.usr_perfis.per_papel IS 'Papel de controle de acesso RBAC: leitor, moderador ou admin.';
COMMENT ON COLUMN livion.usr_perfis.per_meta_diaria_minutos IS 'Meta diária de leitura ativa em minutos (entre 5 e 240, padrão 15).';
COMMENT ON COLUMN livion.usr_perfis.per_xp_total IS 'Pontos de experiência vitalícios acumulados (nunca zeram).';
COMMENT ON COLUMN livion.usr_perfis.per_niv_numero IS 'Nível/patente atual do leitor (FK para livion.gam_niveis.niv_numero).';
COMMENT ON COLUMN livion.usr_perfis.per_ofensiva_atual IS 'Quantidade de dias consecutivos batendo a meta diária de leitura.';
COMMENT ON COLUMN livion.usr_perfis.per_maior_ofensiva IS 'Recorde histórico de dias seguidos em ofensiva do leitor.';
COMMENT ON COLUMN livion.usr_perfis.per_escudos_ofensiva IS 'Saldo atual de escudos protetores de ofensiva (máximo 2 no inventário).';
COMMENT ON COLUMN livion.usr_perfis.per_contador_dias_escudo IS 'Contador progressivo de 0 a 7 dias batendo meta para ganhar +1 escudo.';
COMMENT ON COLUMN livion.usr_perfis.per_data_ultima_meta IS 'Data (America/Sao_Paulo) em que o leitor atingiu a meta diária pela última vez.';
COMMENT ON COLUMN livion.usr_perfis.per_ultimo_pulso_em IS 'Timestamp exato do último pulso de sincronização aceito pelo servidor (trava anti-replay >= 45s).';
COMMENT ON COLUMN livion.usr_perfis.per_banido IS 'Se true, oculta o perfil dos rankings públicos por moderação ou fraude.';
COMMENT ON COLUMN livion.usr_perfis.per_metadados IS 'Preferências de interface do usuário (tema visual padrão, onboarding concluído, etc.).';
COMMENT ON COLUMN livion.usr_perfis.per_criado_em IS 'Data e hora de criação do perfil na plataforma.';

-- ============================================================================
-- 3. DOMÍNIO sis_ (SISTEMA, GOVERNANÇA, CONFIGURAÇÕES E AUDITORIA)
-- ============================================================================

CREATE TABLE IF NOT EXISTS livion.sis_dicionario (
    dic_id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    dic_tabela              VARCHAR(80)  NOT NULL,
    dic_coluna              VARCHAR(80)  NOT NULL,
    dic_tipo_dado           VARCHAR(100) NOT NULL,
    dic_obrigatorio         BOOLEAN      NOT NULL DEFAULT false,
    dic_valor_padrao        TEXT         NULL,
    dic_descricao_funcional TEXT         NOT NULL DEFAULT '',
    dic_editavel_admin      BOOLEAN      NOT NULL DEFAULT true,
    dic_atualizado_em       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT pk_sis_dicionario PRIMARY KEY (dic_id),
    CONSTRAINT uk_sis_dicionario_tabela_coluna UNIQUE (dic_tabela, dic_coluna)
);

CREATE INDEX IF NOT EXISTS idx_sis_dicionario_tabela ON livion.sis_dicionario (dic_tabela, dic_coluna);

COMMENT ON TABLE livion.sis_dicionario IS 'Dicionário de Dados Vivo sincronizado com pg_catalog/information_schema do schema livion e editável no painel Admin.';
COMMENT ON COLUMN livion.sis_dicionario.dic_id IS 'Identificador único UUID do registro de metadado (PK).';
COMMENT ON COLUMN livion.sis_dicionario.dic_tabela IS 'Nome físico da tabela no schema livion (ex: usr_perfis).';
COMMENT ON COLUMN livion.sis_dicionario.dic_coluna IS 'Nome físico da coluna padronizada (ex: per_xp_total).';
COMMENT ON COLUMN livion.sis_dicionario.dic_tipo_dado IS 'Tipo de dado SQL nativo extraído do catálogo do PostgreSQL.';
COMMENT ON COLUMN livion.sis_dicionario.dic_obrigatorio IS 'Indica se a coluna possui restrição NOT NULL.';
COMMENT ON COLUMN livion.sis_dicionario.dic_valor_padrao IS 'Expressão DEFAULT configurada no banco de dados.';
COMMENT ON COLUMN livion.sis_dicionario.dic_descricao_funcional IS 'Explicação funcional detalhada do propósito da coluna no negócio.';
COMMENT ON COLUMN livion.sis_dicionario.dic_editavel_admin IS 'Indica se a descrição funcional pode ser customizada pelo painel Admin.';
COMMENT ON COLUMN livion.sis_dicionario.dic_atualizado_em IS 'Timestamp da última sincronização ou edição da documentação da coluna.';

CREATE TABLE IF NOT EXISTS livion.sis_configuracoes (
    cfg_chave           VARCHAR(80)  NOT NULL,
    cfg_valor           JSONB        NOT NULL,
    cfg_tipo_dado       VARCHAR(30)  NOT NULL DEFAULT 'numero',
    cfg_descricao       TEXT         NOT NULL,
    cfg_atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    cfg_atualizado_por  UUID         NULL,

    CONSTRAINT pk_sis_configuracoes PRIMARY KEY (cfg_chave),
    CONSTRAINT fk_sis_configuracoes_usr_perfis FOREIGN KEY (cfg_atualizado_por)
        REFERENCES livion.usr_perfis (per_id) ON DELETE SET NULL,
    CONSTRAINT ck_sis_configuracoes_tipo CHECK (
        cfg_tipo_dado IN ('numero', 'booleano', 'texto', 'json')
    )
);

COMMENT ON TABLE livion.sis_configuracoes IS 'Parâmetros dinâmicos do motor de gamificação e travas anti-fraude editáveis em tempo real.';
COMMENT ON COLUMN livion.sis_configuracoes.cfg_chave IS 'Chave identificadora única do parâmetro de negócio (PK).';
COMMENT ON COLUMN livion.sis_configuracoes.cfg_valor IS 'Valor do parâmetro armazenado em formato JSONB.';
COMMENT ON COLUMN livion.sis_configuracoes.cfg_tipo_dado IS 'Tipo semântico do valor para validação na UI Admin (numero, booleano, texto, json).';
COMMENT ON COLUMN livion.sis_configuracoes.cfg_descricao IS 'Descrição explicativa do impacto deste parâmetro no motor do sistema.';
COMMENT ON COLUMN livion.sis_configuracoes.cfg_atualizado_em IS 'Data e hora da última calibração do parâmetro.';
COMMENT ON COLUMN livion.sis_configuracoes.cfg_atualizado_por IS 'Administrador responsável pela última alteração (FK livion.usr_perfis.per_id).';

CREATE TABLE IF NOT EXISTS livion.sis_auditoria (
    aud_id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    aud_per_id          UUID         NULL,
    aud_tabela_afetada  VARCHAR(80)  NOT NULL,
    aud_acao            VARCHAR(30)  NOT NULL,
    aud_valor_antigo    JSONB        NULL,
    aud_valor_novo      JSONB        NULL,
    aud_criado_em       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT pk_sis_auditoria PRIMARY KEY (aud_id),
    CONSTRAINT fk_sis_auditoria_usr_perfis FOREIGN KEY (aud_per_id)
        REFERENCES livion.usr_perfis (per_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sis_auditoria_criado_em ON livion.sis_auditoria (aud_criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_sis_auditoria_tabela ON livion.sis_auditoria (aud_tabela_afetada);

COMMENT ON TABLE livion.sis_auditoria IS 'Trilha de auditoria forense imutável de todas as ações administrativas (alteração de XP, livros, banimentos).';
COMMENT ON COLUMN livion.sis_auditoria.aud_id IS 'Identificador único UUID do evento de auditoria (PK).';
COMMENT ON COLUMN livion.sis_auditoria.aud_per_id IS 'Perfil do administrador que executou a ação (FK livion.usr_perfis.per_id).';
COMMENT ON COLUMN livion.sis_auditoria.aud_tabela_afetada IS 'Nome da tabela onde ocorreu a mutação.';
COMMENT ON COLUMN livion.sis_auditoria.aud_acao IS 'Tipo de operação executada (INSERT, UPDATE, DELETE, MOD_BANIMENTO, CALIBRAGEM).';
COMMENT ON COLUMN livion.sis_auditoria.aud_valor_antigo IS 'Snapshot JSONB do registro antes da modificação.';
COMMENT ON COLUMN livion.sis_auditoria.aud_valor_novo IS 'Snapshot JSONB do registro após a modificação.';
COMMENT ON COLUMN livion.sis_auditoria.aud_criado_em IS 'Data e hora exata do evento registrado.';

-- ============================================================================
-- 4. DOMÍNIO cat_ (CATÁLOGO PÚBLICO DE LIVROS E CATEGORIAS LITERÁRIAS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS livion.cat_categorias (
    cat_id              UUID         NOT NULL DEFAULT gen_random_uuid(),
    cat_nome            VARCHAR(80)  NOT NULL,
    cat_slug            VARCHAR(80)  NOT NULL,
    cat_icone           VARCHAR(50)  DEFAULT 'BookOpen',
    cat_ordem_exibicao  INT          NOT NULL DEFAULT 0,
    cat_ativo           BOOLEAN      NOT NULL DEFAULT true,
    cat_metadados       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    cat_criado_em       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT pk_cat_categorias PRIMARY KEY (cat_id),
    CONSTRAINT uk_cat_categorias_slug UNIQUE (cat_slug),
    CONSTRAINT ck_cat_categorias_nome_nao_vazio CHECK (btrim(cat_nome) <> '')
);

CREATE INDEX IF NOT EXISTS idx_cat_categorias_ordem ON livion.cat_categorias (cat_ordem_exibicao ASC) WHERE cat_ativo = true;

COMMENT ON TABLE livion.cat_categorias IS 'Categorias e trilhas literárias exibidas no catálogo público do Livion.';
COMMENT ON COLUMN livion.cat_categorias.cat_id IS 'Identificador único UUID da categoria (PK).';
COMMENT ON COLUMN livion.cat_categorias.cat_nome IS 'Nome de exibição da categoria (ex: Indicações da Livion, Contos Rápidos).';
COMMENT ON COLUMN livion.cat_categorias.cat_slug IS 'Identificador amigável para URLs e filtros (Unique).';
COMMENT ON COLUMN livion.cat_categorias.cat_icone IS 'Nome do ícone Lucide associado à categoria.';
COMMENT ON COLUMN livion.cat_categorias.cat_ordem_exibicao IS 'Ordem numérica de priorização na vitrine.';
COMMENT ON COLUMN livion.cat_categorias.cat_ativo IS 'Define se a categoria está visível para os leitores.';
COMMENT ON COLUMN livion.cat_categorias.cat_metadados IS 'Metadados visuais extras (cor de destaque, descrição curta, etc.).';
COMMENT ON COLUMN livion.cat_categorias.cat_criado_em IS 'Timestamp de criação da categoria.';

CREATE TABLE IF NOT EXISTS livion.cat_livros (
    liv_id                  UUID         NOT NULL DEFAULT gen_random_uuid(),
    liv_cat_id              UUID         NULL,
    liv_titulo              VARCHAR(200) NOT NULL,
    liv_autor               VARCHAR(150) NOT NULL,
    liv_sinopse             TEXT         NULL,
    liv_url_capa            TEXT         NULL,
    liv_url_pdf             TEXT         NOT NULL,
    liv_tamanho_bytes       BIGINT       NULL,
    liv_total_paginas       INT          NOT NULL,
    liv_destaque_professora BOOLEAN      NOT NULL DEFAULT false,
    liv_leitura_rapida      BOOLEAN      NOT NULL DEFAULT false,
    liv_publicado           BOOLEAN      NOT NULL DEFAULT true,
    liv_cadastrado_por      UUID         NULL,
    liv_metadados           JSONB        NOT NULL DEFAULT '{}'::jsonb,
    liv_criado_em           TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT pk_cat_livros PRIMARY KEY (liv_id),
    CONSTRAINT fk_cat_livros_cat_categorias FOREIGN KEY (liv_cat_id)
        REFERENCES livion.cat_categorias (cat_id) ON DELETE SET NULL,
    CONSTRAINT fk_cat_livros_usr_perfis FOREIGN KEY (liv_cadastrado_por)
        REFERENCES livion.usr_perfis (per_id) ON DELETE SET NULL,
    CONSTRAINT ck_cat_livros_total_paginas_positivo CHECK (liv_total_paginas > 0),
    CONSTRAINT ck_cat_livros_titulo_nao_vazio CHECK (btrim(liv_titulo) <> '')
);

CREATE INDEX IF NOT EXISTS idx_cat_livros_categoria ON livion.cat_livros (liv_cat_id) WHERE liv_publicado = true;
CREATE INDEX IF NOT EXISTS idx_cat_livros_destaques ON livion.cat_livros (liv_destaque_professora, liv_leitura_rapida) WHERE liv_publicado = true;

COMMENT ON TABLE livion.cat_livros IS 'Acervo público curado de obras literárias em PDF com suporte a cache offline via IndexedDB.';
COMMENT ON COLUMN livion.cat_livros.liv_id IS 'Identificador único UUID do livro no catálogo público (PK).';
COMMENT ON COLUMN livion.cat_livros.liv_cat_id IS 'Categoria literária principal da obra (FK livion.cat_categorias.cat_id).';
COMMENT ON COLUMN livion.cat_livros.liv_titulo IS 'Título oficial da obra literária.';
COMMENT ON COLUMN livion.cat_livros.liv_autor IS 'Nome do autor ou autora da obra.';
COMMENT ON COLUMN livion.cat_livros.liv_sinopse IS 'Resumo/sinopse da obra para engajamento do leitor.';
COMMENT ON COLUMN livion.cat_livros.liv_url_capa IS 'URL pública da imagem de capa do livro.';
COMMENT ON COLUMN livion.cat_livros.liv_url_pdf IS 'Caminho no Supabase Storage ou URL pública direta do arquivo PDF.';
COMMENT ON COLUMN livion.cat_livros.liv_tamanho_bytes IS 'Tamanho do binário PDF em bytes para estimativa de download offline.';
COMMENT ON COLUMN livion.cat_livros.liv_total_paginas IS 'Quantidade total de páginas do documento PDF (> 0).';
COMMENT ON COLUMN livion.cat_livros.liv_destaque_professora IS 'Se true, destaca a obra no carrossel principal "Indicações da Livion".';
COMMENT ON COLUMN livion.cat_livros.liv_leitura_rapida IS 'Se true, destaca na trilha de iniciantes (contos rápidos de ~15 min).';
COMMENT ON COLUMN livion.cat_livros.liv_publicado IS 'Controla se o livro está publicado e visível no catálogo.';
COMMENT ON COLUMN livion.cat_livros.liv_cadastrado_por IS 'Administrador que cadastrou a obra (FK livion.usr_perfis.per_id).';
COMMENT ON COLUMN livion.cat_livros.liv_metadados IS 'Atributos adicionais flexíveis (ISBN, ano, editora, fonte Gutendex/Google Books).';
COMMENT ON COLUMN livion.cat_livros.liv_criado_em IS 'Data e hora de publicação da obra no acervo.';

-- ============================================================================
-- 5. CONTINUAÇÃO DOMÍNIO usr_ (ESTANTE HÍBRIDA E CONQUISTAS DO USUÁRIO)
-- ============================================================================

CREATE TABLE IF NOT EXISTS livion.usr_biblioteca (
    bib_id                          UUID         NOT NULL DEFAULT gen_random_uuid(),
    bib_per_id                      UUID         NOT NULL,
    bib_liv_id                      UUID         NULL,
    bib_arquivo_local               BOOLEAN      NOT NULL DEFAULT false,
    bib_hash_arquivo_local          VARCHAR(64)  NULL,
    bib_titulo_customizado          VARCHAR(200) NULL,
    bib_autor_customizado           VARCHAR(150) NULL,
    bib_pagina_atual                INT          NOT NULL DEFAULT 1,
    bib_total_paginas               INT          NOT NULL,
    bib_status                      VARCHAR(20)  NOT NULL DEFAULT 'lendo',
    bib_bonus_conclusao_resgatado   BOOLEAN      NOT NULL DEFAULT false,
    bib_ultima_leitura_em           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    bib_metadados                   JSONB        NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT pk_usr_biblioteca PRIMARY KEY (bib_id),
    CONSTRAINT fk_usr_biblioteca_usr_perfis FOREIGN KEY (bib_per_id)
        REFERENCES livion.usr_perfis (per_id) ON DELETE CASCADE,
    CONSTRAINT fk_usr_biblioteca_cat_livros FOREIGN KEY (bib_liv_id)
        REFERENCES livion.cat_livros (liv_id) ON DELETE SET NULL,
    CONSTRAINT uk_usr_biblioteca_per_liv UNIQUE (bib_per_id, bib_liv_id),
    CONSTRAINT uk_usr_biblioteca_per_hash UNIQUE (bib_per_id, bib_hash_arquivo_local),
    CONSTRAINT ck_usr_biblioteca_pagina_atual CHECK (bib_pagina_atual >= 1),
    CONSTRAINT ck_usr_biblioteca_total_paginas CHECK (bib_total_paginas >= 1),
    CONSTRAINT ck_usr_biblioteca_status CHECK (
        bib_status IN ('lendo', 'concluido', 'arquivado')
    ),
    CONSTRAINT ck_usr_biblioteca_origem_consistente CHECK (
        (bib_arquivo_local = true AND bib_hash_arquivo_local IS NOT NULL)
        OR (bib_arquivo_local = false)
    )
);

CREATE INDEX IF NOT EXISTS idx_usr_biblioteca_per_ultima_leitura
    ON livion.usr_biblioteca (bib_per_id, bib_ultima_leitura_em DESC);

COMMENT ON TABLE livion.usr_biblioteca IS 'Estante híbrida do leitor: unifica livros do catálogo público e PDFs locais sincronizados via hash SHA-256.';
COMMENT ON COLUMN livion.usr_biblioteca.bib_id IS 'Identificador único UUID do item na estante do usuário (PK).';
COMMENT ON COLUMN livion.usr_biblioteca.bib_per_id IS 'Dono da estante (FK livion.usr_perfis.per_id).';
COMMENT ON COLUMN livion.usr_biblioteca.bib_liv_id IS 'Referência ao livro do catálogo público quando aplicável (FK livion.cat_livros.liv_id).';
COMMENT ON COLUMN livion.usr_biblioteca.bib_arquivo_local IS 'True quando o PDF foi importado localmente pelo dispositivo do usuário (nunca sobe para nuvem).';
COMMENT ON COLUMN livion.usr_biblioteca.bib_hash_arquivo_local IS 'Hash SHA-256 do binário PDF local para reconhecimento multi-dispositivo automático.';
COMMENT ON COLUMN livion.usr_biblioteca.bib_titulo_customizado IS 'Título exibido para arquivos PDF importados localmente.';
COMMENT ON COLUMN livion.usr_biblioteca.bib_autor_customizado IS 'Autor exibido para arquivos PDF importados localmente.';
COMMENT ON COLUMN livion.usr_biblioteca.bib_pagina_atual IS 'Última página aberta pelo leitor (Memória Invisível sem marcador manual).';
COMMENT ON COLUMN livion.usr_biblioteca.bib_total_paginas IS 'Total de páginas do exemplar na estante.';
COMMENT ON COLUMN livion.usr_biblioteca.bib_status IS 'Estado de leitura do livro: lendo, concluido ou arquivado.';
COMMENT ON COLUMN livion.usr_biblioteca.bib_bonus_conclusao_resgatado IS 'Garante que o bônus de 200 XP por conclusão (>=90% validado em livro >=30 págs) seja pago apenas uma vez.';
COMMENT ON COLUMN livion.usr_biblioteca.bib_ultima_leitura_em IS 'Timestamp da última interação/virada de página neste livro.';
COMMENT ON COLUMN livion.usr_biblioteca.bib_metadados IS 'Metadados extras do item na estante.';

CREATE TABLE IF NOT EXISTS livion.usr_conquistas (
    uco_id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    uco_per_id          UUID        NOT NULL,
    uco_con_id          UUID        NOT NULL,
    uco_desbloqueada_em TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_usr_conquistas PRIMARY KEY (uco_id),
    CONSTRAINT fk_usr_conquistas_usr_perfis FOREIGN KEY (uco_per_id)
        REFERENCES livion.usr_perfis (per_id) ON DELETE CASCADE,
    CONSTRAINT fk_usr_conquistas_gam_conquistas FOREIGN KEY (uco_con_id)
        REFERENCES livion.gam_conquistas (con_id) ON DELETE CASCADE,
    CONSTRAINT uk_usr_conquistas_per_con UNIQUE (uco_per_id, uco_con_id)
);

CREATE INDEX IF NOT EXISTS idx_usr_conquistas_per_id ON livion.usr_conquistas (uco_per_id);

COMMENT ON TABLE livion.usr_conquistas IS 'Registro de conquistas e insígnias desbloqueadas por cada leitor.';
COMMENT ON COLUMN livion.usr_conquistas.uco_id IS 'Identificador único UUID do desbloqueio (PK).';
COMMENT ON COLUMN livion.usr_conquistas.uco_per_id IS 'Leitor que conquistou a medalha (FK livion.usr_perfis.per_id).';
COMMENT ON COLUMN livion.usr_conquistas.uco_con_id IS 'Conquista desbloqueada (FK livion.gam_conquistas.con_id).';
COMMENT ON COLUMN livion.usr_conquistas.uco_desbloqueada_em IS 'Data e hora exata do desbloqueio.';

-- ============================================================================
-- 6. CONTINUAÇÃO DOMÍNIO gam_ (SESSÕES, VALIDAÇÕES DE PÁGINA E CAMPEÕES)
-- ============================================================================

CREATE TABLE IF NOT EXISTS livion.gam_sessoes (
    ses_id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    ses_per_id              UUID        NOT NULL,
    ses_bib_id              UUID        NOT NULL,
    ses_data_referencia     DATE        NOT NULL,
    ses_data_inicio_semana  DATE        NOT NULL,
    ses_segundos_ativos     INT         NOT NULL,
    ses_paginas_validadas   INT         NOT NULL DEFAULT 0,
    ses_xp_ganho            INT         NOT NULL DEFAULT 0,
    ses_criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_gam_sessoes PRIMARY KEY (ses_id),
    CONSTRAINT fk_gam_sessoes_usr_perfis FOREIGN KEY (ses_per_id)
        REFERENCES livion.usr_perfis (per_id) ON DELETE CASCADE,
    CONSTRAINT fk_gam_sessoes_usr_biblioteca FOREIGN KEY (ses_bib_id)
        REFERENCES livion.usr_biblioteca (bib_id) ON DELETE CASCADE,
    CONSTRAINT ck_gam_sessoes_segundos_positivos CHECK (ses_segundos_ativos > 0),
    CONSTRAINT ck_gam_sessoes_paginas_nao_negativas CHECK (ses_paginas_validadas >= 0),
    CONSTRAINT ck_gam_sessoes_xp_nao_negativo CHECK (ses_xp_ganho >= 0)
);

CREATE INDEX IF NOT EXISTS idx_gam_sessoes_semana_per
    ON livion.gam_sessoes (ses_data_inicio_semana, ses_per_id);
CREATE INDEX IF NOT EXISTS idx_gam_sessoes_per_data_ref
    ON livion.gam_sessoes (ses_per_id, ses_data_referencia);

COMMENT ON TABLE livion.gam_sessoes IS 'Pulsos de leitura ativa validados pelo motor anti-fraude (base da meta diária e da Liga da Semana).';
COMMENT ON COLUMN livion.gam_sessoes.ses_id IS 'Identificador único UUID do pulso/sessão de leitura (PK).';
COMMENT ON COLUMN livion.gam_sessoes.ses_per_id IS 'Leitor titular da sessão (FK livion.usr_perfis.per_id).';
COMMENT ON COLUMN livion.gam_sessoes.ses_bib_id IS 'Livro da estante que estava sendo lido (FK livion.usr_biblioteca.bib_id).';
COMMENT ON COLUMN livion.gam_sessoes.ses_data_referencia IS 'Data civil no fuso America/Sao_Paulo para apuração da meta diária.';
COMMENT ON COLUMN livion.gam_sessoes.ses_data_inicio_semana IS 'Segunda-feira correspondente à semana da leitura (chave da Liga da Semana).';
COMMENT ON COLUMN livion.gam_sessoes.ses_segundos_ativos IS 'Segundos de leitura ativa validados neste pulso (> 0).';
COMMENT ON COLUMN livion.gam_sessoes.ses_paginas_validadas IS 'Quantidade de páginas que cumpriram T_min e cooldown de 24h neste pulso.';
COMMENT ON COLUMN livion.gam_sessoes.ses_xp_ganho IS 'Total de XP creditado neste pulso (já aplicando multiplicador de ofensiva e bônus).';
COMMENT ON COLUMN livion.gam_sessoes.ses_criado_em IS 'Timestamp exato do registro da sessão.';

CREATE TABLE IF NOT EXISTS livion.gam_validacoes_pagina (
    vpg_per_id          UUID        NOT NULL,
    vpg_bib_id          UUID        NOT NULL,
    vpg_numero_pagina   INT         NOT NULL,
    vpg_validada_em     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_gam_validacoes_pagina PRIMARY KEY (vpg_per_id, vpg_bib_id, vpg_numero_pagina),
    CONSTRAINT fk_gam_validacoes_pagina_usr_perfis FOREIGN KEY (vpg_per_id)
        REFERENCES livion.usr_perfis (per_id) ON DELETE CASCADE,
    CONSTRAINT fk_gam_validacoes_pagina_usr_biblioteca FOREIGN KEY (vpg_bib_id)
        REFERENCES livion.usr_biblioteca (bib_id) ON DELETE CASCADE,
    CONSTRAINT ck_gam_validacoes_pagina_positiva CHECK (vpg_numero_pagina >= 1)
);

CREATE INDEX IF NOT EXISTS idx_gam_validacoes_pagina_per_bib
    ON livion.gam_validacoes_pagina (vpg_per_id, vpg_bib_id);

COMMENT ON TABLE livion.gam_validacoes_pagina IS 'Trava anti-farming de releitura: controla o cooldown de 24h por página e o percentual real de páginas lidas do livro.';
COMMENT ON COLUMN livion.gam_validacoes_pagina.vpg_per_id IS 'Leitor que validou a página (PK composta, FK livion.usr_perfis.per_id).';
COMMENT ON COLUMN livion.gam_validacoes_pagina.vpg_bib_id IS 'Livro na estante do leitor (PK composta, FK livion.usr_biblioteca.bib_id).';
COMMENT ON COLUMN livion.gam_validacoes_pagina.vpg_numero_pagina IS 'Número da página validada após cumprir T_min (PK composta).';
COMMENT ON COLUMN livion.gam_validacoes_pagina.vpg_validada_em IS 'Última vez em que a página concedeu XP (bloqueia novo XP por 24 horas).';

CREATE TABLE IF NOT EXISTS livion.gam_campeoes_semanais (
    cam_id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    cam_data_inicio_semana  DATE        NOT NULL,
    cam_per_id              UUID        NOT NULL,
    cam_posicao_podio       INT         NOT NULL,
    cam_xp_acumulado_semana BIGINT      NOT NULL,
    cam_registrado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_gam_campeoes_semanais PRIMARY KEY (cam_id),
    CONSTRAINT fk_gam_campeoes_semanais_usr_perfis FOREIGN KEY (cam_per_id)
        REFERENCES livion.usr_perfis (per_id) ON DELETE CASCADE,
    CONSTRAINT uk_gam_campeoes_semana_posicao UNIQUE (cam_data_inicio_semana, cam_posicao_podio),
    CONSTRAINT ck_gam_campeoes_posicao_podio CHECK (cam_posicao_podio IN (1, 2, 3)),
    CONSTRAINT ck_gam_campeoes_xp_nao_negativo CHECK (cam_xp_acumulado_semana >= 0)
);

CREATE INDEX IF NOT EXISTS idx_gam_campeoes_semana ON livion.gam_campeoes_semanais (cam_data_inicio_semana DESC, cam_posicao_podio ASC);
CREATE INDEX IF NOT EXISTS idx_gam_campeoes_per_id ON livion.gam_campeoes_semanais (cam_per_id);

COMMENT ON TABLE livion.gam_campeoes_semanais IS 'Hall da Fama oficial com o pódio (1º, 2º e 3º lugares) consolidado a cada encerramento semanal.';
COMMENT ON COLUMN livion.gam_campeoes_semanais.cam_id IS 'Identificador único UUID do registro no pódio (PK).';
COMMENT ON COLUMN livion.gam_campeoes_semanais.cam_data_inicio_semana IS 'Segunda-feira da semana encerrada.';
COMMENT ON COLUMN livion.gam_campeoes_semanais.cam_per_id IS 'Leitor consagrado no pódio semanal (FK livion.usr_perfis.per_id).';
COMMENT ON COLUMN livion.gam_campeoes_semanais.cam_posicao_podio IS 'Colocação final no pódio: 1 (Ouro), 2 (Prata) ou 3 (Bronze).';
COMMENT ON COLUMN livion.gam_campeoes_semanais.cam_xp_acumulado_semana IS 'Total de XP acumulado pelo leitor durante aquela semana.';
COMMENT ON COLUMN livion.gam_campeoes_semanais.cam_registrado_em IS 'Timestamp do fechamento semanal executado pelo Cron Job.';

-- ============================================================================
-- 7. PERMISSÕES DE TABELA NO SCHEMA `livion` (COM BLINDAGEM DE ESCRITA DIRETA)
-- ============================================================================

GRANT SELECT ON ALL TABLES IN SCHEMA livion TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA livion TO authenticated, service_role;

-- Revoga explicitamente escrita direta via cliente nas tabelas de pontuação e auditoria
REVOKE INSERT, UPDATE, DELETE ON
    livion.gam_sessoes,
    livion.gam_validacoes_pagina,
    livion.usr_conquistas,
    livion.gam_campeoes_semanais,
    livion.sis_auditoria
FROM anon, authenticated;

-- ============================================================================
-- 8. BUCKETS DO SUPABASE STORAGE (ACERVO PÚBLICO E AVATARES)
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES
            ('acervo-pdfs', 'acervo-pdfs', true, 52428800, ARRAY['application/pdf']),
            ('acervo-capas', 'acervo-capas', true, 5242880, ARRAY['image/webp', 'image/jpeg', 'image/png']),
            ('avatares', 'avatares', true, 2097152, ARRAY['image/webp', 'image/jpeg', 'image/png'])
        ON CONFLICT (id) DO NOTHING;
    END IF;
END
$$;

COMMIT;
