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


/* ------------------------------------------------------------------ */
/* Mover un lado entero, en paralelo                                    */
/* ------------------------------------------------------------------ */

function cross(a: Point, b: Point): number {
  return a.x * b.y - a.y * b.x;
}

/** Intersección de la recta p1→p2 con la recta p3→p4 (null si son paralelas). */
function intersectLines(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const r = { x: p2.x - p1.x, y: p2.y - p1.y };
  const s = { x: p4.x - p3.x, y: p4.y - p3.y };
  const denom = cross(r, s);
  if (Math.abs(denom) < 1e-12) return null;
  const t = cross({ x: p3.x - p1.x, y: p3.y - p1.y }, s) / denom;
  return { x: p1.x + t * r.x, y: p1.y + t * r.y };
}

/**
 * Desplaza el lado `edge` (el que va de la esquina `edge` a la `edge + 1`)
 * en `delta`, manteniéndolo paralelo a sí mismo. Sus dos esquinas se
 * deslizan sobre los lados vecinos (como en los escáneres de documentos),
 * así el recorte sigue apoyado en los otros bordes del papel.
 * Devuelve null si la geometría no tiene solución (lados vecinos paralelos al movido).
 */
export function moveEdge(start: Quad, edge: number, delta: Point): Quad | null {
  const a = edge;
  const b = (edge + 1) % 4;
  const prev = (edge + 3) % 4;
  const next = (edge + 2) % 4;
  const m1 = { x: start[a].x + delta.x, y: start[a].y + delta.y };
  const m2 = { x: start[b].x + delta.x, y: start[b].y + delta.y };
  const na = intersectLines(m1, m2, start[prev], start[a]);
  const nb = intersectLines(m1, m2, start[b], start[next]);
  if (!na || !nb) return null;
  const out = [...start] as Quad;
  out[a] = na;
  out[b] = nb;
  return out;
}

function insideImage(q: Quad, tol = 1e-6): boolean {
  return q.every((p) => p.x >= -tol && p.x <= 1 + tol && p.y >= -tol && p.y <= 1 + tol);
}

function clampQuad(q: Quad): Quad {
  return q.map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) })) as Quad;
}

/**
 * Versión "segura" de moveEdge para el arrastre: si el movimiento completo
 * sacaría una esquina de la foto o cruzaría el recuadro, avanza lo máximo
 * posible en esa dirección (el lado queda "tope" contra el borde) en lugar
 * de deformarlo. Devuelve null si no se puede mover nada.
 */
export function dragEdge(start: Quad, edge: number, delta: Point): Quad | null {
  const attempt = (t: number): Quad | null => {
    const q = moveEdge(start, edge, { x: delta.x * t, y: delta.y * t });
    return q && insideImage(q) && isValidQuad(q) ? clampQuad(q) : null;
  };
  const full = attempt(1);
  if (full) return full;
  let lo = 0, hi = 1;
  let best: Quad | null = null;
  for (let k = 0; k < 14; k++) {
    const mid = (lo + hi) / 2;
    const q = attempt(mid);
    if (q) { best = q; lo = mid; } else hi = mid;
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Detección automática del comprobante                                */
/* ------------------------------------------------------------------ */

/** Lado más largo de la imagen chica sobre la que se analiza (rápido en el celular). */
const ANALYSIS_SIZE = 320;

/** Umbral de Otsu sobre valores 0..255: el corte que mejor separa "claro" de "oscuro". */
function otsuThreshold(values: Float32Array): number {
  const hist = new Float64Array(256);
  for (let i = 0; i < values.length; i++) hist[Math.min(255, Math.max(0, Math.round(values[i])))]++;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let wB = 0, sumB = 0, best = -1, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/** Desenfoque 3x3 (promedio), para que la veta de la madera o el texto no generen ruido. */
function boxBlur(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += src[yy * w + xx];
          n++;
        }
      }
      out[y * w + x] = s / n;
    }
  }
  return out;
}

