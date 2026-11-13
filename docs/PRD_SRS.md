# Documento Mestre de Especificação e Regras de Negócio (PRD & SRS)

**Projeto:** Livion — Plataforma Social Gamificada de Leitura (PWA Mobile-First)

---

## 1. Arquitetura Técnica e Infraestrutura

### 1.1. Stack Tecnológica e Hospedagem

* **Front-end & Core:** Next.js (App Router, TypeScript), Tailwind CSS, Lucide Icons e `pdfjs-dist` (Mozilla PDF.js rodando em Web Worker isolado).
* **Camada Offline (PWA):** Service Workers + `IndexedDB` (via biblioteca `idb`). Livros abertos do catálogo público e PDFs importados localmente pelo usuário ficam em cache no dispositivo para leitura offline instantânea e custo zero de tráfego repetido.
* **Back-end, Banco de Dados & Auth:** Supabase (PostgreSQL 15+, Supabase Auth com Google OAuth e E-mail/Senha, Supabase Storage para acervo público, Row Level Security restritivo e Stored Procedures em PL/pgSQL).
* **Versionamento e Deploy:** GitHub (branch `main` para produção, `develop` para homologação) integrado à Vercel com Deploy Contínuo e **Vercel Cron Jobs** para manutenção automática do banco e virada do ranking semanal.
* **APIs Externas de Apoio:** Google Books API / Open Library API (auto-preenchimento de capa, autor e sinopse no painel Admin) e Gutendex API (carga inicial de obras em domínio público em português).

### 1.2. Convenções de Padronização do Projeto

1. **Banco de Dados (`xxxx_yyyy` e `yyy_zzzz`):**
   * **Prefixos de Domínio de Tabela (`xxxx_`):**
     * `sis_`: Sistema, configurações globais, dicionário de dados e auditoria.
     * `cat_`: Catálogo público de livros e categorias literárias.
     * `usr_`: Usuários, perfis, estante de leitura e conquistas desbloqueadas.
     * `gam_`: Motor de gamificação, sessões de leitura, níveis, medalhas e ranking.
   * **Prefixos de Coluna (`yyy_zzzz`):** Cada tabela possui uma sigla única de 3 letras que prefixa todas as suas colunas. Chaves estrangeiras combinam o prefixo da tabela atual + o prefixo da tabela de destino (ex: `bib_per_id` na tabela `usr_biblioteca` aponta para `per_id` da tabela `usr_perfis`).

2. **Estrutura de Pastas do Código (Espelhada nos Domínios):**
   * `src/app/` → Rotas do Next.js (`(autenticacao)`, `(leitor)`, `(comunidade)`, `admin`, `api/cron`).
   * `src/modulos/sis/`, `src/modulos/cat/`, `src/modulos/usr/`, `src/modulos/gam/` → Componentes, hooks e serviços organizados exatamente pelos mesmos 4 domínios do banco.
   * `src/infra/` → Conexões (`supabase`, `indexeddb`, `pdf-worker`).

3. **Funções RPC no PostgreSQL:** Sempre nomeadas como `rpc_<dominio>_<acao>` (ex: `rpc_gam_registrar_pulso_leitura`, `rpc_sis_executar_manutencao`).

---

## 2. Modelagem Completa do Banco de Dados (Padronizada em Português)

### 2.1. Domínio `sis_` (Sistema, Governança e Dicionário Vivo)

| Tabela | Prefixo | Colunas Padronizadas (`yyy_zzzz`) | Função no Sistema |
| --- | --- | --- | --- |
| `sis_dicionario` | `dic_` | `dic_id` (PK), `dic_tabela`, `dic_coluna`, `dic_tipo_dado`, `dic_obrigatorio`, `dic_valor_padrao`, `dic_descricao_funcional`, `dic_editavel_admin`, `dic_atualizado_em` | **Dicionário de Dados Vivo:** Sincronizado com o catálogo do PostgreSQL (`pg_catalog` / `information_schema`), documentando a função exata de cada tabela e coluna do projeto. |
| `sis_configuracoes` | `cfg_` | `cfg_chave` (PK), `cfg_valor` (JSONB), `cfg_tipo_dado`, `cfg_descricao`, `cfg_atualizado_em`, `cfg_atualizado_por` | Armazena todas as variáveis de negócio editáveis em tempo real (pesos de XP, limites de tempo, velocidade máxima de leitura). |
| `sis_auditoria` | `aud_` | `aud_id` (PK), `aud_per_id` (FK), `aud_tabela_afetada`, `aud_acao`, `aud_valor_antigo` (JSONB), `aud_valor_novo` (JSONB), `aud_criado_em` | Registra qualquer alteração feita no painel Admin (mudança de regras de XP, banimento de usuários, edição de livros). |

