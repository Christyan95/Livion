-- ============================================================================
-- Migration  : 004_seeds_iniciais_dicionario.sql
-- Projeto    : Livion — Plataforma Social Gamificada de Leitura (PWA)
-- Schema     : livion
-- Descrição  : Carga inicial idempotente no schema `livion` de parâmetros
--              (sis_configuracoes), patentes literárias (gam_niveis), medalhas
--              (gam_conquistas), categorias (cat_categorias), acervo inicial
--              (cat_livros) e sincronização do Dicionário de Dados Vivo.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';
SET LOCAL TIME ZONE 'America/Sao_Paulo';
SET LOCAL search_path TO livion, public;

SELECT set_config('livion.motor_interno', 'true', true);

-- ============================================================================
-- 1. CALIBRAGEM INICIAL DO MOTOR EM livion.sis_configuracoes (RN04 & RN05)
-- ============================================================================

INSERT INTO livion.sis_configuracoes (cfg_chave, cfg_valor, cfg_tipo_dado, cfg_descricao)
VALUES
    ('velocidade_maxima_ppm', '350'::jsonb, 'numero', 'Velocidade máxima humana permitida em palavras por minuto (350 PPM = 5,83 palavras/segundo) para cálculo do T_min da página.'),
    ('tempo_minimo_pagina_seg', '5'::jsonb, 'numero', 'Piso mínimo de permanência (em segundos) exigido em qualquer página para conceder bônus de Página Validada.'),
    ('tempo_maximo_pagina_seg', '60'::jsonb, 'numero', 'Teto máximo do tempo mínimo exigido (em segundos) em páginas muito densas.'),
    ('tempo_limite_ociosidade_seg', '120'::jsonb, 'numero', 'Tempo limite (em segundos) sem interação física antes de pausar o cronômetro por ociosidade.'),
    ('intervalo_pulso_sincronizacao_seg', '60'::jsonb, 'numero', 'Intervalo padrão (em segundos) de envio do pulso de leitura ativa do navegador para o servidor.'),
    ('intervalo_minimo_pulso_seg', '45'::jsonb, 'numero', 'Trava anti-replay no servidor: intervalo físico mínimo (em segundos reais) entre pulsos consecutivos.'),
    ('xp_por_minuto_ativo', '10'::jsonb, 'numero', 'Quantidade base de XP concedida a cada 60 segundos de leitura ativa validada.'),
    ('xp_por_pagina_validada', '5'::jsonb, 'numero', 'Quantidade base de XP concedida por cada página que cumpriu o tempo mínimo T_min.'),
    ('xp_bonus_livro_concluido', '200'::jsonb, 'numero', 'Bônus único de XP concedido ao validar ao menos 90% das páginas de um livro com 30 ou mais páginas.'),
    ('percentual_minimo_conclusao_livro', '90'::jsonb, 'numero', 'Percentual mínimo de páginas validadas (0 a 100) para liberar o bônus de conclusão da obra.'),
    ('paginas_minimas_bonus_conclusao', '30'::jsonb, 'numero', 'Número mínimo de páginas totais que um livro deve ter para ser elegível ao bônus de 200 XP.'),
    ('cooldown_releitura_pagina_horas', '24'::jsonb, 'numero', 'Janela de bloqueio anti-farming (em horas) para que uma mesma página possa conceder XP novamente.')
ON CONFLICT (cfg_chave) DO UPDATE SET
    cfg_descricao     = EXCLUDED.cfg_descricao,
    cfg_atualizado_em = now();

-- ============================================================================
-- 2. PATENTES LITERÁRIAS EM livion.gam_niveis
-- ============================================================================

INSERT INTO livion.gam_niveis (niv_numero, niv_titulo_patente, niv_xp_minimo, niv_icone_insignia)
VALUES
    (1,  'Leitor Iniciante',         0,     'BookOpen'),
    (2,  'Desbravador de Páginas',   150,   'Compass'),
    (3,  'Explorador de Capítulos',  400,   'Bookmark'),
    (4,  'Viajante das Letras',      800,   'Feather'),
    (5,  'Guardião de Histórias',    1500,  'ShieldCheck'),
    (6,  'Cronista Dedicado',        2500,  'Scroll'),
    (7,  'Erudito da Comunidade',    4000,  'GraduationCap'),
    (8,  'Sábio da Biblioteca',      6500,  'Library'),
    (9,  'Mestre Literário',         10000, 'Crown'),
    (10, 'Lenda Imortal da Leitura', 16000, 'Sparkles')
