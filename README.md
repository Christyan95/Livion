# Livion — Plataforma Social Gamificada de Leitura (PWA Mobile-First)

Plataforma social de incentivo à leitura construída com **Next.js (App Router, TypeScript)**, **Tailwind CSS**, **Mozilla PDF.js (Web Worker isolado)**, **IndexedDB (`idb`)** e **Supabase (PostgreSQL 15+, Auth, Storage, RLS Restritivo e Stored Procedures PL/pgSQL)**.

---

## 1. Estrutura Arquitetural Espelhada nos 4 Domínios

```text
Livion/
├── docs/
│   └── PRD_SRS.md                                 # Documento Mestre de Especificação Oficial
├── supabase/
│   └── migrations/
│       ├── 001_schema_ddl_dominios.sql            # DDL completo (sis_, cat_, usr_, gam_) + Storage Buckets
│       ├── 002_rls_triggers_seguranca.sql         # RLS Intransponível + Triggers de Onboarding/Blindagem/Auditoria
│       ├── 003_rpcs_motor_gamificacao.sql         # RPCs PL/pgSQL (Pulso 60s, Manutenção Cron, Dicionário Vivo, Rankings)
│       └── 004_seeds_iniciais_dicionario.sql      # Carga inicial de parâmetros, patentes, conquistas e acervo
├── public/
│   ├── manifest.json                              # Manifesto PWA Mobile-First
│   ├── sw.js                                      # Service Worker para App Shell offline
│   └── icon.svg                                   # Ícone vetorial da plataforma
├── src/
│   ├── app/
│   │   ├── (autenticacao)/
│   │   │   ├── entrar/page.tsx                    # Login Google (1-clique) e E-mail/Senha (RN01)
│   │   │   └── auth/callback/route.ts             # Callback OAuth2 Supabase
│   │   ├── (leitor)/
│   │   │   ├── page.tsx                           # Estante Híbrida, Meta Diária, Importação PDF Local e Vitrines
│   │   │   ├── ler/[bibId]/page.tsx               # Leitor Imersivo PDF.js + HUD Retrátil + Motor Anti-Fraude
│   │   │   └── perfil/page.tsx                    # Patente, Ofensiva, Escudos e Conquistas Desbloqueadas
│   │   ├── (comunidade)/
│   │   │   └── ranking/page.tsx                   # Duplo Ranking: Liga da Semana & Mural de Constância (RN06)
│   │   ├── admin/page.tsx                         # Painel Admin: Auto-Fill, Domínios, Calibragem e Dicionário Vivo (RN07)
│   │   └── api/cron/manutencao/route.ts           # Rota protegida (Bearer CRON_SECRET) para Vercel Cron Job
│   ├── modulos/
│   │   ├── sis/                                   # Configurações dinâmicas, Auditoria e Dicionário Vivo
│   │   ├── cat/                                   # Catálogo público, Google Books, Open Library e Gutendex API
│   │   ├── usr/                                   # Onboarding único, Perfil e Estante Híbrida (SHA-256 + Capa WebP)
│   │   └── gam/                                   # Hook useMotorLeituraAtiva (T_min, Ociosidade 120s, Foco) e Rankings
│   ├── infra/
│   │   ├── supabase/                              # Clientes Browser/Server/ServiceRole + Tipagem estrita
│   │   ├── indexeddb/                             # Persistência binária offline via idb + Memória Invisível
│   │   └── pdf-worker/                            # Wrapper seguro do pdfjs-dist (Anti-XSS + Hash SHA-256 + WebP)
│   └── middleware.ts                              # Guard de sessão e proteção da rota /admin
└── vercel.json                                    # Agendamento diário do Cron Job (/api/cron/manutencao)
```

---

## 2. Como Executar o Banco de Dados no Supabase (Schema `livion`)

Todos os objetos de banco de dados (tabelas, views, constraints, triggers, políticas RLS e RPCs) estão isolados no schema dedicado **`livion`**, e todos os clientes da aplicação (`cliente-navegador.ts`, `cliente-servidor.ts` e `middleware.ts`) já estão configurados com `db: { schema: 'livion' }`.

1. No painel do Supabase, acesse **Project Settings -> API -> Data API Settings** e adicione **`livion`** na lista de **Exposed schemas** (junto com `public`, `storage`).
2. Execute os 4 arquivos de migração em ordem no **SQL Editor** do seu projeto Supabase (ou via Supabase CLI `supabase db push`):

1. `supabase/migrations/001_schema_ddl_dominios.sql`
2. `supabase/migrations/002_rls_triggers_seguranca.sql`
3. `supabase/migrations/003_rpcs_motor_gamificacao.sql`
4. `supabase/migrations/004_seeds_iniciais_dicionario.sql`

---

## 3. Como Executar Localmente

1. Copie `.env.example` para `.env.local` e preencha as chaves do seu projeto Supabase (ou rode imediatamente sem chaves para utilizar o **Modo Interativo Local** pré-carregado):
   ```bash
   cp .env.example .env.local
   ```
2. Instale as dependências e inicie o servidor de desenvolvimento:
   ```bash
   npm install
   npm run dev
   ```
3. Valide a tipagem e o build de produção:
   ```bash
   npm run typecheck
   npm run build
   ```

