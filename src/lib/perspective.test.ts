import { describe, it, expect } from "vitest";
import {
  applyHomography, computeHomography, isValidQuad, outputSize, quadArea, rotateQuadClockwise,
  DEFAULT_QUAD, FULL_QUAD, type Quad,
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