### 2.2. Domínio `cat_` (Catálogo Literário e Categorias)

* **`cat_categorias` (Prefixo: `cat_`)**
  * `cat_id` (UUID, PK)
  * `cat_nome` (VARCHAR(80) NOT NULL) — Ex: *Indicações da Professora, Contos Rápidos, Clássicos, Fantasia*.
  * `cat_slug` (VARCHAR(80), Unique)
  * `cat_icone` (VARCHAR(50)) — Nome do ícone Lucide.
  * `cat_ordem_exibicao` (INT DEFAULT 0)
  * `cat_ativo` (BOOLEAN DEFAULT true)
  * `cat_metadados` (JSONB DEFAULT `'{}'`)
  * `cat_criado_em` (TIMESTAMPTZ DEFAULT `now()`)

* **`cat_livros` (Prefixo: `liv_`)**
  * `liv_id` (UUID, PK)
  * `liv_cat_id` (UUID, FK `cat_categorias.cat_id` ON DELETE SET NULL)
  * `liv_titulo` (VARCHAR(200) NOT NULL)
  * `liv_autor` (VARCHAR(150) NOT NULL)
  * `liv_sinopse` (TEXT)
  * `liv_url_capa` (TEXT)
  * `liv_url_pdf` (TEXT NOT NULL) — Caminho no Supabase Storage ou URL pública direta.
  * `liv_tamanho_bytes` (BIGINT)
  * `liv_total_paginas` (INT NOT NULL CHECK (`liv_total_paginas` > 0))
  * `liv_destaque_professora` (BOOLEAN DEFAULT false) — Exibe na vitrine principal do app.
  * `liv_leitura_rapida` (BOOLEAN DEFAULT false) — Destaca na trilha de iniciantes (contos de 15 min).
  * `liv_publicado` (BOOLEAN DEFAULT true)
  * `liv_cadastrado_por` (UUID, FK `usr_perfis.per_id`)
  * `liv_metadados` (JSONB DEFAULT `'{}'`) — Permite adicionar editora, ano, ISBN ou tags futuras sem alterar a tabela.
  * `liv_criado_em` (TIMESTAMPTZ DEFAULT `now()`)

### 2.3. Domínio `usr_` (Perfis, Estante Híbrida e Conquistas de Usuário)

* **`usr_perfis` (Prefixo: `per_`)**
  * `per_id` (UUID, PK, FK `auth.users.id` ON DELETE CASCADE)
  * `per_apelido` (VARCHAR(30), Unique, Indexed) — O `@username` público do leitor.
  * `per_nome_exibicao` (VARCHAR(80) NOT NULL)
  * `per_url_avatar` (TEXT)
  * `per_papel` (VARCHAR(20) DEFAULT `'leitor'` CHECK (`per_papel` IN (`'leitor'`, `'admin'`, `'moderador'`)))
  * `per_meta_diaria_minutos` (INT DEFAULT 15 CHECK (`per_meta_diaria_minutos` BETWEEN 5 AND 240))
  * `per_xp_total` (BIGINT DEFAULT 0) — Prestígio vitalício (nunca zera).
  * `per_niv_numero` (INT DEFAULT 1, FK `gam_niveis.niv_numero`)
  * `per_ofensiva_atual` (INT DEFAULT 0) — Dias consecutivos batendo a meta.
  * `per_maior_ofensiva` (INT DEFAULT 0) — Recorde histórico de dias seguidos.
  * `per_escudos_ofensiva` (INT DEFAULT 0 CHECK (`per_escudos_ofensiva` BETWEEN 0 AND 2))
  * `per_contador_dias_escudo` (INT DEFAULT 0 CHECK (`per_contador_dias_escudo` BETWEEN 0 AND 7))
  * `per_data_ultima_meta` (DATE) — Data em que bateu a meta diária pela última vez.
  * `per_ultimo_pulso_em` (TIMESTAMPTZ) — Controle anti-fraude de intervalo mínimo entre requisições.
  * `per_banido` (BOOLEAN DEFAULT false) — Oculta do ranking comunitário em caso de fraude/moderação.
  * `per_metadados` (JSONB DEFAULT `'{}'`)
  * `per_criado_em` (TIMESTAMPTZ DEFAULT `now()`)

