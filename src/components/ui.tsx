import React, { useEffect, useId, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { theme as C } from "../styles/theme";
import type { Currency } from "../types";
import { addDaysToDate, formatDateDMY } from "../lib/dates";

/**
 * OJO: esto tiene que ser una función, no un objeto fijo. `theme` (importado
 * como `C`) es mutable y se pisa en el lugar al cambiar de modo claro/oscuro
 * (ver styles/theme.ts), pero si arma­mos este objeto una sola vez al cargar
 * el módulo, queda "congelado" con los colores del modo que estaba activo en
 * ese momento y nunca más se entera de los cambios de tema, aunque el resto
 * de la app sí se vuelva a pintar. Llamando a la función en cada render se
 * lee `C.xxx` siempre al día.
 */
function getInputStyle(): React.CSSProperties {
  return {
    width: "100%",
    background: C.surface2,
    border: `1px solid ${C.border}`,
    borderRadius: "8px",
    padding: "8px 10px",
    color: C.text,
    // OJO: 16px es el mínimo para que iOS Safari NO haga zoom automático al
    // enfocar el campo (con menos de 16px, el navegador agranda la pantalla
    // entera al tocar el input). No bajar de acá en inputs/selects.
    fontSize: "16px",
    outline: "none",
  };
}

export function Segment<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex rounded-lg p-1 gap-1" style={{ background: C.surface2, border: `1px solid ${C.border}` }} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className="flex-1 text-sm py-1.5 rounded-md transition-colors"
          style={{
            background: value === o.value ? C.surface3 : "transparent",
            color: value === o.value ? C.text : C.textMuted,
            fontWeight: value === o.value ? 600 : 400,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="block mb-2.5">
      <span className="block text-xs mb-1" style={{ color: C.textMuted }}>{label}</span>
      {children(id)}
    </label>
  );
}

/**
 * Selector de fecha compacto: en vez de un `<input type="date">` ancho (que
 * en iPhone ocupa todo el renglón), muestra la fecha en formato DD/MM/AAAA
 * con flechas a los costados para avanzar/retroceder un día. Tocando el
 * texto de la fecha se abre igual el selector nativo del sistema, superpuesto
 * de forma invisible sobre el texto (truco estándar, funciona en iOS/Android
 * sin JS extra).
 */
export function DateStepper({ value, onChange, id }: { value: string; onChange: (v: string) => void; id?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);

  // `showPicker()` es la forma "oficial" de abrir el selector nativo desde
  // JS (iOS Safari 16.4+ y navegadores de escritorio actuales). La sumamos
  // como refuerzo del tap directo de abajo, por si algún dispositivo no lo
  // dispara solo con el toque.
  const openPicker = () => {
    const el = inputRef.current;
    if (el && typeof el.showPicker === "function") {
      try {
        el.showPicker();
      } catch {
        // el toque directo sobre el input (ver más abajo) ya debería alcanzar.
      }
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(addDaysToDate(value, -1))}
        aria-label="Día anterior"
        className="w-9 h-9 shrink-0 rounded-md flex items-center justify-center"
        style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.textMuted }}
      >
        <ChevronLeft size={16} />
      </button>
      <div className="relative flex-1">
        {/* Capa puramente visual: `pointer-events: none` para que el toque
            SIEMPRE llegue al input real de abajo, nunca se quede acá. */}
        <div
          className="text-center py-2 rounded-md text-sm font-medium pointer-events-none"
          style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
        >
          {formatDateDMY(value)}
        </div>
        {/* Input real, del tamaño completo del campo pero invisible (opacity
            0, no display:none): el toque del usuario cae directo sobre él,
            que es la forma más confiable de que el navegador abra el
            selector nativo (más que llamarlo por JS desde otro elemento). */}
        <input
          ref={inputRef}
          id={id}
          type="date"
          value={value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          onClick={openPicker}
          aria-label="Elegir fecha"
          className="absolute inset-0 w-full h-full"
          style={{ opacity: 0, fontSize: "16px", cursor: "pointer", zIndex: 1 }}
        />
      </div>
      <button
        type="button"
        onClick={() => onChange(addDaysToDate(value, 1))}
        aria-label="Día siguiente"
        className="w-9 h-9 shrink-0 rounded-md flex items-center justify-center"
        style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.textMuted }}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{ ...getInputStyle(), ...(props.style || {}) }}
      onFocus={(e) => { e.currentTarget.style.borderColor = C.usd; props.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = C.border; props.onBlur?.(e); }}
    />
  );
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={{ ...getInputStyle(), ...(props.style || {}) }}>{children}</select>;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={4}
      {...props}
      style={{ ...getInputStyle(), resize: "vertical", fontFamily: "inherit", ...(props.style || {}) }}
      onFocus={(e) => { e.currentTarget.style.borderColor = C.usd; props.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = C.border; props.onBlur?.(e); }}
    />
  );
}

