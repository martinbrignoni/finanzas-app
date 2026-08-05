import { useEffect, useRef, useState } from "react";
import { theme as C } from "../styles/theme";
import { Modal, PrimaryButton } from "./ui";

/** Rectángulo de recorte, en porcentaje (0-100) del tamaño mostrado de la imagen. */
interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragMode = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se" | null;

const MIN_SIZE = 8; // % mínimo de ancho/alto del recorte, para no poder achicarlo a la nada

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Aplica el arrastre de un handle de resize al rectángulo inicial, según qué lado(s) mueve cada uno. */
function resizeRect(start: CropRect, handle: Exclude<DragMode, "move" | null>, dx: number, dy: number): CropRect {
  let { x, y, w, h } = start;
  const affectsN = handle === "n" || handle === "nw" || handle === "ne";
  const affectsS = handle === "s" || handle === "sw" || handle === "se";
  const affectsW = handle === "w" || handle === "nw" || handle === "sw";
  const affectsE = handle === "e" || handle === "ne" || handle === "se";

  if (affectsN) {
    const newY = clamp(start.y + dy, 0, start.y + start.h - MIN_SIZE);
    h = start.h - (newY - start.y);
    y = newY;
  }
  if (affectsS) {
    h = clamp(start.h + dy, MIN_SIZE, 100 - start.y);
  }
  if (affectsW) {
    const newX = clamp(start.x + dx, 0, start.x + start.w - MIN_SIZE);
    w = start.w - (newX - start.x);
    x = newX;
  }
  if (affectsE) {
    w = clamp(start.w + dx, MIN_SIZE, 100 - start.x);
  }
  return { x, y, w, h };
}

const DEFAULT_RECT: CropRect = { x: 5, y: 5, w: 90, h: 90 };

/**
 * Heurística casera para sugerir el recorte solo: asume que el fondo de la
 * foto (mesa, mostrador, etc.) es más o menos parejo cerca de los bordes,
 * promedia su color ahí, y arma una grilla marcando qué celdas se alejan
 * bastante de ese color de fondo (= probablemente el comprobante). Devuelve
 * el rectángulo (en % de la imagen) que engloba esas celdas, con un margen
 * chico. No es un scanner de verdad (no corrige perspectiva ni detecta
 * bordes de papel con precisión) — es solo un punto de partida razonable
 * para no arrancar del 100% de la foto; si el fondo no es parejo, o la foto
 * ya está bastante encuadrada, devuelve `null` y se usa `DEFAULT_RECT`.
 */