* **`usr_biblioteca` (Prefixo: `bib_`)**
  * `bib_id` (UUID, PK)
  * `bib_per_id` (UUID, FK `usr_perfis.per_id` ON DELETE CASCADE)
  * `bib_liv_id` (UUID, FK `cat_livros.liv_id` ON DELETE SET NULL, Nullable) — Preenchido quando é livro do acervo público.
  * `bib_arquivo_local` (BOOLEAN DEFAULT false) — `true` quando o usuário importou o PDF do próprio aparelho.
  * `bib_hash_arquivo_local` (VARCHAR(64), Nullable) — Hash `SHA-256` do binário do PDF local (permite reconhecer o mesmo arquivo em outro dispositivo sem armazená-lo na nuvem).
  * `bib_titulo_customizado` (VARCHAR(200))
  * `bib_autor_customizado` (VARCHAR(150))
  * `bib_pagina_atual` (INT DEFAULT 1 CHECK (`bib_pagina_atual` >= 1))
  * `bib_total_paginas` (INT NOT NULL CHECK (`bib_total_paginas` >= 1))
  * `bib_status` (VARCHAR(20) DEFAULT `'lendo'` CHECK (`bib_status` IN (`'lendo'`, `'concluido'`, `'arquivado'`)))
  * `bib_bonus_conclusao_resgatado` (BOOLEAN DEFAULT false)
  * `bib_ultima_leitura_em` (TIMESTAMPTZ DEFAULT `now()`)
  * `bib_metadados` (JSONB DEFAULT `'{}'`)
  * *Constraints de Unicidade:* `UNIQUE(bib_per_id, bib_liv_id)` e `UNIQUE(bib_per_id, bib_hash_arquivo_local)`

* **`usr_conquistas` (Prefixo: `uco_`)**
  * `uco_id` (UUID, PK)
  * `uco_per_id` (UUID, FK `usr_perfis.per_id` ON DELETE CASCADE)
  * `uco_con_id` (UUID, FK `gam_conquistas.con_id` ON DELETE CASCADE)
  * `uco_desbloqueada_em` (TIMESTAMPTZ DEFAULT `now()`)
  * *Constraint:* `UNIQUE(uco_per_id, uco_con_id)`

### 2.4. Domínio `gam_` (Motor de Pontuação, Sessões e Ranking)

* **`gam_niveis` (Prefixo: `niv_`)**
  * `niv_numero` (INT, PK) — Ex: 1, 2, 3...
  * `niv_titulo_patente` (VARCHAR(80) NOT NULL) — Ex: *Leitor Iniciante, Explorador de Capítulos, Mestre Literário*.
  * `niv_xp_minimo` (BIGINT NOT NULL)
  * `niv_icone_insignia` (VARCHAR(50))

* **`gam_sessoes` (Prefixo: `ses_`)**
  * `ses_id` (UUID, PK)
  * `ses_per_id` (UUID, FK `usr_perfis.per_id` ON DELETE CASCADE)
  * `ses_bib_id` (UUID, FK `usr_biblioteca.bib_id` ON DELETE CASCADE)
  * `ses_data_referencia` (DATE NOT NULL) — Data no fuso `America/Sao_Paulo`.
  * `ses_data_inicio_semana` (DATE NOT NULL, Indexed) — Segunda-feira correspondente à semana da leitura (chave de agrupamento do Ranking Semanal).
  * `ses_segundos_ativos` (INT NOT NULL CHECK (`ses_segundos_ativos` > 0))
  * `ses_paginas_validadas` (INT NOT NULL DEFAULT 0)
  * `ses_xp_ganho` (INT NOT NULL CHECK (`ses_xp_ganho` >= 0))
  * `ses_criado_em` (TIMESTAMPTZ DEFAULT `now()`)

