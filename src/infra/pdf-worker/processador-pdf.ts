// ============================================================================
// LIVION — INFRAESTRUTURA SEGURA DE PDF.JS, HASH SHA-256 E CAPA WEBP
// Seção 4.3: isEvalSupported: false | enableScripting: false (Anti-XSS)
// RN02.2   : Hash SHA-256 local + Geração de Capa WebP na Página 1
// RN04.1/2 : Extração de Densidade de Palavras (W_p) e Cálculo de T_min
// ============================================================================

export interface MetadadosPdfExtraidos {
  hashSha256: string;
  totalPaginas: number;
  tituloDetectado: string;
  autorDetectado: string;
  capaWebpDataUrl: string | null;
  tamanhoBytes: number;
}

export interface ResultadoRenderizacaoPagina {
  numeroPagina: number;
  totalPaginas: number;
  totalPalavras: number;
  tempoMinimoSegundos: number;
  textoExtraido: string;
}

const VERSAO_PDFJS = '3.11.174';

async function carregarPdfJs() {
  const pdfjsLib = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${VERSAO_PDFJS}/pdf.worker.min.js`;
  }
  return pdfjsLib;
}

/**
 * RN02.2: Calcula o hash SHA-256 (64 caracteres hex) do binário do PDF local.
 * Permite reconhecer o mesmo arquivo em outro dispositivo sem enviá-lo à nuvem.
 */
export async function calcularHashSha256Pdf(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * RN04.2: Fórmula oficial do Tempo Mínimo de Permanência na Página (T_min)
 * T_min = clamp(W_p / (velocidadeMaximaPpm / 60), minimoSeg, maximoSeg)
 * Padrão: 350 PPM = 5,8333 palavras/segundo, piso 5s, teto 60s.
 */
export function calcularTempoMinimoPagina(
  palavrasNaPagina: number,
  velocidadeMaximaPpm = 350,
  tempoMinimoSeg = 5,
  tempoMaximoSeg = 60
): number {
  const palavrasPorSegundo = Math.max(1, velocidadeMaximaPpm) / 60;
  const tempoCalculado = palavrasNaPagina / palavrasPorSegundo;
  return Math.round(
    Math.min(tempoMaximoSeg, Math.max(tempoMinimoSeg, tempoCalculado))
  );
}

export function contarPalavrasTexto(texto: string): number {
  const limpo = texto.trim();
  if (!limpo) return 0;
  return limpo.split(/\s+/).filter((palavra) => palavra.length > 0).length;
}

/**
 * Abre um ArrayBuffer PDF com blindagem Anti-XSS (isEvalSupported: false, enableScripting: false)
 */
export async function abrirDocumentoPdfSeguro(buffer: ArrayBuffer) {
  const pdfjsLib = await carregarPdfJs();
  // Clona o buffer pois o Web Worker transfere o ArrayBuffer ao processar
  const copiaSegura = buffer.slice(0);

  const parametrosSeguros = {
    data: new Uint8Array(copiaSegura),
    isEvalSupported: false,
    enableScripting: false,
  };

  const loadingTask = pdfjsLib.getDocument(
    parametrosSeguros as Parameters<typeof pdfjsLib.getDocument>[0]
  );
  return loadingTask.promise;
}

/**
 * RN02.2: Ao importar um PDF local, calcula o SHA-256, conta o total de páginas
 * e renderiza a Página 1 em formato WebP comprimido para a capa na estante.
 */
export async function extrairMetadadosECapaPdfLocal(
  arquivo: File
): Promise<{ buffer: ArrayBuffer; metadados: MetadadosPdfExtraidos }> {
  const buffer = await arquivo.arrayBuffer();
  const hashSha256 = await calcularHashSha256Pdf(buffer);
  const pdfDoc = await abrirDocumentoPdfSeguro(buffer);

  let tituloDetectado = arquivo.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
  let autorDetectado = 'Acervo Pessoal do Leitor';

  try {
    const meta = await pdfDoc.getMetadata();
    const info = meta?.info as Record<string, unknown> | undefined;
    if (info?.Title && typeof info.Title === 'string' && info.Title.trim().length > 2) {
      tituloDetectado = info.Title.trim();
    }
    if (info?.Author && typeof info.Author === 'string' && info.Author.trim().length > 1) {
      autorDetectado = info.Author.trim();
    }
  } catch {
    // Metadados opcionais ausentes no PDF
  }

  let capaWebpDataUrl: string | null = null;
  try {
    const pagina1 = await pdfDoc.getPage(1);
    const viewportBase = pagina1.getViewport({ scale: 1 });
    const larguraAlvo = 360;
    const escala = larguraAlvo / Math.max(1, viewportBase.width);
    const viewport = pagina1.getViewport({ scale: escala });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');

    if (ctx) {
      await pagina1.render({
        canvasContext: ctx,
        viewport,
      }).promise;
      capaWebpDataUrl = canvas.toDataURL('image/webp', 0.82);
    }
  } catch {
    capaWebpDataUrl = null;
  }

  return {
    buffer,
    metadados: {
      hashSha256,
      totalPaginas: pdfDoc.numPages,
      tituloDetectado,
      autorDetectado,
      capaWebpDataUrl,
      tamanhoBytes: arquivo.size,
    },
  };
}

/**
 * Renderiza uma página específica do PDF em um elemento <canvas> responsivo
 * e extrai simultaneamente a densidade de palavras (W_p) para o motor anti-fraude.
 */
export async function renderizarPaginaPdfNoCanvas(params: {
  buffer: ArrayBuffer;
  numeroPagina: number;
  canvas: HTMLCanvasElement;
  larguraContainerPx: number;
  velocidadeMaximaPpm?: number;
  tempoMinimoSeg?: number;
  tempoMaximoSeg?: number;
}): Promise<ResultadoRenderizacaoPagina> {
  const {
    buffer,
    numeroPagina,
    canvas,
    larguraContainerPx,
    velocidadeMaximaPpm = 350,
    tempoMinimoSeg = 5,
    tempoMaximoSeg = 60,
  } = params;

  const pdfDoc = await abrirDocumentoPdfSeguro(buffer);
  const numPaginas = pdfDoc.numPages;
  const paginaSegura = Math.min(Math.max(1, numeroPagina), numPaginas);

  const pagina = await pdfDoc.getPage(paginaSegura);
  const viewportBase = pagina.getViewport({ scale: 1 });
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const larguraUtil = Math.max(300, Math.min(larguraContainerPx, 820));
  const escalaCss = larguraUtil / Math.max(1, viewportBase.width);
  const viewport = pagina.getViewport({ scale: escalaCss * dpr });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    await pagina.render({
      canvasContext: ctx,
      viewport,
    }).promise;
  }

  // Extrai o texto da página para calcular W_p (RN04.1)
  let textoExtraido = '';
  try {
    const textContent = await pagina.getTextContent();
    textoExtraido = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
  } catch {
    textoExtraido = '';
  }

  const totalPalavras = contarPalavrasTexto(textoExtraido);
  const tempoMinimoSegundos = calcularTempoMinimoPagina(
    totalPalavras,
    velocidadeMaximaPpm,
    tempoMinimoSeg,
    tempoMaximoSeg
  );

  return {
    numeroPagina: paginaSegura,
    totalPaginas: numPaginas,
    totalPalavras,
    tempoMinimoSegundos,
    textoExtraido,
  };
}

/**
 * Gera um binário PDF 1.4 válido em memória para as obras de domínio público
 * do acervo demonstrativo, garantindo funcionamento imediato do pdf.js e
 * cálculo real de densidade de palavras (W_p) mesmo 100% offline.
 */
export function gerarPdfLiterarioDemo(
  titulo: string,
  autor: string,
  totalPaginas = 12
): ArrayBuffer {
  const trechosClassicos = [
    'Hamlet observa a Horacio que ha mais cousas no ceu e na terra do que sonha a nossa filosofia. Era a mesma explicacao que dava a bela Rita ao moço Camilo, numa sexta-feira de novembro de 1869, quando este ria dela, por ter ido na vespera consultar uma cartomante; a diferenca e que o fazia por outras palavras.',
    'Ria, ria. Os homens sao assim; nao acreditam em nada. Pois saiba que fui, e que ela adivinhou o motivo da consulta, antes mesmo que eu lhe dissesse o que era. Apenas começou a botar as cartas, disse-me: A senhora gosta de uma pessoa. Confessei que sim, e entao ela continuou a botar as cartas, combinou-as, e no fim declarou-me que eu tinha medo de que voce me esquecesse, mas que nao era verdade.',
    'As cronicas da vila de Itaguai dizem que em tempos remotos vivera ali um certo medico, o doutor Simao Bacamarte, filho da nobreza da terra e o maior dos medicos do Brasil, de Portugal e das Espanhas. Estudara em Coimbra e Padua; aos trinta e quatro anos regressou ao Brasil, nao podendo el-rei alcançar dele que ficasse em Coimbra, regendo a universidade, ou em Lisboa, expedindo os negocios da monarquia.',
    'A ciencia, disse ele a Sua Majestade, e o meu emprego unico; Itaguai e o meu universo. Dito isto, meteu-se em Itaguai, e entregou-se de corpo e alma ao estudo da ciencia, alternando as curas com as leituras, e demonstrando os teoremas com cataplasmas. Aos quarenta anos casou com D. Evarista da Costa e Mascarenhas, senhora de vinte e cinco anos, viuva de um juiz de fora.',
    'Uma noite destas, vindo da cidade para o Engenho Novo, encontrei no trem da Central um rapaz aqui do bairro, que eu conheço de vista e de chapeu. Cumprimentou-me, sentou-se ao pe de mim, falou da Lua e dos ministros, e acabou recitando-me versos. A viagem era curta, e os versos pode ser que nao fossem inteiramente maus. Sucedeu, porem, que, como eu estava cansado, fechei os olhos tres ou quatro vezes; tanto bastou para que ele interrompesse a leitura.',
    'Nunca pude entender a conversacao que tive com uma senhora, ha muitos anos, contava eu dezessete, ela trinta. Era noite de Natal. Havendo ajustado com um vizinho irmos a missa do galo, preferi nao dormir; combinei que eu iria acordar o vizinho a meia-noite. A casa em que eu estava hospedado era a do escrivao Meneses, que fora casado, em primeiras nupcias, com uma de minhas primas.',
  ];

  const escaparPdf = (str: string) =>
    str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[()\\]/g, '');

  const objetos: string[] = [];
  // Objeto 1: Catalog
  objetos.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

  // Objeto 3: Font Helvetica
  const idFonte = 3;
  const idsPaginas: number[] = [];
  let proximoId = 4;

  const conteudosPaginas: Array<{ idPag: number; idStream: number; stream: string }> = [];

  for (let p = 1; p <= totalPaginas; p++) {
    const idPag = proximoId++;
    const idStream = proximoId++;
    idsPaginas.push(idPag);

    const paragrafo1 = trechosClassicos[(p - 1) % trechosClassicos.length];
    const paragrafo2 = trechosClassicos[p % trechosClassicos.length];
    const paragrafo3 = trechosClassicos[(p + 1) % trechosClassicos.length];

    const quebrarLinhas = (texto: string, maxChars = 68): string[] => {
      const palavras = escaparPdf(texto).split(' ');
      const linhas: string[] = [];
      let atual = '';
      for (const pal of palavras) {
        if ((atual + ' ' + pal).trim().length > maxChars) {
          linhas.push(atual.trim());
          atual = pal;
        } else {
          atual = (atual + ' ' + pal).trim();
        }
      }
      if (atual.trim()) linhas.push(atual.trim());
      return linhas;
    };

    const linhasStream: string[] = [
      'BT',
      '/F1 10 Tf',
      '54 780 Td',
      `(LIVION ACERVO PUBLICO - ${escaparPdf(titulo.toUpperCase())}) Tj`,
      '0 -18 Td',
      '/F1 9 Tf',
      `(Autor: ${escaparPdf(autor)}   |   Pagina ${p} de ${totalPaginas}) Tj`,
      '0 -32 Td',
      '/F1 12 Tf',
    ];

    const todasLinhas = [
      ...quebrarLinhas(paragrafo1),
      '',
      ...quebrarLinhas(paragrafo2),
      '',
      ...quebrarLinhas(paragrafo3),
    ];

    for (const linha of todasLinhas) {
      linhasStream.push(`(${linha}) Tj`);
      linhasStream.push('0 -18 Td');
    }

    linhasStream.push('0 -24 Td');
    linhasStream.push('/F1 9 Tf');
    linhasStream.push(
      `(Leitura ativa monitorada pelo motor Livion - Pagina ${p} de ${totalPaginas}) Tj`
    );
    linhasStream.push('ET');

    const streamTexto = linhasStream.join('\n');
    conteudosPaginas.push({ idPag, idStream, stream: streamTexto });
  }

  // Objeto 2: Pages
  const kidsRefs = idsPaginas.map((id) => `${id} 0 R`).join(' ');
  objetos.push(
    `2 0 obj\n<< /Type /Pages /Kids [${kidsRefs}] /Count ${totalPaginas} >>\nendobj`
  );
  objetos.push(
    `${idFonte} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`
  );

  for (const item of conteudosPaginas) {
    objetos.push(
      `${item.idPag} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${idFonte} 0 R >> >> /Contents ${item.idStream} 0 R >>\nendobj`
    );
    objetos.push(
      `${item.idStream} 0 obj\n<< /Length ${item.stream.length} >>\nstream\n${item.stream}\nendstream\nendobj`
    );
  }

  let pdfString = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objetos) {
    offsets.push(pdfString.length);
    pdfString += obj + '\n';
  }

  const xrefOffset = pdfString.length;
  pdfString += `xref\n0 ${objetos.length + 1}\n`;
  pdfString += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdfString += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdfString += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const encoder = new TextEncoder();
  return encoder.encode(pdfString).buffer;
}

