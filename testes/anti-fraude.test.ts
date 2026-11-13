import { describe, expect, it } from 'vitest';

describe('Motor Anti-Fraude de Leitura Ativa (RN04)', () => {
  it('deve calcular T_min com base na densidade de palavras W_p e velocidade máxima', () => {
    // Algoritmo canônico: T_min = max(tempoMinimo, min(tempoMaximo, ceil((palavras / velMaxPpm) * 60)))
    const calcularTmin = (
      totalPalavras: number,
      velMaxPpm = 350,
      tMinPiso = 5,
      tMaxTeto = 60
    ): number => {
      if (totalPalavras <= 0) return tMinPiso;
      const tCalculado = Math.ceil((totalPalavras / velMaxPpm) * 60);
      return Math.max(tMinPiso, Math.min(tMaxTeto, tCalculado));
    };

    // Página vazia ou com 0 palavras -> Piso mínimo de 5 segundos
    expect(calcularTmin(0)).toBe(5);

    // Página curta (20 palavras): (20 / 350) * 60 = 3.42s -> limitado ao piso de 5s
    expect(calcularTmin(20)).toBe(5);

    // Página média (120 palavras): (120 / 350) * 60 = 20.57s -> arredonda para cima (21s)
    expect(calcularTmin(120)).toBe(21);

    // Página densa (300 palavras): (300 / 350) * 60 = 51.42s -> 52s
    expect(calcularTmin(300)).toBe(52);

    // Página hiper-densa (600 palavras): excede o teto -> limitado a 60s
    expect(calcularTmin(600)).toBe(60);
  });

  it('deve desvalidar página se o tempo ativo for inferior ao T_min', () => {
    const validarPagina = (
      tempoNaPaginaSeg: number,
      tMinSeg: number
    ): boolean => {
      return tempoNaPaginaSeg >= tMinSeg;
    };

    expect(validarPagina(4, 5)).toBe(false);
    expect(validarPagina(5, 5)).toBe(true);
    expect(validarPagina(14, 15)).toBe(false);
    expect(validarPagina(15, 15)).toBe(true);
    expect(validarPagina(20, 15)).toBe(true);
  });

  it('deve disparar pausa por ociosidade aos 120s de inatividade física', () => {
    const checarOciosidade = (
      segundosSemInteracao: number,
      limiteOciosidade = 120
    ): boolean => {
      return segundosSemInteracao >= limiteOciosidade;
    };

    expect(checarOciosidade(60)).toBe(false);
    expect(checarOciosidade(119)).toBe(false);
    expect(checarOciosidade(120)).toBe(true);
    expect(checarOciosidade(150)).toBe(true);
  });
});

