/**
 * Utilidades geométricas para "escanear" una foto de comprobante: marcar las
 * 4 esquinas del papel sobre la foto y enderezarlo (corrección de
 * perspectiva), como hace la app de Notas del iPhone. Todo corre en el
 * navegador, sin librerías externas.
 *
 * Los puntos se manejan normalizados (0..1 respecto del ancho/alto de la
 * imagen) para que no dependan del tamaño con que se muestra en pantalla.
 */

export interface Point {
  x: number;
  y: number;
}

/** Esquinas en orden: arriba-izquierda, arriba-derecha, abajo-derecha, abajo-izquierda. */
export type Quad = [Point, Point, Point, Point];

/** Recuadro por defecto (5% de margen) cuando no se detecta nada. */
export const DEFAULT_QUAD: Quad = [
  { x: 0.05, y: 0.05 },
  { x: 0.95, y: 0.05 },
  { x: 0.95, y: 0.95 },
  { x: 0.05, y: 0.95 },
];

export const FULL_QUAD: Quad = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

/** Gira los puntos de un quad 90° en sentido horario (junto con la imagen), manteniendo el orden arriba-izq → abajo-izq. */
export function rotateQuadClockwise(q: Quad): Quad {
  // Un punto (x, y) de la imagen original pasa a (1 - y, x) en la girada.
  const r = q.map((p) => ({ x: 1 - p.y, y: p.x }));
  // La que era abajo-izquierda pasa a ser arriba-izquierda, y así.
  return [r[3], r[0], r[1], r[2]];
}

/**
 * Resuelve el sistema lineal A·x = b (Gauss con pivoteo parcial). Devuelve
 * null si el sistema es singular (ej. 3 esquinas alineadas).
 */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Homografía (matriz 3x3, aplanada en 9 valores con h[8] = 1) que lleva cada
 * punto `from[i]` a `to[i]`. Se usa "al revés": de cada píxel del resultado
 * enderezado, a qué punto de la foto original corresponde.
 */
export function computeHomography(from: Quad, to: Quad): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  return h ? [...h, 1] : null;
}

export function applyHomography(h: number[], p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / w, y: (h[3] * p.x + h[4] * p.y + h[5]) / w };
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Área (con signo positivo) del cuadrilátero, en las mismas unidades que los puntos. */
export function quadArea(q: Quad): number {
  let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * Chequea que el cuadrilátero sea convexo y no esté "dado vuelta" (esquinas
 * cruzadas): si el usuario arrastró una esquina al otro lado, el resultado
 * enderezado no tendría sentido.
 */
export function isValidQuad(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/**
 * Tamaño del resultado enderezado, en píxeles: el lado más largo de cada par
 * de lados opuestos del cuadrilátero (medido en píxeles de la imagen), con
 * un tope para no generar imágenes enormes.
 */
export function outputSize(q: Quad, imgW: number, imgH: number, maxDim = 2000): { width: number; height: number } {
  const px = q.map((p) => ({ x: p.x * imgW, y: p.y * imgH })) as Quad;
  let width = Math.max(dist(px[0], px[1]), dist(px[3], px[2]));
  let height = Math.max(dist(px[0], px[3]), dist(px[1], px[2]));
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  return { width, height };
}

/**
 * Endereza la zona marcada por `q` (normalizado) de `source` y la devuelve
 * en un canvas nuevo, rectangular. Muestreo bilineal para que el texto no
 * quede "dentado".
 */
export function warpQuad(source: HTMLCanvasElement, q: Quad): HTMLCanvasElement {
  const srcW = source.width;
  const srcH = source.height;
  const { width, height } = outputSize(q, srcW, srcH);

  const srcQuad = q.map((p) => ({ x: p.x * (srcW - 1), y: p.y * (srcH - 1) })) as Quad;
  const dstQuad: Quad = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  // De cada píxel del resultado → punto de la foto original.
  const h = computeHomography(dstQuad, srcQuad);

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const outCtx = out.getContext("2d");
  const srcCtx = source.getContext("2d");
  if (!outCtx || !srcCtx || !h) return source;

  const src = srcCtx.getImageData(0, 0, srcW, srcH).data;
  const dst = outCtx.createImageData(width, height);
  const d = dst.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = h[6] * x + h[7] * y + h[8];
      let sx = (h[0] * x + h[1] * y + h[2]) / w;
      let sy = (h[3] * x + h[4] * y + h[5]) / w;
      sx = Math.min(srcW - 1, Math.max(0, sx));
      sy = Math.min(srcH - 1, Math.max(0, sy));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const y1 = Math.min(srcH - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bottom = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        d[o + c] = top * (1 - fy) + bottom * fy;
      }
      d[o + 3] = 255;
    }
  }
  outCtx.putImageData(dst, 0, 0);
  return out;
}