export interface ComboboxOption {
  value: string;
  label: string;
  /** Encabezado de grupo (opcional), para agrupar visualmente como un <optgroup>. */
  group?: string;
}

/**
 * Selector "combo": igual que un `<select>` en lo que hace (elegís de una
 * lista cerrada de opciones), pero además dejás escribir para filtrarla en
 * vivo, útil cuando la lista es larga (categorías, cuentas, tarjetas). No
 * acepta valores libres: si no se elige una opción de la lista, al perder el
 * foco vuelve a mostrar la selección anterior.
 */
export function Combobox({
  id,
  options,
  value,
  onChange,
  placeholder,
  emptyText = "Sin resultados",
  defaultOpen = false,
  inline = false,
}: {
  id?: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  /**
   * Arranca con la lista ya desplegada (sin foco ni teclado), para que el
   * usuario vea las opciones de una apenas aparece el campo (ej. al elegir
   * "Cuenta"/"Tarjeta" como medio de pago). Si igual toca el input, se
   * comporta como siempre: se puede escribir para filtrar.
   */
  defaultOpen?: boolean;
  /**
   * Si es true, la lista desplegada ocupa espacio real en el documento y
   * empuja el contenido de abajo, en vez de flotar por encima como overlay.
   * Pensado para formularios largos y scrolleables donde conviene que el
   * resto se corra para abajo (ej. Cuenta/Tarjeta como medio de pago, para
   * que el scroll automático llegue de verdad hasta el botón Guardar). El
   * picker de categoría y otros usos siguen con el overlay de siempre.
   */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Además de filtrar por el nombre de la opción, también busca por el grupo
  // (ej. escribir "MINUCHI" muestra todas sus categorías, aunque el nombre de
  // cada una en particular -"Ventas", "Compras"- no contenga esa palabra).
  const filtered = query.trim()
    ? options.filter((o) => {
        const q = query.trim().toLowerCase();
        return o.label.toLowerCase().includes(q) || !!o.group?.toLowerCase().includes(q);
      })
    : options;

  // Agrupa manteniendo el orden original, uniendo opciones consecutivas del mismo grupo.
  const groups: { group: string | undefined; items: ComboboxOption[] }[] = [];
  for (const opt of filtered) {
    const last = groups[groups.length - 1];
    if (last && last.group === opt.group) last.items.push(opt);
    else groups.push({ group: opt.group, items: [opt] });
  }

  const selectOption = (opt: ComboboxOption) => {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
    // Por las dudas el input haya quedado enfocado (ver comentario en el
    // onClick de cada opción, más abajo): lo desenfocamos a mano para que
    // el teclado del celular se cierre solo, ya que la selección ya se hizo.
    inputRef.current?.blur();
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={open ? query : selected?.label ?? ""}
        placeholder={placeholder ?? selected?.label ?? "Escribí para buscar..."}
        autoComplete="off"
        style={getInputStyle()}
        onFocus={(e) => { setOpen(true); setQuery(""); e.currentTarget.style.borderColor = C.usd; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = C.border; }}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setOpen(false); setQuery(""); (e.target as HTMLInputElement).blur(); }
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered.length > 0) selectOption(filtered[0]);
          }
        }}
      />
      {open && (
        <div
          className={
            // En modo inline mostramos la lista completa (sin límite de alto
            // ni scroll propio): el scroll de la página ya se encarga, y así
            // se ven todas las opciones de una en vez de solo las primeras.
            inline
              ? "mt-1.5 rounded-lg overflow-hidden"
              : "absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-lg overflow-hidden max-h-56 overflow-y-auto"
          }
          style={{ background: C.surface, border: `1px solid ${C.border}` }}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-xs" style={{ color: C.textFaint }}>{emptyText}</div>
          ) : (
            groups.map((g, gi) => (
              <div key={gi}>
                {g.group && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: C.textFaint }}>
                    {g.group}
                  </div>
                )}
                {g.items.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      // El botón vive dentro del <label htmlFor> del Field
                      // (ver Field más arriba), que a su vez apunta al
                      // <input> de este combobox. En iOS Safari, si no se
                      // frena acá el evento, el label igual reenvía el click
                      // al input y le abre el teclado apenas después de
                      // elegir la opción. preventDefault + stopPropagation
                      // cortan ese reenvío sin afectar la selección en sí
                      // (que hacemos explícitamente abajo).
                      e.preventDefault();
                      e.stopPropagation();
                      selectOption(opt);
                    }}
                    className="w-full text-left px-3 py-2 text-sm"
                    style={{ color: opt.value === value ? C.usd : C.text, background: opt.value === value ? C.surface2 : "transparent" }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 sm:p-5 max-h-[85vh] overflow-y-auto"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 id="modal-title" className="text-lg font-semibold font-display" style={{ color: C.text }}>{title}</h3>
          <button onClick={onClose} aria-label="Cerrar" style={{ color: C.textMuted }}><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Diálogo de confirmación genérico, pensado sobre todo para acciones de
 * eliminar. Se monta por encima de todo (incluso de un Modal ya abierto).
 */
export function ConfirmDialog({
  title = "¿Eliminar?",
  message,
  confirmLabel = "Eliminar",
  onConfirm,
  onCancel,
}: {
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onCancel}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xs rounded-2xl p-5"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h3 id="confirm-title" className="text-base font-semibold mb-2 font-display" style={{ color: C.text }}>{title}</h3>
        <p className="text-sm mb-5" style={{ color: C.textMuted }}>{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: C.surface2, color: C.text }}
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: C.negative, color: "#fff" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PrimaryButton({ children, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      disabled={disabled}
      className="w-full py-2.5 rounded-lg font-semibold text-sm mt-2 disabled:opacity-50"
      style={{ background: C.usd, color: "#0A1413" }}
    >
      {children}
    </button>
  );
}

export function IconBtn({ onClick, children, danger, label }: { onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; children: React.ReactNode; danger?: boolean; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} className="p-2 rounded-md" style={{ color: danger ? C.negative : C.textMuted }}>
      {children}
    </button>
  );
}

