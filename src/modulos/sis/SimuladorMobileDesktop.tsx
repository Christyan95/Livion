'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Battery, Wifi } from 'lucide-react';
import type { UsrPerfil } from '@/infra/supabase/tipos-banco';
import {
  obterPerfilCacheadoSincrono,
  obterPerfilUsuarioAtual,
} from '@/modulos/usr/servico-usuario';
import { NavegacaoInferiorMobile } from './NavegacaoInferiorMobile';

interface PropsSimulador {
  children: React.ReactNode;
}

export function SimuladorMobileDesktop({ children }: PropsSimulador) {
  const pathname = usePathname();
  const [horaAtual, setHoraAtual] = useState('09:41');
  const [perfil, setPerfil] = useState<UsrPerfil | null>(null);

  const ocultarCromoNavegacao =
    pathname.startsWith('/boas-vindas') ||
    pathname.startsWith('/entrar') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/ler/');

  useEffect(() => {
    const atualizarHora = () => {
      const agora = new Date();
      const horas = String(agora.getHours()).padStart(2, '0');
      const minutos = String(agora.getMinutes()).padStart(2, '0');
      setHoraAtual(`${horas}:${minutos}`);
    };
    atualizarHora();
    const intervalo = setInterval(atualizarHora, 1000 * 30);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (ocultarCromoNavegacao) return;

    const emCache = obterPerfilCacheadoSincrono();
    if (emCache) {
      setPerfil(emCache);
    }

    let ativo = true;
    void obterPerfilUsuarioAtual().then((per) => {
      if (ativo && per) {
        setPerfil(per);
      }
    });

    const aoAtualizarPerfil = (evento: Event) => {
      const custom = evento as CustomEvent<UsrPerfil>;
      if (custom.detail) {
        setPerfil(custom.detail);
      }
    };

    window.addEventListener('livion:perfil-atualizado', aoAtualizarPerfil);
    return () => {
      ativo = false;
      window.removeEventListener('livion:perfil-atualizado', aoAtualizarPerfil);
    };
  }, [ocultarCromoNavegacao, pathname]);

  return (
    <div className="flex h-dvh w-screen items-center justify-center overflow-hidden bg-[#080C16] select-none md:p-4">
      {/* =====================================================================
          CHASSI DO DISPOSITIVO
          - No celular real (< md): 100% da largura e altura da tela (h-dvh w-full),
            sem bordas simuladas e respeitando safe-area nativa.
          - No computador (>= md): Mockup de smartphone 390x812px centralizado,
            sem nenhum conteúdo externo ao redor.
         ===================================================================== */}
      <div className="relative flex h-full w-full flex-col bg-livion-fundo text-livion-texto select-text md:h-[min(812px,calc(100dvh-32px))] md:w-[390px] md:rounded-[48px] md:border-[10px] md:border-[#1E293B] md:shadow-[0_25px_70px_-15px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.07)]">
        {/* Botões laterais físicos (apenas no mockup desktop) */}
        <div className="pointer-events-none absolute -left-[13px] top-24 hidden h-8 w-[3px] rounded-l bg-slate-700/80 md:block" />
        <div className="pointer-events-none absolute -left-[13px] top-36 hidden h-12 w-[3px] rounded-l bg-slate-700/80 md:block" />
        <div className="pointer-events-none absolute -right-[13px] top-28 hidden h-14 w-[3px] rounded-r bg-slate-700/80 md:block" />

        {/* Status Bar Superior (apenas no mockup desktop) */}
        <div className="relative z-40 hidden h-9 w-full shrink-0 select-none items-center justify-between bg-[#0F172A] px-6 pt-1 text-slate-200 md:flex md:rounded-t-[38px]">
          <span className="w-12 text-left text-[11px] font-semibold tracking-tight">
            {horaAtual}
          </span>

          <div className="flex h-4 w-20 items-center justify-end rounded-full bg-black px-2">
            <span className="h-2 w-2 rounded-full bg-[#0F172A] ring-1 ring-slate-800" />
          </div>

          <div className="flex w-12 items-center justify-end gap-1.5 text-slate-300">
            <Wifi className="h-3 w-3" />
            <Battery className="h-3.5 w-3.5" />
          </div>
        </div>

        {/* ===================================================================
            VIEWPORT DO APP (#livion-viewport)
            Possui flex-col e overflow-hidden:
            1. Topo fixo (Header)
            2. Miolo rolável independente (#livion-scroll com flex-1 min-h-0)
            3. Rodapé dedicado para a Barra Flutuante (sem sobrepor o conteúdo!)
           =================================================================== */}
        <div
          id="livion-viewport"
          className="relative flex flex-1 min-h-0 w-full flex-col overflow-hidden bg-livion-fundo text-livion-texto [transform:translateZ(0)]"
        >
          <NavegacaoInferiorMobile
            perfil={perfil}
            modoRenderizacao="cabecalho"
          />

          <div
            id="livion-scroll"
            className="no-scrollbar flex flex-1 min-h-0 w-full flex-col overflow-y-auto overflow-x-hidden"
          >
            {children}
          </div>

          <NavegacaoInferiorMobile perfil={perfil} modoRenderizacao="dock" />
        </div>

        {/* Barra de Gestos Inferior (Home Indicator — apenas no mockup desktop) */}
        <div className="relative z-40 hidden h-4 w-full shrink-0 items-center justify-center bg-[#0F172A] md:flex md:rounded-b-[38px]">
          <div className="h-1 w-28 rounded-full bg-slate-500/40" />
        </div>
      </div>
    </div>
  );
}
