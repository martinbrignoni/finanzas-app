import { useState } from "react";
import { Delete, Copy, Check } from "lucide-react";
import { theme as C } from "../styles/theme";
import { Modal } from "./ui";

type Op = "+" | "−" | "×" | "÷";

const IVA_RATE = 0.22;

/** Redondea a 10 decimales y saca ceros/artefactos de punto flotante (ej. 0.1 + 0.2). */
function clean(n: number): number {
  return Math.round(n * 1e10) / 1e10;
}

/** Redondeo a 2 decimales, para los resultados de IVA. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function applyOp(a: number, b: number, op: Op): number {
  switch (op) {
    case "+":
      return a + b;
    case "−":
      return a - b;
    case "×":
      return a * b;
    case "÷":
      return b === 0 ? NaN : a / b;
  }
}

function formatDisplay(raw: string): string {
  if (raw === "Error") return raw;
  const [intPart, decPart] = raw.split(".");
  const negative = intPart.startsWith("-");
  const digits = negative ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const withSign = negative ? `-${grouped}` : grouped;
  return decPart !== undefined ? `${withSign},${decPart}` : withSign;
}

/**
 * Calculadora rápida, autocontenida, para no tener que salir de la app a
 * hacer una cuenta. No está conectada a ningún movimiento: es solo una
 * herramienta de apoyo, el resultado hay que copiarlo a mano donde haga falta.
 */
