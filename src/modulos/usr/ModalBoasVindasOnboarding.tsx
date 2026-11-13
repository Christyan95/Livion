'use client';

import { useState } from 'react';
import { CheckCircle2, Flame, User } from 'lucide-react';
import type { UsrPerfil } from '@/infra/supabase/tipos-banco';
import { concluirOnboardingPerfil } from './servico-usuario';

interface PropsModalOnboarding {
  perfil: UsrPerfil;
  aoConcluir: (perfilAtualizado: UsrPerfil) => void;
}

const METAS_INICIAIS = [
  {
    minutos: 10,
    titulo: '10 min / dia',
    subtitulo: 'Hábito leve — ideal para começar no seu ritmo',
  },
  {
    minutos: 15,
    titulo: '15 min / dia',
    subtitulo: 'Recomendado — equilíbrio ideal de constância',
  },
  {
    minutos: 30,
    titulo: '30 min / dia',
    subtitulo: 'Imersão intensa — para devorar capítulos',
  },
];

export function ModalBoasVindasOnboarding({
  perfil,
  aoConcluir,
}: PropsModalOnboarding) {
  const [apelido, setApelido] = useState(perfil.per_apelido ?? '');
  const [nomeExibicao, setNomeExibicao] = useState(
    perfil.per_nome_exibicao ?? ''
  );
  const [metaMinutos, setMetaMinutos] = useState<number>(
    [10, 15, 30].includes(perfil.per_meta_diaria_minutos)
      ? perfil.per_meta_diaria_minutos
      : 15
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpo = apelido
      .toLowerCase()
      .trim()
      .replace(/^@/, '')
      .replace(/[^a-z0-9_]/g, '_');

    if (limpo.length < 3) {
      setErro(
        'Escolha um @apelido com pelo menos 3 caracteres (letras, números ou _).'
      );
      return;
    }

    setErro(null);
    setSalvando(true);
    try {
      const atualizado = await concluirOnboardingPerfil({
        apelido: limpo,
        nomeExibicao: nomeExibicao.trim() || 'Leitor Livion',
        metaDiariaMinutos: metaMinutos,
      });
      aoConcluir(atualizado);
    } catch {
      setErro(
        'Não foi possível salvar seu perfil. Verifique se este @apelido já está em uso.'
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-3xl border border-livion-borda bg-livion-card p-5 text-livion-texto shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/marca/icone-192.png"
            alt="Livion"
            width={44}
            height={44}
            style={{ width: 44, height: 44 }}
            className="shrink-0 object-contain"
          />
          <div>
            <h2 className="text-base font-bold text-livion-texto">
              Personalize seu perfil
            </h2>
            <p className="text-xs text-livion-secundario">
              Escolha seu @apelido na comunidade e sua meta diária
            </p>
          </div>
        </div>

        <form onSubmit={submeter} className="space-y-3.5">
          <div>
            <label className="mb-1 block text-xs font-semibold text-livion-secundario">
              Nome de exibição
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3 h-4 w-4 text-livion-apoio" />
              <input
                type="text"
                required
                maxLength={80}
                value={nomeExibicao}
                onChange={(e) => setNomeExibicao(e.target.value)}
                placeholder="Como você quer ser chamado?"
                className="h-10 w-full rounded-xl border border-livion-borda bg-livion-fundo pl-10 pr-3 text-sm text-livion-texto placeholder-livion-apoio focus:border-[#F59E0B] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-livion-secundario">
              Seu @apelido na comunidade
            </label>
            <div className="flex h-10 items-center rounded-xl border border-livion-borda bg-livion-fundo px-3.5 focus-within:border-[#F59E0B]">
              <span className="mr-1 font-bold text-[#F59E0B]">@</span>
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
                placeholder="ex: leitor_machado"
                className="w-full bg-transparent text-sm text-livion-texto placeholder-livion-apoio focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-livion-secundario">
              Meta diária de leitura
            </label>
            <div className="space-y-2">
              {METAS_INICIAIS.map((opcao) => {
                const selecionada = metaMinutos === opcao.minutos;
                return (
                  <button
                    key={opcao.minutos}
                    type="button"
                    onClick={() => setMetaMinutos(opcao.minutos)}
                    className={`flex w-full items-center justify-between rounded-2xl border p-3 text-left transition-all ${
                      selecionada
                        ? 'border-[#F59E0B] bg-[#F59E0B]/15 text-livion-texto'
                        : 'border-livion-borda bg-livion-fundo text-livion-secundario hover:border-[#F59E0B]/40'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Flame
                        className={`h-4 w-4 shrink-0 ${
                          selecionada ? 'text-[#F59E0B]' : 'text-livion-apoio'
                        }`}
                      />
                      <div>
                        <div className="text-xs font-bold">{opcao.titulo}</div>
                        <div className="text-[11px] text-livion-secundario">
                          {opcao.subtitulo}
                        </div>
                      </div>
                    </div>
                    {selecionada && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#EA580C]" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {erro && (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={salvando}
            className="flex h-11 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-[#F59E0B] to-[#EA580C] text-sm font-bold text-[#0F172A] shadow-lg shadow-[#EA580C]/25 transition active:scale-[0.98] disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Começar jornada literária'}
          </button>
        </form>
      </div>
    </div>
  );
}
