'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ResultadoPulsoLeitura } from '@/infra/supabase/tipos-banco';
import {
  obterSegundosLidosHojeLocal,
  paginaEstaEmCooldown24hLocal,
  registrarPulsoLeituraAtiva,
} from './servico-gamificacao';

export type EstadoCronometroLeitura =
  | 'ATIVO'
  | 'PAUSADO_OCIOSIDADE'
  | 'PAUSADO_FOCO';

export interface OpcoesMotorLeituraAtiva {
  bibId: string;
  paginaAtual: number;
  tempoMinimoPaginaSeg: number;
  tempoLimiteOciosidadeSeg?: number;
  intervaloPulsoSeg?: number;
  aoReceberResultadoPulso?: (resultado: ResultadoPulsoLeitura) => void;
}

export function useMotorLeituraAtiva({
  bibId,
  paginaAtual,
  tempoMinimoPaginaSeg,
  tempoLimiteOciosidadeSeg = 120,
  intervaloPulsoSeg = 60,
  aoReceberResultadoPulso,
}: OpcoesMotorLeituraAtiva) {
  const [estadoCronometro, setEstadoCronometro] =
    useState<EstadoCronometroLeitura>('ATIVO');
  const [segundosNaPagina, setSegundosNaPagina] = useState(0);
  const [segundosNoPulsoAtual, setSegundosNoPulsoAtual] = useState(0);
  const [segundosTotaisHoje, setSegundosTotaisHoje] = useState<number>(() =>
    obterSegundosLidosHojeLocal()
  );
  const [paginaAtualValidada, setPaginaAtualValidada] = useState(false);
  const [emCooldown24h, setEmCooldown24h] = useState(false);
  const [paginasValidadasNoPulso, setPaginasValidadasNoPulso] = useState<number[]>([]);
  const [sincronizandoPulso, setSincronizandoPulso] = useState(false);
  const [ultimoResultadoPulso, setUltimoResultadoPulso] =
    useState<ResultadoPulsoLeitura | null>(null);

  const segundosSemInteracaoRef = useRef(0);
  const filaPaginasValidadasRef = useRef<Set<number>>(new Set());
  const paginaAtualRef = useRef(paginaAtual);
  const enviandoPulsoRef = useRef(false);

  // Atualiza referência e reinicia o cronômetro de permanência na página a cada virada
  useEffect(() => {
    paginaAtualRef.current = paginaAtual;
    segundosSemInteracaoRef.current = 0;
    setSegundosNaPagina(0);
    const jaEmCooldown = paginaEstaEmCooldown24hLocal(bibId, paginaAtual);
    setEmCooldown24h(jaEmCooldown);
    setPaginaAtualValidada(filaPaginasValidadasRef.current.has(paginaAtual));

    setEstadoCronometro((atual) =>
      atual === 'PAUSADO_OCIOSIDADE' ? 'ATIVO' : atual
    );
  }, [bibId, paginaAtual]);

  // RN04.4: Bloqueio imediato por perda de foco (visibilityState === 'hidden')
  useEffect(() => {
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'hidden') {
        setEstadoCronometro('PAUSADO_FOCO');
      } else {
        segundosSemInteracaoRef.current = 0;
        setEstadoCronometro('ATIVO');
      }
    };

    const aoPerderFocoJanela = () => {
      if (document.visibilityState === 'hidden') {
        setEstadoCronometro('PAUSADO_FOCO');
      }
    };

    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    window.addEventListener('blur', aoPerderFocoJanela);

    return () => {
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      window.removeEventListener('blur', aoPerderFocoJanela);
    };
  }, []);

  // RN04.3: Monitoramento de interações físicas (touchstart, scroll, zoom, click)
  const registrarInteracaoFisica = useCallback(() => {
    segundosSemInteracaoRef.current = 0;
    setEstadoCronometro((atual) =>
      atual === 'PAUSADO_OCIOSIDADE' ? 'ATIVO' : atual
    );
  }, []);

  useEffect(() => {
    const eventos: Array<keyof WindowEventMap> = [
      'touchstart',
      'scroll',
      'wheel',
      'keydown',
      'click',
    ];

    for (const ev of eventos) {
      window.addEventListener(ev, registrarInteracaoFisica, { passive: true });
    }

    return () => {
      for (const ev of eventos) {
        window.removeEventListener(ev, registrarInteracaoFisica);
      }
    };
  }, [registrarInteracaoFisica]);

  // Função para disparar pulso de sincronização ao banco (Seção 4.2)
  const dispararPulsoSincronizacao = useCallback(
    async (segundosParaEnviar: number) => {
      if (enviandoPulsoRef.current || segundosParaEnviar < 5) return;
      enviandoPulsoRef.current = true;
      setSincronizandoPulso(true);

      const paginasLote = Array.from(filaPaginasValidadasRef.current);
      filaPaginasValidadasRef.current.clear();
      setPaginasValidadasNoPulso([]);

      try {
        const resultado = await registrarPulsoLeituraAtiva({
          bibId,
          segundosAtivos: segundosParaEnviar,
          paginaAtual: paginaAtualRef.current,
          paginasValidadas: paginasLote,
        });

        setUltimoResultadoPulso(resultado);
        setSegundosTotaisHoje(resultado.segundos_hoje);
        if (aoReceberResultadoPulso) {
          aoReceberResultadoPulso(resultado);
        }
      } catch {
        // Caso o intervalo físico de 45s bloqueie um pulso precoce, mantém contagem
      } finally {
        enviandoPulsoRef.current = false;
        setSincronizandoPulso(false);
      }
    },
    [aoReceberResultadoPulso, bibId]
  );

  // Tick de 1 segundo do Motor Anti-Fraude
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') {
        setEstadoCronometro('PAUSADO_FOCO');
        return;
      }

      if (estadoCronometro !== 'ATIVO') {
        return;
      }

      segundosSemInteracaoRef.current += 1;

      // RN04.3: Se atingir 120s na mesma página sem interação física, pausa!
      if (segundosSemInteracaoRef.current >= tempoLimiteOciosidadeSeg) {
        setEstadoCronometro('PAUSADO_OCIOSIDADE');
        return;
      }

      setSegundosNaPagina((prev) => {
        const novoTempoPagina = prev + 1;
        // RN04.2: Valida a página quando cumpre T_min e não está em cooldown de 24h
        if (
          novoTempoPagina >= tempoMinimoPaginaSeg &&
          !paginaEstaEmCooldown24hLocal(bibId, paginaAtualRef.current)
        ) {
          filaPaginasValidadasRef.current.add(paginaAtualRef.current);
          setPaginaAtualValidada(true);
          setPaginasValidadasNoPulso(Array.from(filaPaginasValidadasRef.current));
        }
        return novoTempoPagina;
      });

      setSegundosTotaisHoje((prev) => prev + 1);

      setSegundosNoPulsoAtual((prev) => {
        const proximo = prev + 1;
        if (proximo >= intervaloPulsoSeg) {
          void dispararPulsoSincronizacao(intervaloPulsoSeg);
          return 0;
        }
        return proximo;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    bibId,
    dispararPulsoSincronizacao,
    estadoCronometro,
    intervaloPulsoSeg,
    tempoLimiteOciosidadeSeg,
    tempoMinimoPaginaSeg,
  ]);

  return {
    estadoCronometro,
    segundosNaPagina,
    segundosNoPulsoAtual,
    segundosTotaisHoje,
    paginaAtualValidada,
    emCooldown24h,
    paginasValidadasNoPulso,
    sincronizandoPulso,
    ultimoResultadoPulso,
    retomarDeOciosidade: registrarInteracaoFisica,
    forcarSincronizacaoAoSair: () => {
      if (segundosNoPulsoAtual >= 45) {
        void dispararPulsoSincronizacao(segundosNoPulsoAtual);
      }
    },
  };
}