ON CONFLICT (niv_numero) DO UPDATE SET
    niv_titulo_patente = EXCLUDED.niv_titulo_patente,
    niv_xp_minimo      = EXCLUDED.niv_xp_minimo,
    niv_icone_insignia = EXCLUDED.niv_icone_insignia;

-- ============================================================================
-- 3. CONQUISTAS E MEDALHAS EM livion.gam_conquistas
-- ============================================================================

INSERT INTO livion.gam_conquistas (con_codigo, con_titulo, con_descricao, con_icone, con_regra_gatilho, con_recompensa_xp, con_ativo)
VALUES
    (
        'PRIMEIRA_SESSAO',
        'Primeiras Linhas',
        'Concluiu seu primeiro pulso de leitura ativa na plataforma.',
        'Sparkles',
        '{"tipo": "sessoes_totais", "minimo": 1}'::jsonb,
        30,
        true
    ),
    (
        'PRIMEIRO_LIVRO',
        'De Capa a Capa',
        'Concluiu a leitura validada do seu primeiro livro completo.',
        'BookCheck',
        '{"tipo": "livros_concluidos", "minimo": 1}'::jsonb,
        100,
        true
    ),
    (
        'CORUJA_MADRUGADA',
        'Coruja da Madrugada',
        'Realizou uma sessão de leitura ativa entre 00h00 e 04h59 da manhã.',
        'Moon',
        '{"tipo": "horario_brt", "inicio": 0, "fim": 4}'::jsonb,
        50,
        true
    ),
    (
        'OFENSIVA_3_DIAS',
        'Ritmo Constante',
        'Bateu a meta diária de leitura por 3 dias consecutivos.',
        'Flame',
        '{"tipo": "ofensiva_atual", "minimo": 3}'::jsonb,
        60,
        true
    ),
    (
        'SEMANA_IMPECAVEL',
        'Semana Impecável',
        'Alcançou 7 dias seguidos de ofensiva e conquistou um Escudo Protetor.',
        'Shield',
        '{"tipo": "ofensiva_atual", "minimo": 7}'::jsonb,
        150,
        true
    ),
    (
        'BIBLIOTECARIO_LOCAL',
        'Estante Sem Fronteiras',
        'Importou um livro em PDF do próprio dispositivo para leitura offline.',
        'FolderUp',
        '{"tipo": "livros_locais", "minimo": 1}'::jsonb,
        40,
        true
    ),
    (
        'MESTRE_1000_XP',
        'Clube dos Mil',
        'Ultrapassou a marca histórica de 1.000 XP acumulados.',
        'Trophy',
        '{"tipo": "xp_total", "minimo": 1000}'::jsonb,
        120,
        true
    )
ON CONFLICT (con_codigo) DO UPDATE SET
    con_titulo        = EXCLUDED.con_titulo,
    con_descricao     = EXCLUDED.con_descricao,
    con_icone         = EXCLUDED.con_icone,
    con_regra_gatilho = EXCLUDED.con_regra_gatilho,
    con_recompensa_xp = EXCLUDED.con_recompensa_xp,
    con_ativo         = EXCLUDED.con_ativo;

-- ============================================================================
-- 4. CATEGORIAS LITERÁRIAS E ACERVO INICIAL EM DOMÍNIO PÚBLICO (livion.cat_*)
-- ============================================================================

INSERT INTO livion.cat_categorias (cat_id, cat_nome, cat_slug, cat_icone, cat_ordem_exibicao, cat_ativo, cat_metadados)
VALUES
    ('11111111-1111-4111-8111-111111111101', 'Indicações da Livion',     'indicacoes-da-livion',     'Sparkles',   1, true, '{"destaque": true, "cor": "amber"}'::jsonb),
    ('11111111-1111-4111-8111-111111111102', 'Contos Rápidos (15 min)',  'contos-rapidos',           'Zap',        2, true, '{"trilha_iniciante": true, "cor": "emerald"}'::jsonb),
    ('11111111-1111-4111-8111-111111111103', 'Clássicos Brasileiros',    'classicos-brasileiros',    'Landmark',   3, true, '{"cor": "indigo"}'::jsonb),
    ('11111111-1111-4111-8111-111111111104', 'Fantasia & Mistério',      'fantasia-e-misterio',      'Wand2',      4, true, '{"cor": "purple"}'::jsonb),
    ('11111111-1111-4111-8111-111111111105', 'Poesia & Crônicas',        'poesia-e-cronicas',        'Feather',    5, true, '{"cor": "rose"}'::jsonb)
