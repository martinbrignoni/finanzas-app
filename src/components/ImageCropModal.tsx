import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RotateCw, X, Loader2 } from "lucide-react";
import { theme as C } from "../styles/theme";
import {
  DEFAULT_QUAD, FULL_QUAD, detectDocumentQuad, dragEdge, isValidQuad, rotateQuadClockwise, warpQuad,
  type Point, type Quad,
} from "../lib/perspective";

/** Lado más largo de la imagen de trabajo: suficiente para leer un ticket y liviano para procesar en el celular. */
const WORK_MAX_DIM = 2000;
/** Tamaño de la lupa y cuánto amplía. */
const LOUPE_SIZE = 120;
const LOUPE_ZOOM = 2.5;
/** Debajo de este largo (px en pantalla) no se muestra el tirador del medio del lado, para no tapar las esquinas. */
const MIN_EDGE_FOR_HANDLE = 90;

/** Qué se está arrastrando: una esquina (0..3) o un lado entero (0..3, de la esquina i a la i+1). */
type Drag = { kind: "corner"; i: number } | { kind: "edge"; i: number };

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** Carga el archivo en un canvas de trabajo (achicado a WORK_MAX_DIM, respetando la orientación de la foto). */
async function loadToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("No se pudo abrir la imagen."));
      el.src = url;
    });
    const scale = Math.min(1, WORK_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rotateCanvasClockwise(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = source.height;
  out.height = source.width;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.translate(out.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(source, 0, 0);
  return out;
}

/**
 * Editor a pantalla completa para "escanear" la foto de un comprobante antes
 * de subirla: 4 esquinas que se arrastran por separado hasta las puntas del
 * papel, más un tirador en el medio de cada lado que lo mueve entero en
 * paralelo (con lupa mientras se arrastra), botón para rotar, y al confirmar se
 * endereza la zona marcada (corrección de perspectiva). Todo pasa en el
 * navegador; nada se sube hasta confirmar. `file` tiene que ser una imagen.
 */
export function ImageCropModal({
  file,
  onConfirm,
  onSkip,
  onCancel,
}: {
  file: File;
  /** Se sube la versión enderezada/rotada. */
  onConfirm: (result: File) => void;
  /** Se sube la foto original tal cual (sin recortar ni rotar). */
  onSkip: () => void;
  /** No se adjunta esta foto. */
  onCancel: () => void;
}) {
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [quad, setQuad] = useState<Quad>(DEFAULT_QUAD);
  const [suggested, setSuggested] = useState<Quad>(DEFAULT_QUAD);
  const [autoDetected, setAutoDetected] = useState(false);
  const [rotations, setRotations] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState<Drag | null>(null);
  /** Al arrastrar un lado: el recuadro y el punto donde empezó el gesto (se mide todo desde ahí, sin acumular error). */
  const edgeStart = useRef<{ quad: Quad; point: Point } | null>(null);
  const [imgBox, setImgBox] = useState<{ w: number; h: number } | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);

  /** Muestra en pantalla el canvas de trabajo actual (como blob, más liviano que un data URL). */
  const showCanvas = async (canvas: HTMLCanvasElement) => {
    const blob = await canvasToBlob(canvas, 0.85);
    if (!blob) return;
    setDisplayUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
  };

  useEffect(() => {
    let cancelled = false;
    loadToCanvas(file)
      .then((canvas) => {
        if (cancelled) return;
        workRef.current = canvas;
        const detected = detectDocumentQuad(canvas);
        const initial = detected ?? DEFAULT_QUAD;
        setQuad(initial);
        setSuggested(initial);
        setAutoDetected(!!detected);
        return showCanvas(canvas);
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => () => { if (displayUrl) URL.revokeObjectURL(displayUrl); }, [displayUrl]);

  // Bloquea el scroll de la página de fondo mientras el editor está abierto.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const measure = () => {
    const el = imgRef.current;
    if (el) setImgBox({ w: el.clientWidth, h: el.clientHeight });
  };
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const rotate = async () => {
    const work = workRef.current;
    if (!work || processing) return;
    const rotated = rotateCanvasClockwise(work);
    workRef.current = rotated;
    setQuad((q) => rotateQuadClockwise(q));
    setSuggested((q) => rotateQuadClockwise(q));
    setRotations((r) => (r + 1) % 4);
    setImgBox(null);
    await showCanvas(rotated);
  };

  const pointFromEvent = (e: React.PointerEvent): Point | null => {
    const el = imgRef.current;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)),
      y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)),
    };
  };

  const onHandleDown = (e: React.PointerEvent, drag: Drag) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (drag.kind === "edge") {
      const p = pointFromEvent(e);
      edgeStart.current = p ? { quad, point: p } : null;
    }
    setDragging(drag);
  };

  const onHandleMove = (e: React.PointerEvent) => {
    if (dragging === null) return;
    const p = pointFromEvent(e);
    if (!p) return;
    if (dragging.kind === "corner") {
      const i = dragging.i;
      setQuad((q) => {
        const next = [...q] as Quad;
        next[i] = p;
        return next;
      });
      return;
    }
    // Lado: se traslada en paralelo y sus esquinas se deslizan sobre los lados vecinos.
    const start = edgeStart.current;
    if (!start) return;
    const moved = dragEdge(start.quad, dragging.i, { x: p.x - start.point.x, y: p.y - start.point.y });
    if (moved) setQuad(moved);
  };

  const endDrag = () => {
    setDragging(null);
    edgeStart.current = null;
  };

  const valid = isValidQuad(quad);

  const confirm = async () => {
    const work = workRef.current;
    if (!work || !valid) return;
    setProcessing(true);
    // Deja que se pinte el "Procesando..." antes del cálculo, que bloquea un instante.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const result = warpQuad(work, quad);
      const blob = await canvasToBlob(result);
      if (!blob) {
        onSkip();
        return;
      }
      onConfirm(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
    } finally {
      setProcessing(false);
    }
  };

  /** "Sin recortar": si la giraste, se sube girada pero entera; si no, el archivo original. */
  const useWhole = async () => {
    const work = workRef.current;
    if (rotations === 0 || !work) {
      onSkip();
      return;
    }
    setProcessing(true);
    try {
      const blob = await canvasToBlob(work);
      if (blob) onConfirm(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
      else onSkip();
    } finally {
      setProcessing(false);
    }
  };

  const ready = !!displayUrl && !!imgBox;
  const toPx = (p: Point) => ({ x: p.x * (imgBox?.w ?? 0), y: p.y * (imgBox?.h ?? 0) });
  const pts = quad.map(toPx);
  const polygon = pts.map((p) => `${p.x},${p.y}`).join(" ");

  // Lupa: en la esquina superior opuesta al dedo, para que no la tape.
  // Al mover un lado, muestra el medio de ese lado.
  const dragPoint: Point | null =
    dragging === null
      ? null
      : dragging.kind === "corner"
        ? quad[dragging.i]
        : {
            x: (quad[dragging.i].x + quad[(dragging.i + 1) % 4].x) / 2,
            y: (quad[dragging.i].y + quad[(dragging.i + 1) % 4].y) / 2,
          };
  const edgeHandles = [0, 1, 2, 3].map((i) => {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    return {
      i,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      length: Math.hypot(b.x - a.x, b.y - a.y),
    };
  });
  const isCornerDrag = (i: number) => dragging?.kind === "corner" && dragging.i === i;
  const EDGE_LABELS = ["Lado de arriba", "Lado derecho", "Lado de abajo", "Lado izquierdo"];
  const loupeOnLeft = dragPoint ? dragPoint.x > 0.5 : true;

  const btnStyle: React.CSSProperties = { background: "rgba(255,255,255,0.12)", color: "#fff" };

  const content = (
    <div
      className="fixed inset-0 z-[80] flex flex-col select-none"
      style={{
        background: "#000",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Ajustar comprobante"
    >
      {/* Barra superior */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0">
        <button type="button" onClick={onCancel} className="flex items-center gap-1 text-sm px-2 py-2" style={{ color: "#fff" }}>
          <X size={18} /> Cancelar
        </button>
        <span className="text-sm font-semibold" style={{ color: "#fff" }}>Ajustar comprobante</span>
        <button
          type="button"
          onClick={rotate}
          disabled={!displayUrl || processing}
          aria-label="Rotar 90 grados"
          className="flex items-center gap-1 text-sm px-3 py-2 rounded-full"
          style={btnStyle}
        >
          <RotateCw size={16} /> Rotar
        </button>
      </div>

      <p className="text-xs text-center px-4 pb-2 shrink-0" style={{ color: "rgba(255,255,255,0.7)" }}>
        {loadError
          ? "No se pudo abrir la foto. Podés subirla igual sin recortar."
          : autoDetected
            ? "Marcamos solos el comprobante. Si no quedó justo, arrastrá las esquinas o el medio de cada lado."
            : "Arrastrá las esquinas hasta las puntas del papel, o el medio de un lado para moverlo entero."}
      </p>

      {/* Zona de la foto */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-6 py-4 relative">
        {displayUrl && (
          <div className="relative" style={{ touchAction: "none" }}>
            <img
              ref={imgRef}
              src={displayUrl}
              alt="Comprobante"
              draggable={false}
              onLoad={measure}
              className="block"
              style={{ maxWidth: "calc(100vw - 48px)", maxHeight: "calc(100dvh - 230px)" }}
            />
            {ready && (
              <>
                <svg
                  className="absolute inset-0 pointer-events-none"
                  width={imgBox.w}
                  height={imgBox.h}
                  style={{ overflow: "visible" }}
                >
                  <defs>
                    <mask id="crop-mask">
                      <rect x={0} y={0} width={imgBox.w} height={imgBox.h} fill="white" />
                      <polygon points={polygon} fill="black" />
                    </mask>
                  </defs>
                  <rect x={0} y={0} width={imgBox.w} height={imgBox.h} fill="rgba(0,0,0,0.55)" mask="url(#crop-mask)" />
                  <polygon points={polygon} fill="none" stroke={valid ? "#fff" : C.negative} strokeWidth={2} />
                </svg>
                {/* Tiradores del medio de cada lado (debajo de las esquinas, que tienen prioridad) */}
                {edgeHandles.map((h) =>
                  h.length < MIN_EDGE_FOR_HANDLE && !(dragging?.kind === "edge" && dragging.i === h.i) ? null : (
                    <div
                      key={`edge-${h.i}`}
                      onPointerDown={(e) => onHandleDown(e, { kind: "edge", i: h.i })}
                      onPointerMove={onHandleMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      aria-label={EDGE_LABELS[h.i]}
                      className="absolute flex items-center justify-center"
                      style={{
                        left: h.x,
                        top: h.y,
                        width: 56,
                        height: 40,
                        transform: `translate(-50%, -50%) rotate(${h.angle}deg)`,
                        touchAction: "none",
                        cursor: "move",
                      }}
                    >
                      <div
                        className="rounded-full"
                        style={{
                          width: 30,
                          height: dragging?.kind === "edge" && dragging.i === h.i ? 6 : 10,
                          background: "rgba(255,255,255,0.9)",
                          border: `2px solid ${C.usd}`,
                        }}
                      />
                    </div>
                  ),
                )}
                {pts.map((p, i) => (
                  <div
                    key={i}
                    onPointerDown={(e) => onHandleDown(e, { kind: "corner", i })}
                    onPointerMove={onHandleMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    aria-label={`Esquina ${i + 1}`}
                    className="absolute flex items-center justify-center"
                    style={{
                      left: p.x,
                      top: p.y,
                      width: 48,
                      height: 48,
                      transform: "translate(-50%, -50%)",
                      touchAction: "none",
                      cursor: "grab",
                    }}
                  >
                    <div
                      className="rounded-full"
                      style={{
                        width: isCornerDrag(i) ? 14 : 24,
                        height: isCornerDrag(i) ? 14 : 24,
                        background: isCornerDrag(i) ? "transparent" : "rgba(255,255,255,0.9)",
                        border: `3px solid ${C.usd}`,
                      }}
                    />
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        {!displayUrl && !loadError && <Loader2 size={28} className="animate-spin" color="#fff" />}

        {/* Lupa mientras se arrastra una esquina o un lado */}
        {ready && dragPoint && displayUrl && (
          <div
            className="absolute rounded-full overflow-hidden pointer-events-none"
            style={{
              top: 8,
              [loupeOnLeft ? "left" : "right"]: 12,
              width: LOUPE_SIZE,
              height: LOUPE_SIZE,
              border: "3px solid #fff",
              boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
              backgroundImage: `url(${displayUrl})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${imgBox.w * LOUPE_ZOOM}px ${imgBox.h * LOUPE_ZOOM}px`,
              backgroundPosition: `${LOUPE_SIZE / 2 - dragPoint.x * imgBox.w * LOUPE_ZOOM}px ${LOUPE_SIZE / 2 - dragPoint.y * imgBox.h * LOUPE_ZOOM}px`,
              backgroundColor: "#000",
            }}
          >
            {/* Mira en el centro */}
            <div className="absolute" style={{ left: "50%", top: "50%", width: 18, height: 2, background: C.usd, transform: "translate(-50%,-50%)" }} />
            <div className="absolute" style={{ left: "50%", top: "50%", width: 2, height: 18, background: C.usd, transform: "translate(-50%,-50%)" }} />
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="px-4 pb-4 pt-2 shrink-0 space-y-2">
        {!valid && ready && (
          <p className="text-xs text-center" style={{ color: C.negative }}>
            Las esquinas quedaron cruzadas. Acomodalas en orden alrededor del papel.
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setQuad(suggested)}
            disabled={!ready || processing}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
            style={btnStyle}
          >
            {autoDetected ? "Volver a la sugerencia" : "Restablecer"}
          </button>
          <button
            type="button"
            onClick={() => setQuad(FULL_QUAD)}
            disabled={!ready || processing}
            className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
            style={btnStyle}
          >
            Toda la foto
          </button>
        </div>
        <button
          type="button"
          onClick={confirm}
          disabled={!ready || !valid || processing}
          className="w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: C.usd, color: "#fff", opacity: !ready || !valid || processing ? 0.5 : 1 }}
        >
          {processing && <Loader2 size={16} className="animate-spin" />}
          {processing ? "Procesando..." : "Usar comprobante"}
        </button>
        <button
          type="button"
          onClick={useWhole}
          disabled={processing}
          className="w-full py-1.5 text-xs"
          style={{ color: "rgba(255,255,255,0.7)" }}
        >
          Subir la foto sin recortar
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
