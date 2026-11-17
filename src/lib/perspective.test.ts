import { describe, it, expect } from "vitest";
import {
  applyHomography, computeHomography, detectQuadInPixels, dragEdge, isValidQuad, moveEdge, outputSize,
  quadArea, rotateQuadClockwise, DEFAULT_QUAD, FULL_QUAD, type Point, type Quad,
} from "./perspective";

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe("computeHomography", () => {
  it("lleva cada esquina de origen exactamente a su esquina de destino (ticket inclinado)", () => {
    const from: Quad = [{ x: 0, y: 0 }, { x: 999, y: 0 }, { x: 999, y: 1499 }, { x: 0, y: 1499 }];
    const to: Quad = [{ x: 120, y: 80 }, { x: 900, y: 140 }, { x: 860, y: 1400 }, { x: 60, y: 1350 }];
    const h = computeHomography(from, to);
    expect(h).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      const p = applyHomography(h!, from[i]);
      close(p.x, to[i].x);
      close(p.y, to[i].y);
    }
  });

  it("con un rectángulo que solo se escala, el centro va al centro", () => {
    const from: Quad = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const to: Quad = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 40 }, { x: 0, y: 40 }];
    const p = applyHomography(computeHomography(from, to)!, { x: 5, y: 5 });
    close(p.x, 10);
    close(p.y, 20);
  });

  it("tres esquinas alineadas no son un quad válido (el editor no deja confirmar)", () => {
    const degenerate: Quad = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(isValidQuad(degenerate)).toBe(false);
  });
});

describe("rotateQuadClockwise", () => {
  it("cuatro giros vuelven al quad original", () => {
    const q: Quad = [{ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.15 }, { x: 0.9, y: 0.85 }, { x: 0.05, y: 0.9 }];
    let r = q;
    for (let i = 0; i < 4; i++) r = rotateQuadClockwise(r);
    r.forEach((p, i) => { close(p.x, q[i].x); close(p.y, q[i].y); });
  });

  it("mantiene el orden arriba-izq, arriba-der, abajo-der, abajo-izq", () => {
    const r = rotateQuadClockwise(FULL_QUAD);
    expect(r).toEqual(FULL_QUAD);
    expect(isValidQuad(rotateQuadClockwise(DEFAULT_QUAD))).toBe(true);
  });
});

describe("isValidQuad", () => {
  it("acepta un cuadrilátero convexo", () => {
    expect(isValidQuad(DEFAULT_QUAD)).toBe(true);
  });

  it("rechaza esquinas cruzadas (forma de moño)", () => {
    const crossed: Quad = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(isValidQuad(crossed)).toBe(false);
  });
});