ON CONFLICT (cat_slug) DO UPDATE SET
    cat_nome           = EXCLUDED.cat_nome,
    cat_icone          = EXCLUDED.cat_icone,
    cat_ordem_exibicao = EXCLUDED.cat_ordem_exibicao,
    cat_metadados      = EXCLUDED.cat_metadados;

INSERT INTO livion.cat_livros (
    liv_id,
    liv_cat_id,
    liv_titulo,
    liv_autor,
    liv_sinopse,
    liv_url_capa,
    liv_url_pdf,
    liv_tamanho_bytes,
    liv_total_paginas,
    liv_destaque_professora,
    liv_leitura_rapida,
    liv_publicado,
    liv_metadados
)
VALUES
    (
        '22222222-2222-4222-8222-222222222201',
        '11111111-1111-4111-8111-111111111102',
        'A Cartomante',
        'Machado de Assis',
        'Um dos contos mais célebres e envolventes de Machado de Assis sobre o triângulo entre Camilo, Rita e Vilela, explorando destino, ceticismo e ironia.',
        'https://covers.openlibrary.org/b/id/10521270-L.jpg',
        '/acervo-demo/a-cartomante-machado-de-assis.pdf',
        184320,
        14,
        true,
        true,
        true,
        '{"ano": 1884, "dominio_publico": true, "tempo_estimado_min": 15}'::jsonb
    ),
    (
        '22222222-2222-4222-8222-222222222202',
        '11111111-1111-4111-8111-111111111101',
        'O Alienista',
        'Machado de Assis',
        'O Dr. Simão Bacamarte funda a Casa Verde em Itaguaí para estudar a loucura humana, mas suas teorias científicas colocam toda a cidade sob suspeita.',
        'https://covers.openlibrary.org/b/id/8231990-L.jpg',
        '/acervo-demo/o-alienista-machado-de-assis.pdf',
        412000,
        52,
        true,
        false,
        true,
        '{"ano": 1882, "dominio_publico": true, "tempo_estimado_min": 65}'::jsonb
    ),
    (
        '22222222-2222-4222-8222-222222222203',
        '11111111-1111-4111-8111-111111111103',
        'Dom Casmurro',
        'Machado de Assis',
        'Bentinho narra suas memórias de juventude ao lado de Capitu e Escobar, construindo um dos maiores enigmas psicológicos da literatura mundial.',
        'https://covers.openlibrary.org/b/id/12648655-L.jpg',
        '/acervo-demo/dom-casmurro-machado-de-assis.pdf',
        980000,
        196,
        true,
        false,
        true,
        '{"ano": 1899, "dominio_publico": true, "tempo_estimado_min": 240}'::jsonb
    ),
    (
        '22222222-2222-4222-8222-222222222204',
        '11111111-1111-4111-8111-111111111102',
        'Missa do Galo',
        'Machado de Assis',
        'Na véspera de Natal, o jovem Nogueira aguarda a hora da Missa do Galo e trava um diálogo sutil e inesquecível com Conceição.',
        'https://covers.openlibrary.org/b/id/10909258-L.jpg',
        '/acervo-demo/missa-do-galo-machado-de-assis.pdf',
        152000,
        10,
        false,
        true,
        true,
        '{"ano": 1894, "dominio_publico": true, "tempo_estimado_min": 12}'::jsonb
    )
ON CONFLICT (liv_id) DO UPDATE SET
    liv_titulo              = EXCLUDED.liv_titulo,
    liv_sinopse             = EXCLUDED.liv_sinopse,
    liv_total_paginas       = EXCLUDED.liv_total_paginas,
    liv_destaque_professora = EXCLUDED.liv_destaque_professora,
    liv_leitura_rapida      = EXCLUDED.liv_leitura_rapida;

-- ============================================================================
-- 5. POPULAÇÃO INICIAL DO DICIONÁRIO DE DADOS VIVO (livion.sis_dicionario)
-- ============================================================================

SELECT livion.rpc_sis_sincronizar_dicionario();

COMMIT;