export function CalculatorModal({ onClose }: { onClose: () => void }) {
  const [display, setDisplay] = useState("0");
  const [previous, setPrevious] = useState<number | null>(null);
  const [operator, setOperator] = useState<Op | null>(null);
  const [overwrite, setOverwrite] = useState(true);
  const [copied, setCopied] = useState(false);
  /**
   * Memoria de los botones de IVA: qué botón se apretó ("add"/"remove"), sobre
   * qué valor original ("base") y en qué de sus dos estados está parado. Se
   * borra apenas se hace cualquier otra cosa (tipear, operar, limpiar), para
   * que el toggle solo funcione en apretadas consecutivas del mismo botón.
   */
  const [ivaToggle, setIvaToggle] = useState<{ kind: "add" | "remove"; base: number; state: 1 | 2 } | null>(null);

  const inputDigit = (d: string) => {
    setIvaToggle(null);
    if (display === "Error" || overwrite) {
      setDisplay(d === "." ? "0." : d);
      setOverwrite(false);
      return;
    }
    if (d === "." && display.includes(".")) return;
    if (display.replace("-", "").replace(".", "").length >= 12) return;
    setDisplay(display === "0" && d !== "." ? d : display + d);
  };

  const clearAll = () => {
    setDisplay("0");
    setPrevious(null);
    setOperator(null);
    setOverwrite(true);
    setIvaToggle(null);
  };

  const backspace = () => {
    if (overwrite || display === "Error") return;
    setIvaToggle(null);
    const next = display.length > 1 ? display.slice(0, -1) : "0";
    setDisplay(next === "-" ? "0" : next);
  };

  const toggleSign = () => {
    if (display === "0" || display === "Error") return;
    setIvaToggle(null);
    setDisplay(display.startsWith("-") ? display.slice(1) : `-${display}`);
  };

  const percent = () => {
    if (display === "Error") return;
    setIvaToggle(null);
    setDisplay(String(clean(parseFloat(display) / 100)));
  };

  const chooseOperator = (op: Op) => {
    if (display === "Error") return;
    setIvaToggle(null);
    const current = parseFloat(display);
    if (previous !== null && operator && !overwrite) {
      const result = applyOp(previous, current, operator);
      setPrevious(result);
      setDisplay(Number.isFinite(result) ? String(clean(result)) : "Error");
    } else {
      setPrevious(current);
    }
    setOperator(op);
    setOverwrite(true);
  };

  const equals = () => {
    if (previous === null || !operator || display === "Error") return;
    setIvaToggle(null);
    const current = parseFloat(display);
    const result = applyOp(previous, current, operator);
    setDisplay(Number.isFinite(result) ? String(clean(result)) : "Error");
    setPrevious(null);
    setOperator(null);
    setOverwrite(true);
  };

  /**
   * Botón "+IVA / IVA": 1ra apretada, sobre el valor que había en pantalla,
   * calcula el total con IVA (valor × 1.22). Si lo volvés a apretar sin tocar
   * nada más, alterna y muestra solo el IVA de ese mismo valor original
   * (valor × 0.22); apretadas siguientes siguen alternando entre las dos.
   */
  const addIvaToggle = () => {
    if (display === "Error") return;
    const continuing = ivaToggle?.kind === "add";
    const base = continuing ? ivaToggle!.base : parseFloat(display);
    const nextState: 1 | 2 = continuing ? (ivaToggle!.state === 1 ? 2 : 1) : 1;
    const result = nextState === 1 ? base * (1 + IVA_RATE) : base * IVA_RATE;
    setDisplay(String(round2(result)));
    setOverwrite(true);
    setIvaToggle({ kind: "add", base, state: nextState });
  };

  /**
   * Botón "−IVA / IVA": 1ra apretada, sobre el valor que había en pantalla
   * (tomado como total con IVA incluido), calcula el neto (valor ÷ 1.22). Si
   * lo volvés a apretar sin tocar nada más, alterna y muestra solo el IVA
   * contenido en ese mismo valor original (valor ÷ 1.22 × 0.22); apretadas
   * siguientes siguen alternando entre las dos.
   */
  const removeIvaToggle = () => {
    if (display === "Error") return;
    const continuing = ivaToggle?.kind === "remove";
    const base = continuing ? ivaToggle!.base : parseFloat(display);
    const nextState: 1 | 2 = continuing ? (ivaToggle!.state === 1 ? 2 : 1) : 1;
    const result = nextState === 1 ? base / (1 + IVA_RATE) : (base / (1 + IVA_RATE)) * IVA_RATE;
    setDisplay(String(round2(result)));
    setOverwrite(true);
    setIvaToggle({ kind: "remove", base, state: nextState });
  };

  const copyResult = async () => {
    if (display === "Error") return;
    try {
      await navigator.clipboard.writeText(display);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // si el navegador bloquea el portapapeles, no rompemos nada: el usuario puede copiar a mano
    }
  };

  const btnStyle: React.CSSProperties = {
    background: C.surface2,
    color: C.text,
  };
  const opStyle: React.CSSProperties = {
    background: C.surface3,
    color: C.usd,
  };

  const Btn = ({
    label,
    onClick,
    style,
    span,
  }: {
    label: React.ReactNode;
    onClick: () => void;
    style?: React.CSSProperties;
    span?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`py-4 rounded-xl text-lg font-semibold ${span ? "col-span-2" : ""}`}
      style={style ?? btnStyle}
    >
      {label}
    </button>
  );

  return (
    <Modal title="Calculadora" onClose={onClose}>
      <div
        className="relative rounded-xl px-4 py-5 mb-3 text-right"
        style={{ background: C.surface2, border: `1px solid ${C.border}` }}
      >
        <button
          onClick={copyResult}
          aria-label="Copiar resultado"
          className="absolute top-2.5 left-2.5 p-1.5 rounded-md flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: copied ? C.positive : C.textFaint }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copiado" : "Copiar"}
        </button>
        {operator && (
          <div className="text-xs font-mono mb-1" style={{ color: C.textFaint }}>
            {formatDisplay(String(previous))} {operator}
          </div>
        )}
        <div
          className="font-mono font-semibold truncate"
          style={{ color: display === "Error" ? C.negative : C.text, fontSize: "32px" }}
        >
          {formatDisplay(display)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          onClick={addIvaToggle}
          className="py-2.5 rounded-lg text-xs font-semibold"
          style={{ background: ivaToggle?.kind === "add" ? C.surface3 : C.surface2, color: C.uyu, border: `1px solid ${C.border}` }}
        >
          +IVA / IVA
          <div className="text-[10px] font-normal" style={{ color: C.textFaint }}>
            {ivaToggle?.kind === "add" && ivaToggle.state === 2 ? "mostrando IVA" : "×1.22"}
          </div>
        </button>
        <button
          onClick={removeIvaToggle}
          className="py-2.5 rounded-lg text-xs font-semibold"
          style={{ background: ivaToggle?.kind === "remove" ? C.surface3 : C.surface2, color: C.uyu, border: `1px solid ${C.border}` }}
        >
          −IVA / IVA
          <div className="text-[10px] font-normal" style={{ color: C.textFaint }}>
            {ivaToggle?.kind === "remove" && ivaToggle.state === 2 ? "mostrando IVA" : "÷1.22"}
          </div>
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Btn label="C" onClick={clearAll} style={{ background: C.surface3, color: C.negative }} />
        <Btn label="±" onClick={toggleSign} style={opStyle} />
        <Btn label="%" onClick={percent} style={opStyle} />
        <Btn label="÷" onClick={() => chooseOperator("÷")} style={operator === "÷" ? { ...opStyle, background: C.usd, color: "#0A1413" } : opStyle} />

        <Btn label="7" onClick={() => inputDigit("7")} />
        <Btn label="8" onClick={() => inputDigit("8")} />
        <Btn label="9" onClick={() => inputDigit("9")} />
        <Btn label="×" onClick={() => chooseOperator("×")} style={operator === "×" ? { ...opStyle, background: C.usd, color: "#0A1413" } : opStyle} />

        <Btn label="4" onClick={() => inputDigit("4")} />
        <Btn label="5" onClick={() => inputDigit("5")} />
        <Btn label="6" onClick={() => inputDigit("6")} />
        <Btn label="−" onClick={() => chooseOperator("−")} style={operator === "−" ? { ...opStyle, background: C.usd, color: "#0A1413" } : opStyle} />

        <Btn label="1" onClick={() => inputDigit("1")} />
        <Btn label="2" onClick={() => inputDigit("2")} />
        <Btn label="3" onClick={() => inputDigit("3")} />
        <Btn label="+" onClick={() => chooseOperator("+")} style={operator === "+" ? { ...opStyle, background: C.usd, color: "#0A1413" } : opStyle} />

        <Btn label="0" onClick={() => inputDigit("0")} span />
        <Btn label="," onClick={() => inputDigit(".")} />
        <Btn label={<Delete size={18} className="mx-auto" />} onClick={backspace} />
      </div>

      <button
        onClick={equals}
        className="w-full py-3.5 rounded-xl text-lg font-semibold mt-2"
        style={{ background: C.usd, color: "#0A1413" }}
      >
        =
      </button>
    </Modal>
  );
}
