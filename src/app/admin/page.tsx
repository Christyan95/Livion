'use client';

import { useEffect, useState } from 'react';
import {
  BookPlus,
  CheckCircle2,
  Database,
  FileText,
  History,
  Layers,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type {
  CatCategoria,
  CatLivro,
  GamConquista,
  GamNivel,
  SisAuditoria,
  SisConfiguracao,
  SisDicionario,
  UsrPerfil,
} from '@/infra/supabase/tipos-banco';
import {
  buscarMetadadosLivroExterno,
  cadastrarOuAtualizarLivroAdmin,
  listarCategoriasAtivas,
  listarLivrosCatalogo,
  salvarOuAtualizarCategoriaAdmin,
  type SugestaoLivroExterno,
} from '@/modulos/cat/servico-catalogo';
import {
  listarConquistasAdmin,
  listarNiveisPatente,
  salvarConquistaAdmin,
  salvarNivelPatenteAdmin,
} from '@/modulos/gam/servico-gamificacao';
import { NavegacaoInferiorMobile } from '@/modulos/sis/NavegacaoInferiorMobile';
import {
  atualizarConfiguracaoSistema,
  atualizarDescricaoDicionario,
  listarAuditoriaSistema,
  listarConfiguracoesSistema,
  listarDicionarioDadosVivo,
  sincronizarDicionarioVivo,
} from '@/modulos/sis/servico-sistema';
import { obterPerfilUsuarioAtual } from '@/modulos/usr/servico-usuario';

type AbaAdmin = 'acervo' | 'dominios' | 'calibragem' | 'dicionario';

export default function PaginaPainelAdmin() {
  const [aba, setAba] = useState<AbaAdmin>('acervo');
  const [perfil, setPerfil] = useState<UsrPerfil | null>(null);

  // Estado Aba 1: Acervo + Auto-Fill
  const [termoAutoFill, setTermoAutoFill] = useState('');
  const [buscandoAutoFill, setBuscandoAutoFill] = useState(false);
  const [sugestoesExternas, setSugestoesExternas] = useState<
    SugestaoLivroExterno[]
  >([]);
  const [livros, setLivros] = useState<CatLivro[]>([]);
  const [categorias, setCategorias] = useState<CatCategoria[]>([]);
  const [livTitulo, setLivTitulo] = useState('');
  const [livAutor, setLivAutor] = useState('');
  const [livSinopse, setLivSinopse] = useState('');
  const [livUrlCapa, setLivUrlCapa] = useState('');
  const [livTotalPaginas, setLivTotalPaginas] = useState(48);
  const [livCatId, setLivCatId] = useState('');
  const [livDestaqueProf, setLivDestaqueProf] = useState(false);
  const [livLeituraRapida, setLivLeituraRapida] = useState(false);
  const [arquivoPdfUpload, setArquivoPdfUpload] = useState<File | null>(null);

  // Estado Aba 2: Domínios
  const [niveis, setNiveis] = useState<GamNivel[]>([]);
  const [conquistas, setConquistas] = useState<GamConquista[]>([]);
  const [novaCatNome, setNovaCatNome] = useState('');
  const [novoNivNumero, setNovoNivNumero] = useState(11);
  const [novoNivTitulo, setNovoNivTitulo] = useState('');
  const [novoNivXp, setNovoNivXp] = useState(25000);
  const [novaConCodigo, setNovaConCodigo] = useState('');
  const [novaConTitulo, setNovaConTitulo] = useState('');
  const [novaConDescricao, setNovaConDescricao] = useState('');
  const [novaConXp, setNovaConXp] = useState(80);

  // Estado Aba 3: Calibragem & Auditoria
  const [configuracoes, setConfiguracoes] = useState<SisConfiguracao[]>([]);
  const [auditorias, setAuditorias] = useState<SisAuditoria[]>([]);
  const [valoresEdicaoCfg, setValoresEdicaoCfg] = useState<
    Record<string, string>
  >({});

  // Estado Aba 4: Dicionário de Dados Vivo (sis_dicionario)
  const [dicionario, setDicionario] = useState<SisDicionario[]>([]);
  const [filtroDominioDic, setFiltroDominioDic] = useState<string>('todos');
  const [buscaColunaDic, setBuscaColunaDic] = useState('');
  const [descricoesEdicaoDic, setDescricoesEdicaoDic] = useState<
    Record<string, string>
  >({});

  const [mensagemAdmin, setMensagemAdmin] = useState<string | null>(null);

  useEffect(() => {
    const carregarPainel = async () => {
      const [per, livs, cats, nivs, conqs, cfgs, auds, dics] =
        await Promise.all([
          obterPerfilUsuarioAtual(),
          listarLivrosCatalogo(true),
          listarCategoriasAtivas(true),
          listarNiveisPatente(),
          listarConquistasAdmin(),
          listarConfiguracoesSistema(),
          listarAuditoriaSistema(),
          listarDicionarioDadosVivo(),
        ]);

      setPerfil(per);
      setLivros(livs);
      setCategorias(cats);
      if (cats[0]) setLivCatId(cats[0].cat_id);
      setNiveis(nivs);
      setConquistas(conqs);
      setConfiguracoes(cfgs);
      setAuditorias(auds);
      setDicionario(dics);

      const mapaCfg: Record<string, string> = {};
      for (const c of cfgs) {
        mapaCfg[c.cfg_chave] = String(c.cfg_valor);
      }
      setValoresEdicaoCfg(mapaCfg);

      const mapaDic: Record<string, string> = {};
      for (const d of dics) {
        mapaDic[d.dic_id] = d.dic_descricao_funcional;
      }
      setDescricoesEdicaoDic(mapaDic);
    };

    void carregarPainel();
  }, []);

  const notificar = (msg: string) => {
    setMensagemAdmin(msg);
    window.setTimeout(() => setMensagemAdmin(null), 4000);
  };

  // RN07.1: Auto-Fill via Google Books / Open Library / Gutendex
  const executarAutoFill = async () => {
    if (!termoAutoFill.trim()) return;
    setBuscandoAutoFill(true);
    try {
      const resultados = await buscarMetadadosLivroExterno(termoAutoFill);
      setSugestoesExternas(resultados);
      if (resultados.length === 0) {
        notificar('Nenhum resultado externo encontrado para o termo informado.');
      }
    } finally {
      setBuscandoAutoFill(false);
    }
  };

  const aplicarSugestaoNoFormulario = (sug: SugestaoLivroExterno) => {
    setLivTitulo(sug.titulo);
    setLivAutor(sug.autor);
    setLivSinopse(sug.sinopse);
    setLivTotalPaginas(sug.totalPaginas);
    setLivUrlCapa(sug.urlCapa ?? '');
    setSugestoesExternas([]);
    notificar(
      `Auto-Fill aplicado via ${sug.fonte}: "${sug.titulo}" (${sug.autor}).`
    );
  };

  const salvarNovoLivroCatalogo = async (e: React.FormEvent) => {
    e.preventDefault();
    const atualizados = await cadastrarOuAtualizarLivroAdmin(
      {
        liv_cat_id: livCatId || null,
        liv_titulo: livTitulo,
        liv_autor: livAutor,
        liv_sinopse: livSinopse,
        liv_url_capa: livUrlCapa || null,
        liv_total_paginas: Number(livTotalPaginas) || 30,
        liv_destaque_professora: livDestaqueProf,
        liv_leitura_rapida: livLeituraRapida,
        liv_publicado: true,
      },
      arquivoPdfUpload
    );
    setLivros(atualizados);
    setAuditorias(await listarAuditoriaSistema());
    setLivTitulo('');
    setLivAutor('');
    setLivSinopse('');
    setLivUrlCapa('');
    setArquivoPdfUpload(null);
    notificar('Obra publicada no acervo curado e registrada em sis_auditoria!');
  };

  const salvarCalibragemParametro = async (cfgChave: string) => {
    const bruto = valoresEdicaoCfg[cfgChave] ?? '0';
    const num = Number(bruto);
    const valorFinal = Number.isNaN(num) ? bruto : num;
    const novas = await atualizarConfiguracaoSistema(cfgChave, valorFinal);
    setConfiguracoes(novas);
    setAuditorias(await listarAuditoriaSistema());
    notificar(
      `Parâmetro "${cfgChave}" calibrado para ${String(
        valorFinal
      )} e registrado em sis_auditoria!`
    );
  };

  const salvarDescricaoColunaDicionario = async (dicId: string) => {
    const desc = descricoesEdicaoDic[dicId] ?? '';
    const atualizados = await atualizarDescricaoDicionario(dicId, desc);
    setDicionario(atualizados);
    notificar('Descrição funcional da coluna atualizada em sis_dicionario!');
  };

  const dicionarioFiltrado = dicionario.filter((item) => {
    const bateDominio =
      filtroDominioDic === 'todos' ||
      item.dic_tabela.startsWith(filtroDominioDic);
    const bateBusca =
      !buscaColunaDic.trim() ||
      item.dic_tabela.toLowerCase().includes(buscaColunaDic.toLowerCase()) ||
      item.dic_coluna.toLowerCase().includes(buscaColunaDic.toLowerCase()) ||
      item.dic_descricao_funcional
        .toLowerCase()
        .includes(buscaColunaDic.toLowerCase());
    return bateDominio && bateBusca;
  });

  return (
    <div className="min-h-screen pb-28">
      <NavegacaoInferiorMobile perfil={perfil} />

      <main className="mx-auto max-w-5xl space-y-6 px-4 pt-6">
        {/* Cabeçalho do Painel Admin (RN07) */}
        <section className="rounded-3xl border border-indigo-500/30 bg-slate-900/90 p-6 shadow-xl">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-bold text-indigo-300">
                <ShieldAlert className="h-3.5 w-3.5" />
                Acesso Restrito: per_papel = &apos;admin&apos; (RN07)
              </span>
              <h1 className="mt-2 text-2xl font-extrabold text-white">
                Painel de Governança, Acervo e Dicionário Vivo
              </h1>
              <p className="mt-1 text-xs text-slate-400">
                Todas as mutações administrativas geram trilha forense automática em sis_auditoria
              </p>
            </div>
          </div>

          {mensagemAdmin && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-500/35 bg-emerald-500/15 px-4 py-3 text-xs font-semibold text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>{mensagemAdmin}</span>
            </div>
          )}

          {/* Navegação das 4 Sub-Abas do Admin */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setAba('acervo')}
              className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold transition ${
                aba === 'acervo'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <BookPlus className="h-4 w-4" />
              <span>1. Acervo Auto-Fill</span>
            </button>

            <button
              type="button"
              onClick={() => setAba('dominios')}
              className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold transition ${
                aba === 'dominios'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="h-4 w-4" />
              <span>2. Categorias & Níveis</span>
            </button>

            <button
              type="button"
              onClick={() => setAba('calibragem')}
              className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold transition ${
                aba === 'calibragem'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>3. Motor XP & Auditoria</span>
            </button>

            <button
              type="button"
              onClick={() => setAba('dicionario')}
              className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold transition ${
                aba === 'dicionario'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              <Database className="h-4 w-4" />
              <span>4. Dicionário Vivo</span>
            </button>
          </div>
        </section>

        {/* ================================================================
            ABA 1: GESTÃO DE ACERVO COM AUTO-FILL (RN07.1)
           ================================================================ */}
        {aba === 'acervo' && (
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <Sparkles className="h-5 w-5 text-amber-400" />
                Auto-Fill Inteligente (Google Books / Open Library / Gutendex)
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Digite o título ou autor para preencher automaticamente capa, autor, sinopse e número de páginas.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={termoAutoFill}
                  onChange={(e) => setTermoAutoFill(e.target.value)}
                  placeholder="Ex: Memórias Póstumas de Brás Cubas, Quincas Borba..."
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500"
                />
                <button
                  type="button"
                  onClick={() => void executarAutoFill()}
                  disabled={buscandoAutoFill}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  <Search className="h-4 w-4" />
                  <span>
                    {buscandoAutoFill
                      ? 'Consultando APIs...'
                      : 'Buscar Metadados'}
                  </span>
                </button>
              </div>

              {sugestoesExternas.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {sugestoesExternas.map((sug, idx) => (
                    <div
                      key={`${sug.titulo}-${idx}`}
                      className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-950/80 p-3.5"
                    >
                      <div>
                        <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
                          {sug.fonte}
                        </span>
                        <h3 className="mt-1 text-sm font-bold text-white">
                          {sug.titulo}
                        </h3>
                        <p className="text-xs text-slate-400">
                          {sug.autor} • {sug.totalPaginas} págs
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                          {sug.sinopse}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => aplicarSugestaoNoFormulario(sug)}
                        className="mt-3 rounded-xl bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-500"
                      >
                        Preencher Formulário com Esta Obra
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Formulário de Cadastro em cat_livros */}
              <form
                onSubmit={salvarNovoLivroCatalogo}
                className="mt-6 space-y-4 border-t border-slate-800 pt-6"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">
                      Título da Obra (liv_titulo)
                    </label>
                    <input
                      type="text"
                      required
                      value={livTitulo}
                      onChange={(e) => setLivTitulo(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">
                      Autor (liv_autor)
                    </label>
                    <input
                      type="text"
                      required
                      value={livAutor}
                      onChange={(e) => setLivAutor(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">
                      Categoria (liv_cat_id)
                    </label>
                    <select
                      value={livCatId}
                      onChange={(e) => setLivCatId(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
                    >
                      {categorias.map((c) => (
                        <option key={c.cat_id} value={c.cat_id}>
                          {c.cat_nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">
                      Total de Páginas (liv_total_paginas)
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={livTotalPaginas}
                      onChange={(e) =>
                        setLivTotalPaginas(Number(e.target.value))
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">
                      URL da Capa (liv_url_capa)
                    </label>
                    <input
                      type="text"
                      value={livUrlCapa}
                      onChange={(e) => setLivUrlCapa(e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Sinopse (liv_sinopse)
                  </label>
                  <textarea
                    rows={3}
                    value={livSinopse}
                    onChange={(e) => setLivSinopse(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm text-white"
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-300">
                      Upload do PDF para Supabase Storage (acervo-pdfs)
                    </label>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) =>
                        setArquivoPdfUpload(e.target.files?.[0] ?? null)
                      }
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300"
                    />
                  </div>

                  <div className="flex flex-col justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                    <label className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                      <input
                        type="checkbox"
                        checked={livDestaqueProf}
                        onChange={(e) => setLivDestaqueProf(e.target.checked)}
                        className="rounded border-slate-700 accent-amber-500"
                      />
                      <span>
                        Destaque da Livion (liv_destaque_professora)
                      </span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                      <input
                        type="checkbox"
                        checked={livLeituraRapida}
                        onChange={(e) => setLivLeituraRapida(e.target.checked)}
                        className="rounded border-slate-700 accent-emerald-500"
                      />
                      <span>
                        Trilha Leitura Rápida 15 min (liv_leitura_rapida)
                      </span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500"
                >
                  <FileText className="h-4 w-4" />
                  <span>Publicar Obra no Catálogo Público (cat_livros)</span>
                </button>
              </form>
            </section>

            {/* Lista de Obras no Acervo */}
            <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
              <h3 className="mb-3 text-base font-bold text-white">
                Obras Cadastradas em cat_livros ({livros.length})
              </h3>
              <div className="space-y-2.5">
                {livros.map((l) => (
                  <div
                    key={l.liv_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs"
                  >
                    <div>
                      <span className="font-bold text-white">
                        {l.liv_titulo}
                      </span>{' '}
                      <span className="text-slate-400">
                        — {l.liv_autor} ({l.liv_total_paginas} págs)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {l.liv_destaque_professora && (
                        <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                          Destaque Livion
                        </span>
                      )}
                      {l.liv_leitura_rapida && (
                        <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                          Leitura Rápida
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ================================================================
            ABA 2: GESTÃO DINÂMICA DE TABELAS DE DOMÍNIO (RN07.2)
           ================================================================ */}
        {aba === 'dominios' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Categorias (cat_categorias) */}
            <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
              <h2 className="text-base font-bold text-white">
                Categorias (cat_categorias)
              </h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!novaCatNome.trim()) return;
                  const novas = await salvarOuAtualizarCategoriaAdmin({
                    cat_nome: novaCatNome.trim(),
                  });
                  setCategorias(novas);
                  setNovaCatNome('');
                  notificar('Categoria adicionada em cat_categorias!');
                }}
                className="mt-3 flex gap-2"
              >
                <input
                  type="text"
                  required
                  placeholder="Nova categoria..."
                  value={novaCatNome}
                  onChange={(e) => setNovaCatNome(e.target.value)}
                  className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white"
                >
                  Criar
                </button>
              </form>
              <div className="mt-4 space-y-2">
                {categorias.map((c) => (
                  <div
                    key={c.cat_id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-slate-200">
                      {c.cat_ordem_exibicao}. {c.cat_nome}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      /{c.cat_slug}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Patentes de Nível (gam_niveis) */}
            <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
              <h2 className="text-base font-bold text-white">
                Patentes (gam_niveis)
              </h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!novoNivTitulo.trim()) return;
                  const novos = await salvarNivelPatenteAdmin({
                    niv_numero: Number(novoNivNumero),
                    niv_titulo_patente: novoNivTitulo.trim(),
                    niv_xp_minimo: Number(novoNivXp),
                    niv_icone_insignia: 'Award',
                  });
                  setNiveis(novos);
                  setNovoNivNumero(novos.length + 1);
                  setNovoNivTitulo('');
                  notificar('Patente atualizada em gam_niveis!');
                }}
                className="mt-3 space-y-2"
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={1}
                    value={novoNivNumero}
                    onChange={(e) => setNovoNivNumero(Number(e.target.value))}
                    placeholder="Nível #"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="number"
                    min={0}
                    value={novoNivXp}
                    onChange={(e) => setNovoNivXp(Number(e.target.value))}
                    placeholder="XP Mínimo"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Título da patente..."
                    value={novoNivTitulo}
                    onChange={(e) => setNovoNivTitulo(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white"
                  >
                    Salvar
                  </button>
                </div>
              </form>
              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                {niveis.map((n) => (
                  <div
                    key={n.niv_numero}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs"
                  >
                    <span className="font-semibold text-slate-200">
                      Nív. {n.niv_numero} — {n.niv_titulo_patente}
                    </span>
                    <span className="font-bold text-indigo-400">
                      {n.niv_xp_minimo} XP
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* Conquistas (gam_conquistas) */}
            <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-5">
              <h2 className="text-base font-bold text-white">
                Medalhas (gam_conquistas)
              </h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!novaConCodigo.trim() || !novaConTitulo.trim()) return;
                  const novas = await salvarConquistaAdmin({
                    con_codigo: novaConCodigo,
                    con_titulo: novaConTitulo,
                    con_descricao:
                      novaConDescricao || 'Conquista especial da comunidade.',
                    con_recompensa_xp: Number(novaConXp),
                  });
                  setConquistas(novas);
                  setNovaConCodigo('');
                  setNovaConTitulo('');
                  setNovaConDescricao('');
                  notificar('Conquista salva em gam_conquistas!');
                }}
                className="mt-3 space-y-2"
              >
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="CÓDIGO_UNICO"
                    value={novaConCodigo}
                    onChange={(e) => setNovaConCodigo(e.target.value)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="number"
                    min={0}
                    value={novaConXp}
                    onChange={(e) => setNovaConXp(Number(e.target.value))}
                    placeholder="XP Bônus"
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </div>
                <input
                  type="text"
                  required
                  placeholder="Título da conquista..."
                  value={novaConTitulo}
                  onChange={(e) => setNovaConTitulo(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Descrição..."
                    value={novaConDescricao}
                    onChange={(e) => setNovaConDescricao(e.target.value)}
                    className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white"
                  >
                    Salvar
                  </button>
                </div>
              </form>
              <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                {conquistas.map((c) => (
                  <div
                    key={c.con_id}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs"
                  >
                    <div className="flex justify-between font-bold text-white">
                      <span>{c.con_titulo}</span>
                      <span className="text-amber-300">
                        +{c.con_recompensa_xp} XP
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {c.con_codigo} — {c.con_descricao}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ================================================================
            ABA 3: CALIBRAGEM DO MOTOR (sis_configuracoes) E AUDITORIA (RN07.3)
           ================================================================ */}
        {aba === 'calibragem' && (
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <Settings className="h-5 w-5 text-indigo-400" />
                Calibragem em Tempo Real (sis_configuracoes)
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Ajuste pesos de XP, limite máximo de palavras por minuto (PPM) e travas de ociosidade.
              </p>

              <div className="mt-4 space-y-3">
                {configuracoes.map((cfg) => (
                  <div
                    key={cfg.cfg_chave}
                    className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 sm:flex-row sm:items-center"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-bold text-indigo-300">
                          {cfg.cfg_chave}
                        </code>
                        <span className="text-[11px] text-slate-500">
                          ({cfg.cfg_tipo_dado})
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-300">
                        {cfg.cfg_descricao}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={valoresEdicaoCfg[cfg.cfg_chave] ?? ''}
                        onChange={(e) =>
                          setValoresEdicaoCfg((prev) => ({
                            ...prev,
                            [cfg.cfg_chave]: e.target.value,
                          }))
                        }
                        className="w-28 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-center text-sm font-bold text-white"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void salvarCalibragemParametro(cfg.cfg_chave)
                        }
                        className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Trilha Forense em sis_auditoria */}
            <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                <History className="h-5 w-5 text-amber-400" />
                Trilha Forense de Auditoria (sis_auditoria)
              </h2>
              <div className="mt-4 space-y-2.5">
                {auditorias.map((aud) => (
                  <div
                    key={aud.aud_id}
                    className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-amber-300">
                        [{aud.aud_acao}] Tabela: {aud.aud_tabela_afetada}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {new Date(aud.aud_criado_em).toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="mt-1.5 font-mono text-[11px] text-slate-300">
                      Novo valor: {JSON.stringify(aud.aud_valor_novo)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ================================================================
            ABA 4: EXPLORADOR DO DICIONÁRIO DE DADOS VIVO (sis_dicionario — RN07.4)
           ================================================================ */}
        {aba === 'dicionario' && (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                  <Database className="h-5 w-5 text-indigo-400" />
                  Dicionário de Dados Vivo (sis_dicionario)
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Sincronizado com pg_catalog / information_schema e com descrições funcionais editáveis ao vivo.
                </p>
              </div>

              <button
                type="button"
                onClick={async () => {
                  const total = await sincronizarDicionarioVivo();
                  notificar(
                    `Sincronização concluída via rpc_sis_sincronizar_dicionario (${total} colunas catalogadas).`
                  );
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-4 py-2.5 text-xs font-bold text-indigo-300 hover:bg-indigo-500/25"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Sincronizar com pg_catalog</span>
              </button>
            </div>

            {/* Filtros por Domínio (sis_, cat_, usr_, gam_) e Busca */}
            <div className="mt-5 flex flex-col justify-between gap-3 sm:flex-row">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'todos', nome: 'Todos os Domínios' },
                  { id: 'sis_', nome: 'sis_ (Sistema)' },
                  { id: 'cat_', nome: 'cat_ (Catálogo)' },
                  { id: 'usr_', nome: 'usr_ (Usuários)' },
                  { id: 'gam_', nome: 'gam_ (Gamificação)' },
                ].map((dom) => (
                  <button
                    key={dom.id}
                    type="button"
                    onClick={() => setFiltroDominioDic(dom.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      filtroDominioDic === dom.id
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    {dom.nome}
                  </button>
                ))}
              </div>

              <input
                type="text"
                placeholder="Filtrar tabela, coluna ou descrição..."
                value={buscaColunaDic}
                onChange={(e) => setBuscaColunaDic(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white"
              />
            </div>

            <div className="mt-5 space-y-3">
              {dicionarioFiltrado.map((item) => (
                <div
                  key={item.dic_id}
                  className="rounded-2xl border border-slate-800 bg-slate-950/75 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-indigo-500/20 px-2.5 py-0.5 font-mono text-xs font-bold text-indigo-300">
                        livion.{item.dic_tabela}.{item.dic_coluna}
                      </span>
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                        {item.dic_tipo_dado}
                      </span>
                      {item.dic_obrigatorio && (
                        <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                          NOT NULL
                        </span>
                      )}
                      {item.dic_valor_padrao && (
                        <span className="font-mono text-[11px] text-slate-400">
                          DEFAULT: {item.dic_valor_padrao}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={descricoesEdicaoDic[item.dic_id] ?? ''}
                      onChange={(e) =>
                        setDescricoesEdicaoDic((prev) => ({
                          ...prev,
                          [item.dic_id]: e.target.value,
                        }))
                      }
                      disabled={!item.dic_editavel_admin}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void salvarDescricaoColunaDicionario(item.dic_id)
                      }
                      className="rounded-xl bg-indigo-600/25 px-4 py-2 text-xs font-bold text-indigo-300 hover:bg-indigo-600 hover:text-white"
                    >
                      Atualizar Documentação
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