export function CurrencyPill({ currency }: { currency: Currency }) {
  const color = currency === "USD" ? C.usd : C.uyu;
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: "#0A1413", background: color }}>
      {currency}
    </span>
  );
}

/**
 * Fila deslizable (ej. una fila de Movimientos): `children` se arrastra hacia
 * la izquierda con el dedo para revelar `actions` (ej. Historial/Editar/
 * Eliminar) escondidas detrás, en vez de mostrarlas siempre y competir por
 * espacio con los datos del registro. `open`/`onOpenChange` quedan a cargo de
 * quien la usa, para poder mantener una sola fila abierta a la vez y cerrarla
 * al tocar en otro lado (ver `Transactions.tsx`).
 *
 * El gesto vertical (scroll normal de la lista) no se pisa: `touch-action:
 * pan-y` le deja ese eje al navegador y esta lógica solo reacciona al
 * arrastre horizontal. Si el arrastre fue real (más de unos pocos px), se
 * frena el click sintético que dispara el navegador al soltar el dedo, para
 * que no dispare la acción de `children` (ej. abrir el detalle) sin querer.
 */
export function SwipeableRow({
  children,
  actions,
  actionsWidth = 132,
  open,
  onOpenChange,
}: {
  children: React.ReactNode;
  actions: React.ReactNode;
  actionsWidth?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const startXRef = useRef<number | null>(null);
  const baseDxRef = useRef(0);
  const draggedRef = useRef(false);
  const [dragDx, setDragDx] = useState<number | null>(null);

  const clamp = (v: number) => Math.min(0, Math.max(-actionsWidth, v));

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    baseDxRef.current = open ? -actionsWidth : 0;
    draggedRef.current = false;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (startXRef.current === null) return;
    const dx = e.touches[0].clientX - startXRef.current;
    if (Math.abs(dx) > 6) draggedRef.current = true;
    setDragDx(clamp(baseDxRef.current + dx));
  };
  const handleTouchEnd = () => {
    if (dragDx !== null) onOpenChange(dragDx < -actionsWidth / 2);
    startXRef.current = null;
    setDragDx(null);
  };
  // Frena el click sintético post-arrastre (ver comentario arriba), pero deja pasar un toque real (sin arrastre).
  const handleContentClickCapture = (e: React.MouseEvent) => {
    if (draggedRef.current) {
      e.preventDefault();
      e.stopPropagation();
      draggedRef.current = false;
    }
  };

  const offset = dragDx !== null ? dragDx : open ? -actionsWidth : 0;

  return (
    <div className="relative rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-end gap-1 pr-2"
        style={{ width: actionsWidth, background: C.surface2 }}
      >
        {actions}
      </div>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClickCapture={handleContentClickCapture}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragDx !== null ? "none" : "transform 200ms ease-out",
          touchAction: "pan-y",
          background: C.surface,
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}
