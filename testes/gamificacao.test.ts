import { describe, expect, it } from 'vitest';

describe('Gamificação — Regras de Negócio Livion (RN04 & RN05)', () => {
  it('deve aplicar multiplicador de ofensiva correto conforme dias consecutivos', () => {
    const calcularMultiplicador = (ofensivaDias: number): number => {
      if (ofensivaDias >= 7) return 2.0;
      if (ofensivaDias >= 3) return 1.5;
      return 1.0;
    };

    expect(calcularMultiplicador(0)).toBe(1.0);
    expect(calcularMultiplicador(1)).toBe(1.0);
    expect(calcularMultiplicador(2)).toBe(1.0);
    expect(calcularMultiplicador(3)).toBe(1.5);
    expect(calcularMultiplicador(6)).toBe(1.5);
    expect(calcularMultiplicador(7)).toBe(2.0);
    expect(calcularMultiplicador(30)).toBe(2.0);
  });

  it('deve calcular ganho de XP por pulso de 60s com multiplicador', () => {
    const calcularXpPulso = (
      paginasValidadas: number,
      multiplicador: number
    ): number => {
      const xpBaseTempo = 10;
      const xpPorPagina = 5;
      const totalBase = xpBaseTempo + paginasValidadas * xpPorPagina;
      return Math.round(totalBase * multiplicador);
    };

    // 0 páginas com 1.0x
    expect(calcularXpPulso(0, 1.0)).toBe(10);
    // 2 páginas com 1.0x (10 + 10 = 20)
    expect(calcularXpPulso(2, 1.0)).toBe(20);
    // 2 páginas com 1.5x (20 * 1.5 = 30)
    expect(calcularXpPulso(2, 1.5)).toBe(30);
    // 2 páginas com 2.0x (20 * 2.0 = 40)
    expect(calcularXpPulso(2, 2.0)).toBe(40);
  });

  it('deve limitar acúmulo de escudos de ofensiva ao teto máximo de 2', () => {
    const adicionarEscudo = (escudosAtuais: number): number => {
      return Math.min(2, escudosAtuais + 1);
    };

    expect(adicionarEscudo(0)).toBe(1);
    expect(adicionarEscudo(1)).toBe(2);
    expect(adicionarEscudo(2)).toBe(2); // Não ultrapassa o teto de 2
  });

  it('deve promover nível conforme tabela progressiva de patentes', () => {
    const niveisMock = [
      { niv_numero: 1, niv_xp_minimo: 0, niv_titulo: 'Iniciante das Letras' },
      { niv_numero: 2, niv_xp_minimo: 100, niv_titulo: 'Leitor Curioso' },
      { niv_numero: 3, niv_xp_minimo: 300, niv_titulo: 'Devorador de Páginas' },
      { niv_numero: 4, niv_xp_minimo: 700, niv_titulo: 'Erudito da Liga' },
    ];

    const calcularNivel = (xp: number): number => {
      return (
        niveisMock
          .filter((n) => n.niv_xp_minimo <= xp)
          .reduce((max, n) => Math.max(max, n.niv_numero), 1) || 1
      );
    };

    expect(calcularNivel(0)).toBe(1);
    expect(calcularNivel(99)).toBe(1);
    expect(calcularNivel(100)).toBe(2);
    expect(calcularNivel(299)).toBe(2);
    expect(calcularNivel(300)).toBe(3);
    expect(calcularNivel(1500)).toBe(4);
  });
});

