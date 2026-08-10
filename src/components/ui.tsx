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

  // Abre el selector nativo del sistema. `showPicker()` es la forma "oficial"
  // de hacerlo desde un botón propio (soportado en iOS Safari 16.4+ y en los
  // navegadores de escritorio actuales); si no está disponible, hacemos foco
  // + click sobre el input real como respaldo.
  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try {
        el.showPicker();
        return;
      } catch {
        // sigue al respaldo de abajo
      }
    }
    el.focus();
    el.click();
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
      <button
        type="button"
        onClick={openPicker}
        className="flex-1 text-center py-2 rounded-md text-sm font-medium"
        style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.text }}
      >
        {formatDateDMY(value)}
      </button>
      <button
        type="button"
        onClick={() => onChange(addDaysToDate(value, 1))}
        aria-label="Día siguiente"
        className="w-9 h-9 shrink-0 rounded-md flex items-center justify-center"
        style={{ background: C.surface2, border: `1px solid ${C.border}`, color: C.textMuted }}
      >
        <ChevronRight size={16} />
      </button>
      {/* Input real, oculto visualmente pero conectado al DOM (no `display:none`)
          para que `showPicker()`/`focus()`/`click()` sigan funcionando. */}
      <input
        ref={inputRef}
        id={id}
        type="date"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-hidden="true"
        tabIndex={-1}
        style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0, fontSize: "16px" }}
      />
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
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
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
  };

  return (
    <div className="relative" ref={containerRef}>
      <input
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
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-lg overflow-hidden max-h-56 overflow-y-auto"
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
                    onClick={() => selectOption(opt)}
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
