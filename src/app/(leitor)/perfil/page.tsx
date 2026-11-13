'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Award,
  CheckCircle2,
  Flame,
  Lock,
  LogOut,
  Shield,
  Sparkles,
  Trophy,
  UserCheck,
} from 'lucide-react';
import type {
  GamConquista,
  GamNivel,
  UsrPerfil,
} from '@/infra/supabase/tipos-banco';
import {
  listarNiveisPatente,
  obterNiveisCacheadosSincronos,
} from '@/modulos/gam/servico-gamificacao';
import {
  concluirOnboardingPerfil,
  encerrarSessaoUsuario,
  listarConquistasComStatusUsuario,
  obterPerfilCacheadoSincrono,
  obterPerfilUsuarioAtual,
} from '@/modulos/usr/servico-usuario';

export default function PaginaPerfilLeitor() {
  const router = useRouter();
  const [perfil, setPerfil] = useState<UsrPerfil | null>(() =>
    obterPerfilCacheadoSincrono()
  );
  const [niveis, setNiveis] = useState<GamNivel[]>(() =>
    obterNiveisCacheadosSincronos()
  );
  const [conquistas, setConquistas] = useState<
    Array<
      GamConquista & { desbloqueada: boolean; desbloqueada_em: string | null }
    >
  >([]);

  const [apelido, setApelido] = useState(
    () => obterPerfilCacheadoSincrono()?.per_apelido ?? ''
  );
  const [nomeExibicao, setNomeExibicao] = useState(
    () => obterPerfilCacheadoSincrono()?.per_nome_exibicao ?? ''
  );
  const [metaMinutos, setMetaMinutos] = useState(
    () => obterPerfilCacheadoSincrono()?.per_meta_diaria_minutos ?? 15
  );
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      const [per, nivs, conqs] = await Promise.all([
        obterPerfilUsuarioAtual(),
        listarNiveisPatente(),
        listarConquistasComStatusUsuario(),
      ]);
      if (!ativo) return;
      if (!per) {
        router.push('/entrar');
        return;
      }
      setPerfil(per);
      setNiveis(nivs);
      setConquistas(conqs);
      setApelido(per.per_apelido ?? '');
      setNomeExibicao(per.per_nome_exibicao);
      setMetaMinutos(per.per_meta_diaria_minutos);
    };
    void carregar();
    return () => {
      ativo = false;
    };
  }, [router]);

  const sairDaConta = async () => {
    await encerrarSessaoUsuario();
    router.push('/entrar');
    router.refresh();
  };

  const salvarAlteracoesPermitidas = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    setFeedback(null);

    try {
      const atualizado = await concluirOnboardingPerfil({
        apelido,
        nomeExibicao,
        metaDiariaMinutos: metaMinutos,
      });
      setPerfil(atualizado);
      setFeedback('Suas preferências foram salvas com sucesso!');
    } finally {
      setSalvando(false);
    }
  };

  const nivelAtualObj =
    niveis.find((n) => n.niv_numero === (perfil?.per_niv_numero ?? 1)) ??
    niveis[0];
  const proximoNivelObj = niveis.find(
    (n) => n.niv_numero === (perfil?.per_niv_numero ?? 1) + 1
  );

  const xpAtual = perfil?.per_xp_total ?? 0;
  const xpBaseNivel = nivelAtualObj?.niv_xp_minimo ?? 0;
  const xpAlvoNivel = proximoNivelObj?.niv_xp_minimo ?? xpAtual + 500;
  const progressoNivel = proximoNivelObj
    ? Math.min(
        100,
        Math.round(
          ((xpAtual - xpBaseNivel) / Math.max(1, xpAlvoNivel - xpBaseNivel)) *
            100
        )
      )
    : 100;

  return (
    <div className="animar-surgir w-full pb-4">
      <main className="w-full space-y-7 px-5 pt-5 pb-8">
        {/* 1. CARTÃO DE PERFIL E PATENTE */}
        <section className="rounded-3xl border border-livion-borda bg-livion-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {perfil?.per_url_avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={perfil.per_url_avatar}
                  alt={perfil.per_nome_exibicao}
                  width={56}
                  height={56}
                  style={{ width: 56, height: 56 }}
                  className="shrink-0 rounded-2xl object-cover ring-2 ring-[#F59E0B]/50"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#6D28D9] text-xl font-extrabold text-[#FAF8F5] ring-2 ring-[#F59E0B]/50">
                  {(perfil?.per_nome_exibicao ?? 'L').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold text-livion-texto">
                  {perfil?.per_nome_exibicao}
                </h1>
                <p className="truncate text-xs text-livion-secundario">
                  @{perfil?.per_apelido ?? 'leitor'}
                </p>
                <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#6D28D9]/15 px-2.5 py-0.5 text-[11px] font-bold text-[#6D28D9]">
                  <Award className="h-3 w-3 text-[#F59E0B]" />
                  <span>
                    Nív. {perfil?.per_niv_numero ?? 1} •{' '}
                    {nivelAtualObj?.niv_titulo_patente}
                  </span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void sairDaConta()}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-300 transition hover:bg-rose-500/20"
            >
              <LogOut className="h-3.5 w-3.5 text-rose-500" />
              <span>Sair</span>
            </button>
          </div>

          {/* Barra de Progresso de Nível */}
          <div className="mt-4 rounded-2xl border border-livion-borda bg-livion-elevado/60 p-3.5">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-livion-texto">
                {xpAtual.toLocaleString('pt-BR')} XP acumulados
              </span>
              <span className="font-bold text-[#EA580C]">
                {proximoNivelObj
                  ? `Próx.: ${proximoNivelObj.niv_xp_minimo} XP`
                  : 'Patente Máxima!'}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-livion-fundo">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#6D28D9] to-[#F59E0B]"
                style={{ width: `${progressoNivel}%` }}
              />
            </div>
          </div>

          {/* Métricas em Grid 2x2 Mobile */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-livion-borda bg-livion-elevado/45 p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] text-livion-secundario">
                <Flame className="h-3.5 w-3.5 text-[#F59E0B]" />
                <span>Ofensiva atual</span>
              </div>
              <div className="mt-1 text-base font-extrabold text-livion-texto">
                {perfil?.per_ofensiva_atual ?? 0} dias
              </div>
            </div>

            <div className="rounded-2xl border border-livion-borda bg-livion-elevado/45 p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] text-livion-secundario">
                <Trophy className="h-3.5 w-3.5 text-[#EA580C]" />
                <span>Maior recorde</span>
              </div>
              <div className="mt-1 text-base font-extrabold text-livion-texto">
                {perfil?.per_maior_ofensiva ?? 0} dias
              </div>
            </div>

            <div className="rounded-2xl border border-livion-borda bg-livion-elevado/45 p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] text-livion-secundario">
                <Shield className="h-3.5 w-3.5 text-cyan-500" />
                <span>Escudos ativos</span>
              </div>
              <div className="mt-1 text-base font-extrabold text-cyan-600 dark:text-cyan-400">
                {perfil?.per_escudos_ofensiva ?? 0} / 2
              </div>
            </div>

            <div className="rounded-2xl border border-livion-borda bg-livion-elevado/45 p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] text-livion-secundario">
                <Sparkles className="h-3.5 w-3.5 text-[#6D28D9]" />
                <span>Próximo escudo</span>
              </div>
              <div className="mt-1 text-base font-extrabold text-[#6D28D9]">
                {perfil?.per_contador_dias_escudo ?? 0} / 7 dias
              </div>
            </div>
          </div>
        </section>

        {/* 2. GALERIA DE MEDALHAS */}
        <section className="rounded-3xl border border-livion-borda bg-livion-card p-5 shadow-sm">
          <div className="mb-3.5 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-1.5 text-base font-bold text-livion-texto">
                <Trophy className="h-4 w-4 text-[#F59E0B]" />
                <span>Suas Conquistas</span>
              </h2>
              <p className="text-[11px] text-livion-secundario">
                Medalhas desbloqueadas na sua jornada
              </p>
            </div>
            <span className="rounded-full bg-[#F59E0B]/15 px-2.5 py-0.5 text-xs font-bold text-[#EA580C]">
              {conquistas.filter((c) => c.desbloqueada).length} /{' '}
              {conquistas.length}
            </span>
          </div>

          <div className="space-y-3">
            {conquistas.map((c) => (
              <div
                key={c.con_id}
                className={`flex items-start gap-3.5 rounded-2xl border p-3.5 transition ${
                  c.desbloqueada
                    ? 'border-[#F59E0B]/40 bg-[#F59E0B]/10'
                    : 'border-livion-borda bg-livion-elevado/30 opacity-65'
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    c.desbloqueada
                      ? 'bg-[#F59E0B]/20 text-[#EA580C]'
                      : 'bg-livion-elevado text-livion-apoio'
                  }`}
                >
                  {c.desbloqueada ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-livion-texto">
                      {c.con_titulo}
                    </h3>
                    <span className="shrink-0 rounded-full bg-livion-elevado px-2 py-0.5 text-[10px] font-bold text-[#EA580C]">
                      +{c.con_recompensa_xp} XP
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-livion-secundario">
                    {c.con_descricao}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 3. PREFERÊNCIAS DO LEITOR */}
        <section className="rounded-3xl border border-livion-borda bg-livion-card p-5 shadow-sm">
          <h2 className="flex items-center gap-1.5 text-base font-bold text-livion-texto">
            <UserCheck className="h-4 w-4 text-[#F59E0B]" />
            <span>Preferências do Perfil</span>
          </h2>

          <form onSubmit={salvarAlteracoesPermitidas} className="mt-4 space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-semibold text-livion-secundario">
                Nome de exibição
              </label>
              <input
                type="text"
                required
                maxLength={80}
                value={nomeExibicao}
                onChange={(e) => setNomeExibicao(e.target.value)}
                className="h-10 w-full rounded-xl border border-livion-borda bg-livion-fundo px-3.5 text-sm text-livion-texto focus:border-[#F59E0B] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-livion-secundario">
                Apelido público (@)
              </label>
              <input
                type="text"
                required
                maxLength={30}
                value={apelido}
                onChange={(e) =>
                  setApelido(
                    e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
                  )
                }
                className="h-10 w-full rounded-xl border border-livion-borda bg-livion-fundo px-3.5 text-sm text-livion-texto focus:border-[#F59E0B] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-livion-secundario">
                Meta diária de leitura (em minutos)
              </label>
              <input
                type="number"
                min={5}
                max={240}
                value={metaMinutos}
                onChange={(e) => setMetaMinutos(Number(e.target.value))}
                className="h-10 w-full rounded-xl border border-livion-borda bg-livion-fundo px-3.5 text-sm text-livion-texto focus:border-[#F59E0B] focus:outline-none"
              />
            </div>

            {feedback && (
              <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                {feedback}
              </p>
            )}

            <button
              type="submit"
              disabled={salvando}
              className="flex h-11 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-xs font-bold text-[#0F172A] shadow-md transition active:scale-[0.98] disabled:opacity-50"
            >
              {salvando ? 'Salvando...' : 'Salvar preferências'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
