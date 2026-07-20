import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { theme as C } from "../styles/theme";

const THRESHOLD = 70; // px que hay que arrastrar hacia abajo para disparar el refresh
const MAX_PULL = 110;

/**
 * Gesto de "deslizar hacia abajo para actualizar", pensado para el celular
 * (los navegadores de escritorio no disparan touch events). Solo se activa
 * si el arrastre empieza con la página ya scrolleada hasta arriba del todo,
 * para no interferir con el scroll normal del resto del contenido.
 */
export function PullToRefresh({
  onRefresh,
  refreshing,
  children,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  children: React.ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      // No activar el gesto si el toque empieza dentro de un modal abierto (tiene su propio scroll interno).
      const target = e.target as HTMLElement | null;
      if (refreshing || window.scrollY > 0 || target?.closest('[role="dialog"]')) {
        startY.current = null;
        pulling.current = false;
        return;
      }
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || startY.current === null) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0 || window.scrollY > 0) {
        pulling.current = false;
        setPull(0);
        return;
      }
      e.preventDefault();
      setPull(Math.min(delta * 0.5, MAX_PULL));
    };

    const onTouchEnd = () => {
      if (pulling.current) {
        setPull((p) => {
          if (p >= THRESHOLD) onRefresh();
          return 0;
        });
      }
      pulling.current = false;
      startY.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [refreshing, onRefresh]);

  const height = refreshing ? 44 : pull;
  const opacity = refreshing ? 1 : Math.min(pull / THRESHOLD, 1);

  return (
    <div ref={containerRef}>
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{ height, opacity, transition: pulling.current ? "none" : "height 0.2s ease, opacity 0.2s ease" }}
      >
        <RefreshCw size={18} color={C.usd} className={refreshing ? "animate-spin" : ""} />
      </div>
      {children}
    </div>
  );
}