/**
 * Sugerencia automática de las 4 esquinas del comprobante. Heurística
 * casera (no es un scanner de verdad): asume que el fondo (mesa, mostrador)
 * es más o menos parejo cerca de los bordes de la foto, marca en una grilla
 * qué zonas se alejan de ese color, y toma como esquinas las celdas
 * marcadas más extremas en cada diagonal. A diferencia del recorte
 * rectangular anterior, así sigue a un ticket que quedó inclinado en la
 * foto. Si no se distingue nada claro, devuelve null.
 */
export function detectDocumentQuad(source: HTMLCanvasElement): Quad | null {
  const ANALYSIS_SIZE = 300;
  const scale = ANALYSIS_SIZE / Math.max(source.width, source.height);
  const cw = Math.max(1, Math.round(source.width * scale));
  const ch = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, cw, ch);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, cw, ch).data;
  } catch {
    return null;
  }
  const idx = (x: number, y: number) => (y * cw + x) * 4;

  // 1) Color de fondo: promedio de una franja fina pegada a los 4 bordes.
  const margin = Math.max(2, Math.round(Math.min(cw, ch) * 0.04));
  let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
  const sample = (x: number, y: number) => {
    const i = idx(x, y);
    bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2];
    bgCount++;
  };
  for (let x = 0; x < cw; x += 2) {
    for (let y = 0; y < margin; y++) sample(x, y);
    for (let y = ch - margin; y < ch; y++) sample(x, y);
  }
  for (let y = margin; y < ch - margin; y += 2) {
    for (let x = 0; x < margin; x++) sample(x, y);
    for (let x = cw - margin; x < cw; x++) sample(x, y);
  }
  if (bgCount === 0) return null;
  bgR /= bgCount; bgG /= bgCount; bgB /= bgCount;

  // 2) Grilla: cada celda es "documento" si su color se aleja del fondo.
  const cols = 50, rows = 50;
  const cellW = cw / cols, cellH = ch / rows;
  const THRESHOLD = 35;
  const fg: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    fg[r] = [];
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * cellW), x1 = Math.max(x0 + 1, Math.floor((c + 1) * cellW));
      const y0 = Math.floor(r * cellH), y1 = Math.max(y0 + 1, Math.floor((r + 1) * cellH));
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = idx(Math.min(x, cw - 1), Math.min(y, ch - 1));
          sr += data[i]; sg += data[i + 1]; sb += data[i + 2];
          n++;
        }
      }
      const dd = Math.sqrt((sr / n - bgR) ** 2 + (sg / n - bgG) ** 2 + (sb / n - bgB) ** 2);
      fg[r][c] = dd > THRESHOLD;
    }
  }

  // 3) Celdas confiables: marcadas y con al menos 3 vecinas marcadas (así se
  // ignora ruido suelto, como una mancha en la mesa).
  const solid: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    solid[r] = [];
    for (let c = 0; c < cols; c++) {
      if (!fg[r][c]) { solid[r][c] = false; continue; }
      let neighbors = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && fg[rr][cc]) neighbors++;
        }
      }
      solid[r][c] = neighbors >= 3;
    }
  }

  // 4) Esquinas a nivel de píxel (no de celda, para que el recorte quede
  // justo): entre los píxeles que se distinguen del fondo y caen en (o al
  // lado de) una celda confiable, el más extremo en cada diagonal.
  const nearSolid = (r: number, c: number) => {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && solid[rr][cc]) return true;
      }
    }
    return false;
  };
  const PIXEL_THRESHOLD = THRESHOLD * 1.3;
  let tl: Point | null = null, tr: Point | null = null, br: Point | null = null, bl: Point | null = null;
  let minSum = Infinity, maxSum = -Infinity, maxDiff = -Infinity, minDiff = Infinity;
  for (let y = 0; y < ch; y++) {
    const r = Math.min(rows - 1, Math.floor(y / cellH));
    for (let x = 0; x < cw; x++) {
      const c = Math.min(cols - 1, Math.floor(x / cellW));
      if (!nearSolid(r, c)) continue;
      const i = idx(x, y);
      const dd = Math.sqrt((data[i] - bgR) ** 2 + (data[i + 1] - bgG) ** 2 + (data[i + 2] - bgB) ** 2);
      if (dd <= PIXEL_THRESHOLD) continue;
      const nx = x / (cw - 1);
      const ny = y / (ch - 1);
      if (nx + ny < minSum) { minSum = nx + ny; tl = { x: nx, y: ny }; }
      if (nx + ny > maxSum) { maxSum = nx + ny; br = { x: nx, y: ny }; }
      if (nx - ny > maxDiff) { maxDiff = nx - ny; tr = { x: nx, y: ny }; }
      if (nx - ny < minDiff) { minDiff = nx - ny; bl = { x: nx, y: ny }; }
    }
  }
  if (!tl || !tr || !br || !bl) return null;
  const q: Quad = [tl, tr, br, bl];

  // 5) Si es casi toda la foto, muy chico o deforme, no confiamos.
  const area = quadArea(q);
  if (area < 0.05 || area > 0.95 || !isValidQuad(q)) return null;
  return q;
}