* **`gam_validacoes_pagina` (Prefixo: `vpg_`)**
  * `vpg_per_id` (UUID, FK `usr_perfis.per_id` ON DELETE CASCADE)
  * `vpg_bib_id` (UUID, FK `usr_biblioteca.bib_id` ON DELETE CASCADE)
  * `vpg_numero_pagina` (INT NOT NULL)
  * `vpg_validada_em` (TIMESTAMPTZ NOT NULL DEFAULT `now()`)
  * *Chave Primária Composta:* `PRIMARY KEY (vpg_per_id, vpg_bib_id, vpg_numero_pagina)`

* **`gam_conquistas` (Prefixo: `con_`)**
  * `con_id` (UUID, PK)
  * `con_codigo` (VARCHAR(50), Unique) — Ex: `PRIMEIRO_LIVRO`, `CORUJA_MADRUGADA`.
  * `con_titulo` (VARCHAR(100) NOT NULL)
  * `con_descricao` (TEXT NOT NULL)
  * `con_icone` (VARCHAR(50))
  * `con_regra_gatilho` (JSONB NOT NULL)
  * `con_recompensa_xp` (INT DEFAULT 50)
  * `con_ativo` (BOOLEAN DEFAULT true)

* **`gam_campeoes_semanais` (Prefixo: `cam_`)**
  * `cam_id` (UUID, PK)
  * `cam_data_inicio_semana` (DATE NOT NULL)
  * `cam_per_id` (UUID, FK `usr_perfis.per_id` ON DELETE CASCADE)
  * `cam_posicao_podio` (INT NOT NULL CHECK (`cam_posicao_podio` IN (1, 2, 3)))
  * `cam_xp_acumulado_semana` (BIGINT NOT NULL)
  * `cam_registrado_em` (TIMESTAMPTZ DEFAULT `now()`)

---

## 3. Regras de Negócio Detalhadas (RN)

### RN01 — Autenticação, Onboarding Rápido e Perfil Único
1. **Acesso:** O usuário entra via Login com Google (1 clique) ou E-mail/Senha.
2. **Criação Automática de Perfil:** Uma trigger no banco cria o registro inicial em `usr_perfis` assim que o usuário autentica pela primeira vez.
3. **Modal de Boas-Vindas (Único):** No primeiro acesso, o usuário escolhe seu `@per_apelido` e sua meta diária inicial (`10`, `15` ou `30` minutos/dia).
4. **Comunidade Única:** Não há segregação por salas ou turmas. Todos os leitores fazem parte de uma única comunidade global de incentivo à leitura.

### RN02 — Gestão de Acervo Híbrido (Público em Nuvem + Privado no Dispositivo)
1. **Acervo Público Curado (`cat_livros`):**
   * Alimentado pelos administradores com obras em domínio público, clássicos e textos abertos.
   * Ao abrir um livro público pela primeira vez, o binário do PDF é salvo no `IndexedDB` do celular do usuário, permitindo leitura futura sem internet e sem consumir banda do Supabase Storage.
2. **Importação Local pelo Leitor (`bib_arquivo_local = true`):**
   * Qualquer usuário pode clicar em **"Importar Livro (PDF)"** e selecionar um arquivo do seu aparelho para ler e pontuar no ranking.
   * **Blindagem Jurídica e de Custos:** O arquivo PDF do usuário **jamais é enviado ao servidor**. Ele permanece exclusivamente no `IndexedDB` do navegador do usuário.
   * **Geração Automática de Capa:** No momento da importação, o app lê a Página 1 via `pdf.js`, renderiza uma miniatura comprimida em formato `WebP` localmente e a utiliza como capa na estante do usuário.
   * **Sincronização Multi-Dispositivo Inteligente:** O app calcula o hash `SHA-256` do arquivo (`bib_hash_arquivo_local`) e salva no banco junto com a página atual (`bib_pagina_atual`). Se o usuário abrir sua conta no computador e importar o mesmo arquivo PDF, o sistema reconhece o hash `SHA-256` idêntico e retoma a leitura exatamente da página onde ele parou no celular.