/** Erosión o dilatación 3x3 de una máscara binaria. */
function morph(mask: Uint8Array, w: number, h: number, erode: boolean): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = erode ? 1 : 0;
      for (let dy = -1; dy <= 1 && v === (erode ? 1 : 0); dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          const m = mask[yy * w + xx];
          if (erode && !m) { v = 0; break; }
          if (!erode && m) { v = 1; break; }
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Envolvente convexa (monotone chain). Devuelve los vértices en orden. */
function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const turn = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function polygonArea(poly: Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/**
 * Reduce un polígono convexo a 4 vértices quitando, de a uno, el vértice
 * cuyo triángulo con sus vecinos es el más chico (el que menos aporta a la
 * forma). En un papel, lo que sobrevive son sus 4 esquinas.
 */
function reduceToQuad(hull: Point[]): Point[] | null {
  const poly = [...hull];
  if (poly.length < 4) return null;
  while (poly.length > 4) {
    let minArea = Infinity, minIdx = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[(i + poly.length - 1) % poly.length];
      const b = poly[i];
      const c = poly[(i + 1) % poly.length];
      const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      if (area < minArea) { minArea = area; minIdx = i; }
    }
    poly.splice(minIdx, 1);
  }
  return poly;
}

/** Ordena 4 puntos como arriba-izq, arriba-der, abajo-der, abajo-izq (sentido horario en pantalla). */
function orderQuad(pts: Point[]): Quad {
  let signed = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    signed += a.x * b.y - b.x * a.y;
  }
  const cw = signed > 0 ? [...pts] : [...pts].reverse();
  let start = 0;
  for (let i = 1; i < 4; i++) if (cw[i].x + cw[i].y < cw[start].x + cw[start].y) start = i;
  return [0, 1, 2, 3].map((k) => cw[(start + k) % 4]) as Quad;
}

interface Candidate {
  quad: Quad;
  score: number;
}

/**
 * Busca, dentro de una máscara (1 = "puede ser papel"), la mancha que más
 * parece un comprobante: grande, compacta (casi un cuadrilátero), lo más
 * centrada posible y, en lo posible, sin tocar el borde de la foto.
 */
function bestCandidate(mask: Uint8Array, w: number, h: number): Candidate | null {
  const n = w * h;
  const labels = new Int32Array(n);
  const queue = new Int32Array(n);
  let best: Candidate | null = null;
  let label = 0;

  for (let seed = 0; seed < n; seed++) {
    if (!mask[seed] || labels[seed]) continue;
    label++;
    // Recorre la mancha (4-vecinos) registrando, por fila, el x mínimo y máximo.
    const rowMin = new Int32Array(h).fill(w);
    const rowMax = new Int32Array(h).fill(-1);
    let head = 0, tail = 0, count = 0, border = 0, sumX = 0, sumY = 0;
    queue[tail++] = seed;
    labels[seed] = label;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w;
      const y = (p - x) / w;
      count++;
      sumX += x;
      sumY += y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border++;
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) {
        if (q >= 0 && mask[q] && !labels[q]) {
          labels[q] = label;
          queue[tail++] = q;
        }
      }
    }

    if (count < n * 0.02) continue;

    // Área "rellena" fila por fila: así las letras del ticket (huecos) no restan.
    const pts: Point[] = [];
    let filled = 0;
    for (let y = 0; y < h; y++) {
      if (rowMax[y] < 0) continue;
      filled += rowMax[y] - rowMin[y] + 1;
      pts.push({ x: rowMin[y], y }, { x: rowMax[y] + 1, y }, { x: rowMin[y], y: y + 1 }, { x: rowMax[y] + 1, y: y + 1 });
    }
    const fillFrac = filled / n;
    if (fillFrac > 0.92) continue;

    const hull = convexHull(pts);
    const hullArea = polygonArea(hull);
    if (hullArea <= 0) continue;
    const solidity = filled / hullArea;
    if (solidity < 0.75) continue;

    const corners = reduceToQuad(hull);
    if (!corners) continue;
    const quadPx = orderQuad(corners);
    const fit = filled / Math.max(1, polygonArea(quadPx));
    if (fit < 0.8 || fit > 1.25) continue;

    const quad = quadPx.map((p) => ({ x: p.x / w, y: p.y / h })) as Quad;
    if (!isValidQuad(quad)) continue;

    const cx = sumX / count / w - 0.5;
    const cy = sumY / count / h - 0.5;
    const centrality = 1 - Math.min(1, Math.hypot(cx, cy) / 0.7) * 0.5;
    // Si toca el borde de la foto suele ser otra cosa (mantel, ropa, el piso);
    // salvo que sea lo único, preferimos lo que está entero dentro de la foto.
    const touchPenalty = border > 0 ? Math.max(0.25, 1 - border / (2 * (w + h)) * 4) : 1;
    const score = fillFrac * solidity ** 2 * Math.min(fit, 1 / fit) * centrality * touchPenalty;
    if (!best || score > best.score) best = { quad, score };
  }
  return best;
}