describe("outputSize / quadArea", () => {
  it("usa el lado más largo de cada par y respeta el tope", () => {
    expect(outputSize(FULL_QUAD, 1000, 3000)).toEqual({ width: 667, height: 2000 });
    expect(outputSize(FULL_QUAD, 800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("calcula el área normalizada", () => {
    close(quadArea(FULL_QUAD), 1);
    close(quadArea(DEFAULT_QUAD), 0.81);
  });
});

/* ---------- Mover un lado en paralelo ---------- */

/** Pendiente (dirección normalizada) de un segmento, para comparar paralelismo. */
const direction = (a: Point, b: Point) => {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
};

describe("moveEdge / dragEdge", () => {
  const tilted: Quad = [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.25 }, { x: 0.75, y: 0.8 }, { x: 0.15, y: 0.75 }];

  it("el lado movido queda paralelo al original y las esquinas siguen sobre los lados vecinos", () => {
    const q = moveEdge(tilted, 0, { x: 0, y: 0.1 })!;
    const before = direction(tilted[0], tilted[1]);
    const after = direction(q[0], q[1]);
    close(before.x, after.x);
    close(before.y, after.y);
    // La esquina 0 sigue sobre la recta 3→0 y la 1 sobre la recta 1→2.
    const onLine = (p: Point, a: Point, b: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    close(onLine(q[0], tilted[3], tilted[0]), 0);
    close(onLine(q[1], tilted[1], tilted[2]), 0);
    // Las otras dos esquinas no se tocan.
    expect(q[2]).toEqual(tilted[2]);
    expect(q[3]).toEqual(tilted[3]);
  });

  it("si el movimiento saca el lado de la foto, lo deja tope contra el borde", () => {
    const q = dragEdge(DEFAULT_QUAD, 3, { x: -0.5, y: 0 })!; // lado izquierdo, muy a la izquierda
    expect(q[0].x).toBeCloseTo(0, 3);
    expect(q[3].x).toBeCloseTo(0, 3);
    expect(q[1]).toEqual(DEFAULT_QUAD[1]);
  });

  it("no deja cruzar un lado sobre el opuesto", () => {
    const q = dragEdge(DEFAULT_QUAD, 0, { x: 0, y: 2 }); // lado de arriba hacia abajo, de más
    expect(q === null || isValidQuad(q)).toBe(true);
  });
});

/* ---------- Detección automática ---------- */

/** Arma una imagen RGBA sintética: `bg(x, y)` para el fondo y un ticket blanco con texto oscuro dentro de `ticket`. */
function synth(w: number, h: number, bg: (x: number, y: number) => [number, number, number], ticket: Quad): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  const inside = (px: number, py: number) => {
    for (let i = 0; i < 4; i++) {
      const a = ticket[i], b = ticket[(i + 1) % 4];
      if ((b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x) < 0) return false;
    }
    return true;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      let c = bg(x, y);
      if (inside(x / w, y / h)) c = (y % 9 < 2 && x % 7 < 4) ? [40, 40, 40] : [238, 236, 232]; // papel con "renglones"
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }
  }
  return data;
}

/** Madera con veta (franjas claras y oscuras), como la mesa de la foto real. */
const wood = (x: number, y: number): [number, number, number] => {
  const v = Math.sin(y * 0.9 + Math.sin(x * 0.05) * 3) * 25 + ((x * 31 + y * 17) % 13);
  return [140 + v, 100 + v * 0.8, 70 + v * 0.6];
};

const maxCornerError = (a: Quad, b: Quad) => Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));

describe("detectQuadInPixels", () => {
  const W = 240, H = 320;

  it("encuentra un ticket inclinado sobre madera", () => {
    const ticket: Quad = [{ x: 0.25, y: 0.2 }, { x: 0.72, y: 0.24 }, { x: 0.7, y: 0.66 }, { x: 0.22, y: 0.62 }];
    const q = detectQuadInPixels(synth(W, H, wood, ticket), W, H);
    expect(q).not.toBeNull();
    expect(maxCornerError(q!, ticket)).toBeLessThan(0.03);
  });

  it("no se confunde con zonas oscuras y claras que tocan el borde (como la foto real)", () => {
    // Abajo a la izquierda negro, abajo a la derecha una tela clara: el fondo ya no es parejo.
    const mixed = (x: number, y: number): [number, number, number] =>
      y > H * 0.85 ? (x < W * 0.6 ? [15, 15, 18] : [205, 200, 190]) : wood(x, y);
    const ticket: Quad = [{ x: 0.25, y: 0.19 }, { x: 0.69, y: 0.2 }, { x: 0.7, y: 0.61 }, { x: 0.24, y: 0.62 }];
    const q = detectQuadInPixels(synth(W, H, mixed, ticket), W, H);
    expect(q).not.toBeNull();
    expect(maxCornerError(q!, ticket)).toBeLessThan(0.03);
  });

  it("encuentra un ticket girado casi 45 grados", () => {
    const ticket: Quad = [{ x: 0.5, y: 0.15 }, { x: 0.82, y: 0.45 }, { x: 0.5, y: 0.78 }, { x: 0.18, y: 0.47 }];
    const q = detectQuadInPixels(synth(W, H, wood, ticket), W, H);
    expect(q).not.toBeNull();
    // Con 45° cualquier esquina puede quedar como "arriba-izquierda": se compara el conjunto.
    const matched = ticket.every((t) => q!.some((p) => Math.hypot(p.x - t.x, p.y - t.y) < 0.03));
    expect(matched).toBe(true);
    expect(isValidQuad(q!)).toBe(true);
  });

  it("si no hay ningún papel, no inventa uno", () => {
    const empty = synth(W, H, wood, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]);
    expect(detectQuadInPixels(empty, W, H)).toBeNull();
  });
});
