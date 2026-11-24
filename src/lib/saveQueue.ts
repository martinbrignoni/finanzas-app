/**
 * Cola de guardado: un solo guardado en vuelo a la vez, y siempre con el
 * estado más reciente.
 *
 * Antes cada cambio disparaba su propio `save()` en paralelo. Con red lenta
 * podían llegar al servidor fuera de orden y un estado viejo pisar a uno
 * nuevo. Acá, si hay un guardado en curso y llegan más cambios, se espera a
 * que termine y se guarda solo el último (los intermedios ya están incluidos
 * en él, porque cada estado es la app completa).
 */
export interface SaveQueue<T> {
  enqueue(data: T): void;
  /** Resuelve cuando no queda nada pendiente ni en curso. */
  idle(): Promise<void>;
  /** `true` si el último estado encolado todavía no se guardó con éxito. */
  hasUnsavedChanges(): boolean;
}

export function createSaveQueue<T>(
  save: (data: T) => Promise<T>,
  handlers: {
    onSaved?: (submitted: T, written: T) => void;
    onError?: (err: unknown) => void;
    onBusyChange?: (busy: boolean) => void;
  } = {}
): SaveQueue<T> {
  let pending: { data: T } | null = null;
  let running = false;
  let unsaved = false;
  let waiters: Array<() => void> = [];

  const run = async () => {
    running = true;
    handlers.onBusyChange?.(true);
    while (pending) {
      const { data } = pending;
      pending = null;
      try {
        const written = await save(data);
        if (!pending) unsaved = false;
        handlers.onSaved?.(data, written);
      } catch (err) {
        unsaved = true;
        handlers.onError?.(err);
      }
    }
    running = false;
    handlers.onBusyChange?.(false);
    const w = waiters;
    waiters = [];
    w.forEach((resolve) => resolve());
  };

  return {
    enqueue(data) {
      pending = { data };
      unsaved = true;
      if (!running) void run();
    },
    idle() {
      if (!running && !pending) return Promise.resolve();
      return new Promise((resolve) => waiters.push(resolve));
    },
    hasUnsavedChanges() {
      return unsaved;
    },
  };
}
