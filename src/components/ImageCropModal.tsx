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

  const [rect, setRect] = useState<CropRect>({ x: 5, y: 5, w: 90, h: 90 });
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const startRectRef = useRef<CropRect>(rect);
  const startPosRef = useRef({ x: 0, y: 0 });

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
        Arrastrá las esquinas o los lados para dejar afuera lo que no es el comprobante.
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
          onLoad={() => setImgLoaded(true)}
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