/** k-medias simple sobre colores RGB (para describir un fondo con varias zonas). */
function kMeansColors(samples: number[][], k: number, iterations = 8): number[][] {
  const sorted = [...samples].sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
  let centers = Array.from({ length: k }, (_, i) => [...sorted[Math.floor(((i + 0.5) / k) * sorted.length)]]);
  for (let it = 0; it < iterations; it++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (const s of samples) {
      let bi = 0, bd = Infinity;
      centers.forEach((c, i) => {
        const d = (s[0] - c[0]) ** 2 + (s[1] - c[1]) ** 2 + (s[2] - c[2]) ** 2;
        if (d < bd) { bd = d; bi = i; }
      });
      sums[bi][0] += s[0]; sums[bi][1] += s[1]; sums[bi][2] += s[2]; sums[bi][3]++;
    }
    centers = centers.map((c, i) => (sums[i][3] ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]] : c));
  }
  return centers;
}

/**
 * Detección sobre píxeles RGBA crudos (separada del canvas para poder
 * probarla). Combina dos pistas y se queda con la mejor:
 *  A) "Parece papel": claro y poco saturado (el típico ticket blanco sobre
 *     una mesa, aunque alrededor haya otras cosas).
 *  B) "No se parece a ningún fondo": los colores del borde de la foto se
 *     agrupan en varias zonas (madera, mantel, sombra) y se marca lo que no
 *     se parece a ninguna (sirve si el papel no es blanco).
 * En cada pista se toma la mancha que más parece un comprobante y se ajusta
 * un cuadrilátero a su contorno, así sigue a un ticket inclinado.
 */
export function detectQuadInPixels(data: ArrayLike<number>, w: number, h: number): Quad | null {
  const n = w * h;
  if (n < 100) return null;

  // Pista A: "papel" = brillo menos saturación, con umbral automático.
  const paperRaw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    paperRaw[i] = Math.max(0, (r + g + b) / 3 - 0.8 * (mx - mn));
  }
  const paper = boxBlur(paperRaw, w, h);
  const t = otsuThreshold(paper);
  const maskA = new Uint8Array(n);
  for (let i = 0; i < n; i++) maskA[i] = paper[i] > t ? 1 : 0;

  // Pista B: distancia a los colores del borde de la foto.
  const margin = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  const samples: number[][] = [];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (x >= margin && x < w - margin && y >= margin && y < h - margin) continue;
      const i = (y * w + x) * 4;
      samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  const candidates: (Candidate | null)[] = [bestCandidate(morph(morph(maskA, w, h, true), w, h, false), w, h)];
  if (samples.length >= 8) {
    const centers = kMeansColors(samples, 4);
    let spread = 0;
    for (const s of samples) {
      spread += Math.min(...centers.map((c) => Math.hypot(s[0] - c[0], s[1] - c[1], s[2] - c[2])));
    }
    spread /= samples.length;
    const threshold = Math.max(40, spread * 2.5);
    const maskB = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      let d = Infinity;
      for (const c of centers) d = Math.min(d, Math.hypot(r - c[0], g - c[1], b - c[2]));
      maskB[i] = d > threshold ? 1 : 0;
    }
    candidates.push(bestCandidate(morph(morph(maskB, w, h, true), w, h, false), w, h));
  }

  let best: Candidate | null = null;
  for (const c of candidates) if (c && (!best || c.score > best.score)) best = c;
  if (!best) return null;
  const area = quadArea(best.quad);
  if (area < 0.02 || area > 0.95) return null;
  return best.quad;
}

/**
 * Sugerencia automática de las 4 esquinas del comprobante a partir del canvas
 * de trabajo. Es una heurística (no un escáner profesional): si no encuentra
 * nada convincente devuelve null y el editor arranca con un recuadro genérico.
 */
export function detectDocumentQuad(source: HTMLCanvasElement): Quad | null {
  const scale = Math.min(1, ANALYSIS_SIZE / Math.max(source.width, source.height));
  const cw = Math.max(1, Math.round(source.width * scale));
  const ch = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, cw, ch);
  try {
    return detectQuadInPixels(ctx.getImageData(0, 0, cw, ch).data, cw, ch);
  } catch {
    return null;
  }
}