### RN03 — Leitor Imersivo com Memória Invisível
1. **Zero Marcadores Manuais:** Não existem botões de "salvar página" ou "marcar página". A cada virada de página no leitor, a propriedade `bib_pagina_atual` é atualizada instantaneamente no armazenamento local (`localStorage`) e enviada ao banco no pulso de sincronização. Ao tocar na capa de qualquer livro na estante, ele abre direto na página exata onde o usuário parou.
2. **Visualização Página a Página Responsiva:**
   * A página do PDF se ajusta perfeitamente à largura do visor mobile, com navegação por deslize lateral (*swipe*) ou toque nas bordas laterais.
   * **Modos de Conforto Visual:** Alternância instantânea no topo entre **Modo Original**, **Modo Sépia** (tom creme suave para leitura diurna prolongada) e **Modo Noturno** (inversão inteligente de contraste para leitura no escuro).
3. **HUD Retrátil:** Durante a leitura, os controles somem para tela cheia. Um toque no centro da tela exibe a barra superior (progresso da meta diária e botão voltar) e o controle deslizante (*slider*) inferior.

### RN04 — Motor Anti-Fraude de Leitura Ativa
A validação de leitura ocorre página a página respeitando parâmetros dinâmicos da tabela `sis_configuracoes`:
1. **Cálculo Dinâmico de Densidade ($W_p$):** Ao abrir a página $P$, o motor extrai o texto da página e conta o número total de palavras ($W_p$).
2. **Tempo Mínimo de Permanência na Página ($T_{\min}$):**
   * Baseado no parâmetro `cfg_chave = 'velocidade_maxima_ppm'` (padrão: $350\text{ palavras por minuto}$, equivalente a $5,83\text{ palavras por segundo}$):
     $$T_{\min} = \text{clamp}\left(\frac{W_p}{5,83}, \, 5\text{ s}, \, 60\text{ s}\right)$$
   * *Regra:* Toda página exige no mínimo $5\text{ segundos}$ para ser validada (mesmo páginas com poucas palavras), e o tempo mínimo exigido nunca ultrapassa $60\text{ segundos}$. Se o usuário avançar de página antes de cumprir $T_{\min}$, a página vira normalmente sem travar a experiência, mas aquela página não soma bônus de "Página Validada".
3. **Bloqueio de Ociosidade (`tempo_limite_ociosidade_seg = 120`):**
   * Se o usuário ficar $120\text{ segundos}$ (2 minutos) na mesma página sem nenhuma interação física (`touchstart`, `scroll`, `zoom`, `click` ou mudança de página), o cronômetro entra em estado `PAUSADO` e exibe um aviso translúcido na tela. O tempo parado é descartado.
4. **Bloqueio por Perda de Foco:**
   * Se o usuário minimizar o navegador, trocar de aplicativo ou bloquear a tela do celular (`document.visibilityState === 'hidden'`), o cronômetro pausa imediatamente no mesmo milissegundo.
5. **Trava Anti-Farming de Releitura (`gam_validacoes_pagina`):**
   * Uma mesma página `vpg_numero_pagina` de um mesmo livro só pode conceder XP de página lida **1 vez a cada 24 horas** por usuário.

### RN05 — Economia de Pontos (XP), Ofensiva Diária e Escudos
1. **Valores Base de Pontuação (editáveis em `sis_configuracoes`):**
   * `xp_por_minuto_ativo`: **$10\text{ XP}$** a cada 60 segundos de leitura ativa validada.
   * `xp_por_pagina_validada`: **$5\text{ XP}$** por página que cumpriu $T_{\min}$ (respeitando o cooldown de 24h).
   * `xp_bonus_livro_concluido`: **$200\text{ XP}$** concedidos uma única vez quando o usuário valida pelo menos **$90\%$ das páginas totais** de um livro com $30$ ou mais páginas (`bib_bonus_conclusao_resgatado = true`).
2. **Multiplicador de Constância (Bônus de Ofensiva):**
   * Ofensiva de $0\text{ a }2\text{ dias}$: **$1,0\times\text{ XP}$**
   * Ofensiva de $3\text{ a }6\text{ dias}$: **$1,2\times\text{ XP}$**
   * Ofensiva de $7+\text{ dias}$: **$1,5\times\text{ XP}$** (teto máximo).
