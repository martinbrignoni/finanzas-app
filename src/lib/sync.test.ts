import { describe, it, expect } from "vitest";
import { emptyFinanceData, type FinanceData, type Transaction } from "../types";
import { mergeFinanceData } from "./merge";
import { createSaveQueue } from "./saveQueue";
import { SupabaseRepository, type FinanceRowStore, type FinanceRow } from "./storage";

const tx = (id: string, extra: Partial<Transaction> = {}): Transaction =>
  ({ id, type: "gasto", amountMinor: 1000, currency: "UYU", date: "2026-11-10", note: id, ...extra }) as Transaction;

const withTx = (base: FinanceData, txs: Transaction[]): FinanceData => ({ ...base, transactions: txs });

describe("mergeFinanceData", () => {
  const base = withTx(emptyFinanceData(), [tx("a"), tx("b")]);

  it("conserva las altas de los dos lados", () => {
    const local = withTx(base, [...base.transactions, tx("local")]);
    const remote = withTx(base, [...base.transactions, tx("remote")]);
    const ids = mergeFinanceData(base, local, remote).transactions.map((t) => t.id);
    expect(ids.sort()).toEqual(["a", "b", "local", "remote"]);
  });

  it("aplica un borrado si el otro lado no tocó el registro", () => {
    const local = withTx(base, [base.transactions[1]]); // borró "a"
    const remote = withTx(base, [...base.transactions, tx("remote")]);
    expect(mergeFinanceData(base, local, remote).transactions.map((t) => t.id)).toEqual(["b", "remote"]);
  });

  it("no pierde una edición por un borrado concurrente", () => {
    const local = withTx(base, [base.transactions[1]]); // borró "a"
    const remote = withTx(base, [tx("a", { amountMinor: 5000 }), base.transactions[1]]); // el otro editó "a"
    const merged = mergeFinanceData(base, local, remote);
    expect(merged.transactions.find((t) => t.id === "a")?.amountMinor).toBe(5000);
  });

  it("combina ediciones de campos distintos del mismo registro", () => {
    const local = withTx(base, [tx("a", { amountMinor: 2000 }), base.transactions[1]]);
    const remote = withTx(base, [tx("a", { note: "nota del otro" }), base.transactions[1]]);
    const a = mergeFinanceData(base, local, remote).transactions.find((t) => t.id === "a")!;
    expect(a.amountMinor).toBe(2000);
    expect(a.note).toBe("nota del otro");
  });

  it("si chocan en el mismo campo gana el local", () => {
    const local = withTx(base, [tx("a", { amountMinor: 2000 }), base.transactions[1]]);
    const remote = withTx(base, [tx("a", { amountMinor: 3000 }), base.transactions[1]]);
    expect(mergeFinanceData(base, local, remote).transactions[0].amountMinor).toBe(2000);
  });

  it("deja una sola cuota recurrente si los dos dispositivos la generaron a la vez", () => {
    const local = withTx(base, [...base.transactions, tx("gen-local", { recurringRuleId: "r1", date: "2026-11-15" })]);
    const remote = withTx(base, [...base.transactions, tx("gen-remote", { recurringRuleId: "r1", date: "2026-11-15" })]);
    const ids = mergeFinanceData(base, local, remote).transactions.map((t) => t.id);
    expect(ids).toContain("gen-remote");
    expect(ids).not.toContain("gen-local");
  });

  it("no toca recurrentes que ya existían", () => {
    const b = withTx(emptyFinanceData(), [tx("x1", { recurringRuleId: "r1" }), tx("x2", { recurringRuleId: "r1" })]);
    const local = withTx(b, [...b.transactions, tx("nuevo")]);
    const merged = mergeFinanceData(b, local, withTx(b, [...b.transactions, tx("otro")]));
    expect(merged.transactions.map((t) => t.id).sort()).toEqual(["nuevo", "otro", "x1", "x2"]);
  });
});

