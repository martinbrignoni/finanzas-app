/**
 * Descarga diferida de un módulo con recuperación ante deploys.
 *
 * Cada publicación cambia los nombres de los archivos JS. Si la app quedó
 * abierta desde antes de un deploy y se abre por primera vez una pantalla
 * diferida (o se exporta a Excel), el archivo viejo ya no existe y la
 * descarga falla. En ese caso se recarga la página una vez (los datos ya
 * están guardados en el servidor) para traer la versión nueva. Si vuelve a
 * fallar enseguida (ej. sin conexión), se propaga el error en vez de
 * recargar en bucle.
 */
const RELOAD_KEY = "finanzas:chunk-reload-at";

export async function importWithReload<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    let last = 0;
    try {
      last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    } catch {
      // sessionStorage no disponible: se intenta igual una vez
    }
    if (Date.now() - last > 60_000) {
      try {
        window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      } catch {
        // ignorar
      }
      window.location.reload();
      return new Promise<T>(() => {}); // la página se está recargando
    }
    throw err;
  }
}