3. **Regra da Ofensiva Diária (`per_ofensiva_atual`) e Escudos (`per_escudos_ofensiva`):**
   * O usuário bate a meta do dia quando a soma de `ses_segundos_ativos` na data atual (horário de Brasília) atinge `per_meta_diaria_minutos * 60`.
   * Ao bater a meta do dia pela primeira vez na data atual:
     * `per_ofensiva_atual` aumenta em $+1$.
     * `per_contador_dias_escudo` aumenta em $+1$.
     * Ao atingir $7\text{ dias}$ no contador (`per_contador_dias_escudo == 7`), o contador zera e o usuário ganha **$+1\text{ Escudo de Ofensiva}$** (limite máximo acumulado no inventário: $2\text{ escudos}$).
   * **Proteção Automática de Falha:** Se o usuário passar um dia inteiro sem bater a meta diária:
     * Se possuir `per_escudos_ofensiva > 0`, o sistema consome $1\text{ escudo}$ automaticamente e mantém a `per_ofensiva_atual` intacta.
     * Se possuir $0\text{ escudos}$, a `per_ofensiva_atual` e o `per_contador_dias_escudo` voltam a $0$.

### RN06 — Sistema de Duplo Ranking da Comunidade
1. **Aba 1: Liga da Semana (Competição por XP Semanal):**
   * Soma todo o `ses_xp_ganho` em `gam_sessoes` cuja `ses_data_inicio_semana` seja igual à segunda-feira da semana vigente.
   * Toda segunda-feira às `00:00` (BRT), o Cron Job encerra a semana anterior, grava o 1º, 2º e 3º colocados na tabela `gam_campeoes_semanais` (concedendo medalha oficial no perfil) e inicia uma nova tabela semanal zerada para que novatos e veteranos disputem em igualdade.
2. **Aba 2: Mural de Constância (Competição por Hábito):**
   * Ordena todos os membros não banidos da comunidade por `per_ofensiva_atual DESC, per_xp_total DESC`. Valoriza quem mantém o hábito diário sem falhar, independentemente da velocidade de leitura.

### RN07 — Painel Administrativo (`/admin`) e Dicionário de Dados
Acessível exclusivamente por perfis com `per_papel = 'admin'`:
1. **Gestão de Acervo com Auto-Fill:** Ao digitar o título de um livro, o painel consulta a API do Google Books / Open Library, preenchendo título, autor, sinopse, número de páginas e capa automaticamente. O administrador faz o upload direto do PDF para o Supabase Storage e define se é *"Destaque da Livion"* ou *"Leitura Rápida"*.
2. **Gestão Dinâmica de Tabelas de Domínio:** Interface para criar, editar, ordenar ou desativar categorias (`cat_categorias`), patentes de nível (`gam_niveis`) e conquistas (`gam_conquistas`).
3. **Calibragem do Motor (`sis_configuracoes`):** Edição em tempo real dos pesos de XP e travas de tempo, gerando registro automático em `sis_auditoria`.
4. **Explorador do Dicionário de Dados (`sis_dicionario`):** Visualização completa de todas as tabelas e colunas do banco de dados com suas respectivas descrições funcionais editáveis, mantendo a documentação viva dentro do próprio sistema.

---

## 4. Segurança Blindada e Prevenção de Fraudes

1. **Row Level Security (RLS) Intransponível:**
   * Nenhuma tabela de pontuação (`gam_sessoes`, `gam_validacoes_pagina`, `usr_conquistas`) permite `INSERT`, `UPDATE` ou `DELETE` vindo diretamente da API cliente do navegador.
   * Na tabela `usr_perfis`, o próprio usuário só tem permissão de atualizar `per_nome_exibicao`, `per_apelido`, `per_url_avatar` e `per_meta_diaria_minutos`. Colunas como `per_xp_total`, `per_ofensiva_atual` e `per_papel` são blindadas contra edição direta.
2. **Sincronização via RPC com Trava de Tempo Físico (`rpc_gam_registrar_pulso_leitura`):**
   * O navegador envia um pulso de sincronização a cada $60\text{ segundos}$ de leitura ativa.
   * A função PL/pgSQL no servidor verifica `EXTRACT(EPOCH FROM (now() - per_ultimo_pulso_em))`. Se o usuário tentar enviar um pacote dizendo que leu $60\text{ segundos}$, mas o último pulso registrado no banco ocorreu há menos de $45\text{ segundos}$ reais no relógio do servidor, a transação é abortada imediatamente. Isso impede ataques de repetição (*Replay Attacks*) ou manipulação de velocidade de cronômetro no navegador.