function detectDocumentRect(img: HTMLImageElement): CropRect | null {
  const naturalW = img.naturalWidth;
  const naturalH = img.naturalHeight;
  if (!naturalW || !naturalH) return null;

  const ANALYSIS_SIZE = 300;
  const scale = ANALYSIS_SIZE / Math.max(naturalW, naturalH);
  const cw = Math.max(1, Math.round(naturalW * scale));
  const ch = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, cw, ch);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, cw, ch).data;
  } catch {
    return null; // no debería pasar con un blob: URL local, pero por las dudas
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

  // 2) Grilla: cada celda se marca "documento" si su color promedio se aleja
  // bastante del color de fondo calculado arriba.
  const cols = 40, rows = 40;
  const cellW = cw / cols, cellH = ch / rows;
  const THRESHOLD = 35; // distancia de color aprox. (0-441) para no ser "fondo"
  const foreground: boolean[][] = [];
  let fgCellCount = 0;

  for (let r = 0; r < rows; r++) {
    foreground[r] = [];
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(c * cellW), x1 = Math.floor((c + 1) * cellW);
      const y0 = Math.floor(r * cellH), y1 = Math.floor((r + 1) * cellH);
      let sumR = 0, sumG = 0, sumB = 0, n = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = idx(Math.min(x, cw - 1), Math.min(y, ch - 1));
          sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2];
          n++;
        }
      }
      if (n === 0) { foreground[r][c] = false; continue; }
      const dist = Math.sqrt((sumR / n - bgR) ** 2 + (sumG / n - bgG) ** 2 + (sumB / n - bgB) ** 2);
      foreground[r][c] = dist > THRESHOLD;
      if (foreground[r][c]) fgCellCount++;
    }
  }
  if (fgCellCount === 0) return null; // no se distingue nada del fondo

  // 3) Bounding box de las celdas "documento", ignorando celdas sueltas
  // (menos de 2 vecinas marcadas) para no dejarse llevar por ruido puntual.
  let minR = rows, maxR = -1, minC = cols, maxC = -1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!foreground[r][c]) continue;
      let neighbors = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && foreground[rr][cc]) neighbors++;
        }
      }
      if (neighbors < 2) continue;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
  }
  if (maxR < minR || maxC < minC) return null;

  const x = (minC / cols) * 100;
  const y = (minR / rows) * 100;
  const wPct = ((maxC - minC + 1) / cols) * 100;
  const hPct = ((maxR - minR + 1) / rows) * 100;

  // 4) Si el área detectada es casi toda la foto o demasiado chica, no confiamos.
  const area = (wPct / 100) * (hPct / 100);
  if (area < 0.05 || area > 0.97) return null;

  // 5) Margen chico alrededor, por si el recorte quedó justo.
  const pad = 2;
  const x0 = clamp(x - pad, 0, 100);
  const y0 = clamp(y - pad, 0, 100);
  const x1 = clamp(x + wPct + pad, 0, 100);
  const y1 = clamp(y + hPct + pad, 0, 100);
  return { x: x0, y: y0, w: Math.max(MIN_SIZE, x1 - x0), h: Math.max(MIN_SIZE, y1 - y0) };
}

const HANDLES: { id: Exclude<DragMode, "move" | null>; style: React.CSSProperties }[] = [
  { id: "nw", style: { left: 0, top: 0, cursor: "nwse-resize" } },
  { id: "n", style: { left: "50%", top: 0, cursor: "ns-resize" } },
  { id: "ne", style: { left: "100%", top: 0, cursor: "nesw-resize" } },
  { id: "e", style: { left: "100%", top: "50%", cursor: "ew-resize" } },
  { id: "se", style: { left: "100%", top: "100%", cursor: "nwse-resize" } },
  { id: "s", style: { left: "50%", top: "100%", cursor: "ns-resize" } },
  { id: "sw", style: { left: 0, top: "100%", cursor: "nesw-resize" } },
  { id: "w", style: { left: 0, top: "50%", cursor: "ew-resize" } },
];

/**
 * Recorte de una foto de comprobante antes de subirla: arrastrando las
 * esquinas o los lados de un rectángulo sobre la imagen, para dejar afuera lo
 * que no es el comprobante. Todo el recorte pasa en el navegador (canvas),
 * nada se sube hasta confirmar. `file` tiene que ser una imagen.
 */