/** Fila de `finance_data` en memoria, con la misma regla de versión que Supabase. */
function memoryStore(initial: FinanceData | null) {
  let n = 0;
  let row: FinanceRow | null = initial ? { data: structuredClone(initial), version: `v${n++}` } : null;
  let failFetch = false;
  const store: FinanceRowStore & { row: () => FinanceRow | null; externalWrite: (d: FinanceData) => void; setFailFetch: (v: boolean) => void } = {
    async ownerId() {
      return "owner";
    },
    async fetch() {
      if (failFetch) throw new Error("network");
      return row ? { data: structuredClone(row.data), version: row.version } : null;
    },
    async updateIfVersion(_o, data, expected) {
      if (!row || row.version !== expected) return null;
      row = { data: structuredClone(data), version: `v${n++}` };
      return row.version;
    },
    async insert(_o, data) {
      if (row) return null;
      row = { data: structuredClone(data), version: `v${n++}` };
      return row.version;
    },
    row: () => row,
    externalWrite: (d) => {
      row = { data: structuredClone(d), version: `v${n++}` };
    },
    setFailFetch: (v) => {
      failFetch = v;
    },
  };
  return store;
}

describe("SupabaseRepository (versiones)", () => {
  it("si falla la lectura lanza error en vez de devolver datos vacíos", async () => {
    const store = memoryStore(withTx(emptyFinanceData(), [tx("a")]));
    store.setFailFetch(true);
    await expect(new SupabaseRepository(store).load()).rejects.toThrow();
    // La fila del servidor sigue intacta.
    expect((store.row()!.data as FinanceData).transactions).toHaveLength(1);
  });

  it("un dispositivo con datos viejos no pisa lo que guardó otro", async () => {
    const store = memoryStore(withTx(emptyFinanceData(), [tx("a")]));
    const phoneMartin = new SupabaseRepository(store);
    const phonePareja = new SupabaseRepository(store);
    const stale = await phoneMartin.load(); // abierto desde ayer
    const fresh = await phonePareja.load();

    await phonePareja.save(withTx(fresh, [...fresh.transactions, tx("de-ella")]));
    const written = await phoneMartin.save(withTx(stale, [...stale.transactions, tx("de-el")]));

    const ids = (store.row()!.data as FinanceData).transactions.map((t) => t.id).sort();
    expect(ids).toEqual(["a", "de-el", "de-ella"]);
    expect(written.transactions.map((t) => t.id).sort()).toEqual(ids);
  });

  it("también respeta escrituras del servidor (cron de recordatorios)", async () => {
    const start = emptyFinanceData();
    const store = memoryStore(start);
    const repo = new SupabaseRepository(store);
    const loaded = await repo.load();
    store.externalWrite({ ...start, reminders: [{ id: "rem", title: "x", date: "2026-11-20", assignedUserIds: [], notifiedAt: "t" } as never] });
    await repo.save(withTx(loaded, [tx("a")]));
    const saved = store.row()!.data as FinanceData;
    expect(saved.reminders.map((r) => r.id)).toEqual(["rem"]);
    expect(saved.transactions.map((t) => t.id)).toEqual(["a"]);
  });

  it("crea la fila la primera vez", async () => {
    const store = memoryStore(null);
    const repo = new SupabaseRepository(store);
    const loaded = await repo.load();
    await repo.save(withTx(loaded, [tx("a")]));
    expect((store.row()!.data as FinanceData).transactions).toHaveLength(1);
  });

  it("no guarda antes de haber cargado", async () => {
    await expect(new SupabaseRepository(memoryStore(null)).save(emptyFinanceData())).rejects.toThrow();
  });
});

describe("createSaveQueue", () => {
  it("guarda de a uno y solo el último estado pendiente", async () => {
    const saved: number[] = [];
    let release: () => void = () => {};
    const q = createSaveQueue<number>(async (n) => {
      if (n === 1) await new Promise<void>((r) => (release = r));
      saved.push(n);
      return n;
    });
    q.enqueue(1);
    q.enqueue(2);
    q.enqueue(3);
    release();
    await q.idle();
    expect(saved).toEqual([1, 3]);
    expect(q.hasUnsavedChanges()).toBe(false);
  });

  it("recuerda que quedaron cambios sin guardar si falla", async () => {
    const q = createSaveQueue<number>(async () => {
      throw new Error("offline");
    });
    q.enqueue(1);
    await q.idle();
    expect(q.hasUnsavedChanges()).toBe(true);
  });
});
