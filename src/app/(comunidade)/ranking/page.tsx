'use client';

import { useEffect, useState } from 'react';
import {
  Award,
  Crown,
  Flame,
  Medal,
  Sparkles,
  Trophy,
} from 'lucide-react';
import type {
  GamCampeaoSemanal,
  ItemMuralConstancia,
  ItemRankingSemanal,
  UsrPerfil,
} from '@/infra/supabase/tipos-banco';
import {
  listarCampeoesSemanaisPodio,
  obterMuralDeConstancia,
  obterRankingLigaDaSemana,
} from '@/modulos/gam/servico-gamificacao';
import {
  obterPerfilCacheadoSincrono,
  obterPerfilUsuarioAtual,
} from '@/modulos/usr/servico-usuario';

export default function PaginaDuploRankingComunidade() {
  const [abaAtiva, setAbaAtiva] = useState<'liga_semana' | 'mural_constancia'>(
    'liga_semana'
  );
  const [perfil, setPerfil] = useState<UsrPerfil | null>(() =>
    obterPerfilCacheadoSincrono()
  );
  const [rankingSemanal, setRankingSemanal] = useState<ItemRankingSemanal[]>([]);
  const [muralConstancia, setMuralConstancia] = useState<ItemMuralConstancia[]>(
    []
  );
  const [campeoesSemanais, setCampeoesSemanais] = useState<GamCampeaoSemanal[]>(
    []
  );

  useEffect(() => {
    let ativo = true;
    const carregarRankings = async () => {
      const [per, sem, mur, camp] = await Promise.all([
        obterPerfilUsuarioAtual(),
        obterRankingLigaDaSemana(),
        obterMuralDeConstancia(),
        listarCampeoesSemanaisPodio(),
      ]);
      if (!ativo) return;
      setPerfil(per);
      setRankingSemanal(sem);
      setMuralConstancia(mur);
      setCampeoesSemanais(camp);
    };
    void carregarRankings();
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <div className="animar-surgir w-full pb-4">
      <main className="w-full space-y-7 px-5 pt-5 pb-8">
        {/* Cabeçalho da Comunidade */}
        <section className="space-y-3.5">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-extrabold text-livion-texto">
              <Trophy className="h-5 w-5 text-[#F59E0B]" />
              <span>Ranking da Comunidade</span>
            </h1>
            <p className="text-xs text-livion-secundario">
              Nova rodada toda segunda-feira para todos competirem juntos
            </p>
          </div>

          {/* Seletor das 2 Abas */}
          <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-livion-borda bg-livion-card p-1">
            <button
              type="button"
              onClick={() => setAbaAtiva('liga_semana')}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition ${
                abaAtiva === 'liga_semana'
                  ? 'bg-[#6D28D9] text-[#FAF8F5] shadow-sm'
                  : 'text-livion-secundario hover:text-livion-texto'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Liga da Semana</span>
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva('mural_constancia')}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition ${
                abaAtiva === 'mural_constancia'
                  ? 'bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-[#0F172A] shadow-sm'
                  : 'text-livion-secundario hover:text-livion-texto'
              }`}
            >
              <Flame className="h-3.5 w-3.5" />
              <span>Constância</span>
            </button>
          </div>
        </section>

        {/* PÓDIO DA ÚLTIMA SEMANA */}
        {abaAtiva === 'liga_semana' && campeoesSemanais.length > 0 && (
          <section className="rounded-3xl border border-[#F59E0B]/35 bg-livion-card p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-xs font-bold text-[#EA580C]">
                <Crown className="h-4 w-4 text-[#F59E0B]" />
                <span>Pódio da Última Semana</span>
              </h2>
              <span className="text-[10px] text-livion-secundario">
                {campeoesSemanais[0]?.cam_data_inicio_semana}
              </span>
            </div>

            <div className="space-y-3">
              {campeoesSemanais.map((cam) => {
                const coresPodio: Record<1 | 2 | 3, string> = {
                  1: 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300',
                  2: 'border-slate-400/40 bg-slate-500/10 text-livion-texto',
                  3: 'border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-300',
                };
                return (
                  <div
                    key={cam.cam_id}
                    className={`flex items-center justify-between rounded-2xl border p-3.5 ${
                      coresPodio[cam.cam_posicao_podio]
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Medal className="h-5 w-5 shrink-0" />
                      <div>
                        <div className="text-xs font-bold">
                          {cam.cam_posicao_podio}º Lugar •{' '}
                          {cam.usr_perfis?.per_nome_exibicao}
                        </div>
                        <div className="text-[10px] opacity-80">
                          @{cam.usr_perfis?.per_apelido}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-bold">
                      {cam.cam_xp_acumulado_semana} XP
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ABA 1: LIGA DA SEMANA */}
        {abaAtiva === 'liga_semana' ? (
          <section className="space-y-3.5">
            {rankingSemanal.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-livion-borda bg-livion-card p-6 text-center">
                <Trophy className="mx-auto mb-2 h-7 w-7 text-[#F59E0B]" />
                <h3 className="text-sm font-bold text-livion-texto">
                  A Liga da Semana está começando
                </h3>
                <p className="mt-1 text-xs text-livion-secundario">
                  Abra um livro na sua estante e leia pelo menos 1 minuto para
                  estrear o placar!
                </p>
              </div>
            ) : (
              rankingSemanal.map((item) => {
                const ehUsuarioAtual = item.per_id === perfil?.per_id;
                return (
                  <div
                    key={item.per_id}
                    className={`flex items-center justify-between rounded-3xl border p-4 shadow-sm transition ${
                      ehUsuarioAtual
                        ? 'border-[#F59E0B] bg-[#F59E0B]/10'
                        : 'border-livion-borda bg-livion-card'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold ${
                          item.posicao === 1
                            ? 'bg-amber-400 text-slate-950'
                            : item.posicao === 2
                            ? 'bg-slate-300 text-slate-950'
                            : item.posicao === 3
                            ? 'bg-orange-400 text-slate-950'
                            : 'bg-livion-elevado text-livion-secundario'
                        }`}
                      >
                        {item.posicao}º
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-bold text-livion-texto">
                            {item.per_nome_exibicao}
                          </span>
                          {ehUsuarioAtual && (
                            <span className="rounded-full bg-[#F59E0B]/20 px-2 py-0.5 text-[10px] font-bold text-[#EA580C]">
                              Você
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-livion-secundario">
                          <span className="flex items-center gap-1 font-semibold text-[#6D28D9]">
                            <Award className="h-3 w-3" />
                            Nív. {item.per_niv_numero}
                          </span>
                          <span>• {item.minutos_semana} min</span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm font-extrabold text-livion-texto">
                        {item.xp_semana.toLocaleString('pt-BR')} XP
                      </div>
                      <div className="flex items-center justify-end gap-1 text-[11px] font-semibold text-[#EA580C]">
                        <Flame className="h-3 w-3 fill-[#F59E0B]" />
                        <span>{item.per_ofensiva_atual}d</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        ) : (
          /* ABA 2: MURAL DE CONSTÂNCIA */
          <section className="space-y-3.5">
            {muralConstancia.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-livion-borda bg-livion-card p-6 text-center">
                <Flame className="mx-auto mb-2 h-7 w-7 text-[#F59E0B]" />
                <h3 className="text-sm font-bold text-livion-texto">
                  Mural aguardando os primeiros leitores
                </h3>
                <p className="mt-1 text-xs text-livion-secundario">
                  Mantenha sua meta diária em dia para aparecer no topo da
                  constância.
                </p>
              </div>
            ) : (
              muralConstancia.map((item) => {
                const ehUsuarioAtual = item.per_id === perfil?.per_id;
                return (
                  <div
                    key={item.per_id}
                    className={`flex items-center justify-between rounded-3xl border p-4 shadow-sm transition ${
                      ehUsuarioAtual
                        ? 'border-[#F59E0B] bg-[#F59E0B]/10'
                        : 'border-livion-borda bg-livion-card'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold ${
                          item.posicao <= 3
                            ? 'bg-[#F59E0B] text-[#0F172A]'
                            : 'bg-livion-elevado text-livion-secundario'
                        }`}
                      >
                        {item.posicao}º
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-livion-texto">
                          {item.per_nome_exibicao}
                        </div>
                        <div className="mt-0.5 text-[11px] text-livion-secundario">
                          Recorde: {item.per_maior_ofensiva}d •{' '}
                          {item.per_xp_total.toLocaleString('pt-BR')} XP
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="flex items-center justify-end gap-1 text-sm font-extrabold text-[#EA580C]">
                        <Flame className="h-4 w-4 fill-[#F59E0B]" />
                        <span>{item.per_ofensiva_atual} dias</span>
                      </div>
                      <div className="text-[10px] text-livion-secundario">
                        Bônus{' '}
                        {item.per_ofensiva_atual >= 7
                          ? '1,5x'
                          : item.per_ofensiva_atual >= 3
                          ? '1,2x'
                          : '1,0x'}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </section>
        )}
      </main>
    </div>
  );
}