export function ImageCropModal({
  file,
  onConfirm,
  onSkip,
  onCancel,
}: {
  file: File;
  /** Usuario confirmó el recorte: se sube la versión recortada. */
  onConfirm: (cropped: File) => void;
  /** Usuario prefiere subir la foto entera, sin recortar. */
  onSkip: () => void;
  /** Usuario decide no adjuntar esta foto. */
  onCancel: () => void;
}) {
  const [objectUrl] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl]);

  const [rect, setRect] = useState<CropRect>(DEFAULT_RECT);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const startRectRef = useRef<CropRect>(rect);
  const startPosRef = useRef({ x: 0, y: 0 });
  // Rectángulo sugerido automáticamente al cargar la foto (o el default, si
  // no se pudo detectar nada), para poder volver a él con "Reiniciar".
  const autoRectRef = useRef<CropRect>(DEFAULT_RECT);

  const handleImageLoad = () => {
    const img = imgRef.current;
    const detected = img ? detectDocumentRect(img) : null;
    const initial = detected ?? DEFAULT_RECT;
    autoRectRef.current = initial;
    setRect(initial);
    setAutoDetected(!!detected);
    setImgLoaded(true);
  };

  const handlePointerDown = (e: React.PointerEvent, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    startRectRef.current = rect;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    setDragMode(mode);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragMode || !containerRef.current) return;
    const bounds = containerRef.current.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    const dx = ((e.clientX - startPosRef.current.x) / bounds.width) * 100;
    const dy = ((e.clientY - startPosRef.current.y) / bounds.height) * 100;
    const start = startRectRef.current;
    if (dragMode === "move") {
      setRect({
        ...start,
        x: clamp(start.x + dx, 0, 100 - start.w),
        y: clamp(start.y + dy, 0, 100 - start.h),
      });
    } else {
      setRect(resizeRect(start, dragMode, dx, dy));
    }
  };

  const endDrag = () => setDragMode(null);

  const handleConfirm = async () => {
    const img = imgRef.current;
    if (!img) return;
    setExporting(true);
    try {
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      const sx = (rect.x / 100) * naturalW;
      const sy = (rect.y / 100) * naturalH;
      const sw = (rect.w / 100) * naturalW;
      const sh = (rect.h / 100) * naturalH;

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        onSkip();
        return;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) {
        onSkip();
        return;
      }
      onConfirm(new File([blob], file.name, { type: "image/jpeg" }));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal title="Ajustar comprobante" onClose={onCancel}>
      <p className="text-xs mb-3" style={{ color: C.textMuted }}>
        {imgLoaded && autoDetected
          ? "Ajustamos el recorte solos a lo que parece el comprobante. Si no quedó bien, arrastrá las esquinas o los lados."
          : "Arrastrá las esquinas o los lados para dejar afuera lo que no es el comprobante."}
      </p>

      <div
        ref={containerRef}
        className="relative mx-auto mb-4 select-none"
        style={{ width: "fit-content", maxWidth: "100%", touchAction: "none" }}
      >
        <img
          ref={imgRef}
          src={objectUrl}
          alt="Comprobante"
          draggable={false}
          onLoad={handleImageLoad}
          className="block max-w-full"
          style={{ maxHeight: "50vh" }}
        />
        {imgLoaded && (
          <div
            onPointerDown={(e) => handlePointerDown(e, "move")}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute cursor-move"
            style={{
              left: `${rect.x}%`,
              top: `${rect.y}%`,
              width: `${rect.w}%`,
              height: `${rect.h}%`,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
              border: "2px solid #fff",
              touchAction: "none",
            }}
          >
            {HANDLES.map((handle) => (
              <div
                key={handle.id}
                onPointerDown={(e) => handlePointerDown(e, handle.id)}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="absolute rounded-full"
                style={{
                  ...handle.style,
                  width: 18,
                  height: 18,
                  transform: "translate(-50%, -50%)",
                  background: "#fff",
                  border: `2px solid ${C.usd}`,
                  touchAction: "none",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {imgLoaded && (
        <button
          type="button"
          onClick={() => setRect(autoRectRef.current)}
          className="w-full text-center text-[11px] mb-3"
          style={{ color: C.textFaint }}
        >
          Reiniciar recorte {autoDetected ? "sugerido" : "completo"}
        </button>
      )}

      <PrimaryButton disabled={!imgLoaded || exporting} onClick={handleConfirm}>
        {exporting ? "Procesando..." : "Usar foto recortada"}
      </PrimaryButton>
      <button type="button" onClick={onSkip} className="w-full py-2.5 text-xs font-semibold" style={{ color: C.textMuted }}>
        Usar la foto entera, sin recortar
      </button>
      <button type="button" onClick={onCancel} className="w-full py-1.5 text-xs" style={{ color: C.negative }}>
        No adjuntar esta foto
      </button>
    </Modal>
  );
}
