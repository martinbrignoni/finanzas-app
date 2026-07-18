import React, { useEffect, useId } from "react";
import { X } from "lucide-react";
import { theme as C } from "../styles/theme";
import type { Currency } from "../types";

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: C.surface2,
  border: `1px solid ${C.border}`,
  borderRadius: "8px",
  padding: "9px 10px",
  color: C.text,
  fontSize: "15px",
  outline: "none",
};

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
    <label htmlFor={id} className="block mb-3">
      <span className="block text-xs mb-1" style={{ color: C.textMuted }}>{label}</span>
      {children(id)}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      style={{ ...inputStyle, ...(props.style || {}) }}
      onFocus={(e) => { e.currentTarget.style.borderColor = C.usd; props.onFocus?.(e); }}
      onBlur={(e) => { e.currentTarget.style.borderColor = C.border; props.onBlur?.(e); }}
    />
  );
}

export function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} style={inputStyle}>{children}</select>;
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
        className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        style={{ background: C.surface, border: `1px solid ${C.border}` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="flex items-center justify-between mb-4">
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