3. **Execução Segura de PDF:**
   * O worker do `pdf.js` roda com `isEvalSupported: false` e `enableScripting: false`, eliminando vetores de XSS (Cross-Site Scripting) via arquivos PDF adulterados.
4. **Cron Job Protegido (`vercel.json`):**
   * A rota `/api/cron/manutencao` exige validação estrita do cabeçalho `Authorization: Bearer <CRON_SECRET>`, mantendo o projeto Supabase sempre ativo no plano gratuito (evitando o congelamento de 7 dias) e processando os escudos de ofensiva à meia-noite.

---

## 5. Identidade Visual, Logomarca e Paleta de Cores (Design System)

### 5.1. Ativos Oficiais da Logomarca (`public/`)
* **`/logo.jpg` (Assinatura Completa):** Emblema completo contendo o livro aberto (páginas em Creme Papiro e Violeta Humanidades), a pena/chama formando o *"L"* em Âmbar Literário e o logotipo tipográfico **LIViON**. Aplicado na vitrine principal da tela de autenticação (`/entrar`).
* **`/livro.jpg` (Símbolo / Ícone Isolado):** Apenas o livro aberto e a pena/chama em *"L"*. Aplicado como ícone do PWA (`manifest.json`), favicon, selo de cabeçalho mobile e modal de boas-vindas.
* **`/letra.jpg` (Logotipo Tipográfico / Wordmark):** Apenas a escrita **LIViON** com a chama âmbar sobre o *"i"*. Aplicado em barras superiores e assinaturas horizontais.

### 5.2. Paleta de Cores Psicodinâmica (Letras & Leitura)

| Papel no Sistema | Nome da Cor | Código HEX | Tokens Auxiliares | Aplicação e Justificativa Psicológica / Funcional |
| --- | --- | --- | --- | --- |
| **1. Cor Primária (Identidade)** | **Índigo Acadêmico** | `#1E1B4B` / `#312E81` | Hover: `#3730A3` / Borda: `#4338CA` | **Cabeçalhos, barras de navegação e estrutura:** Substitui o azul elétrico por um azul-violeta noturno profundo. Remete à sabedoria das Ciências Humanas, serenidade e foco mental. |
| **2. Cor de Ação / Destaque (CTA)** | **Âmbar Literário (Chama)** | `#F59E0B` / `#EA580C` | Brilho: `#FBBF24` / Superfície: `#78350F` | **Botões principais (CTAs), progresso, notificações e Chama da Ofensiva (Streak):** Harmoniza com o *"L"* e a pena da logo, representando a iluminação do conhecimento e o calor humano. |
| **3. Cor Secundária (Vitrines)** | **Violeta Humanidades** | `#6D28D9` | Claro: `#8B5CF6` / Profundo: `#4C1D95` | **Insígnias de nível, medalhas, selos de conquista e Destaques da Livion:** Referência direta à cor simbólica clássica do curso de Letras e às páginas inferiores da logo. |
| **4. Fundo Modo Claro (Papel)** | **Creme Papiro (Warm White)** | `#FAF8F5` | Card: `#F3EFE6` / Borda: `#E5DEC9` | **Superfície principal e fundo de leitura no modo claro:** **Regra estrita:** NUNCA utilizar branco puro (`#FFFFFF`) no fundo para evitar ofuscamento ocular. Simula o papel *Pólen Soft* de livros físicos. |
| **5. Fundo Modo Escuro** | **Tinta Noturna (Ink Dark)** | `#0F172A` | Card: `#162038` / Elevado: `#1E293B` | **Superfície principal no modo escuro:** **Regra estrita:** NUNCA utilizar preto absoluto (`#000000`). Azul-ardósia profundo para leitura noturna confortável sem halation. |
| **6. Texto Principal** | **Grafite Literário** | `#1E293B` | Secundário: `#475569` / No Escuro: `#FAF8F5` | **Tipografia de leitura, títulos e corpos de texto:** Imita a tinta impressa no papel Pólen no modo claro (e Papiro Suave `#FAF8F5` sobre Tinta Noturna no modo escuro), garantindo leitura longa sem fadiga ocular. |


