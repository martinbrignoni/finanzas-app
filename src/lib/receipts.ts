import { supabase } from "./supabaseClient";

/**
 * Bucket privado de Supabase Storage donde se guardan las fotos de
 * comprobantes. Cada archivo vive bajo `${userId}/...`, y las políticas RLS
 * del bucket restringen el acceso a que cada usuario solo pueda ver/subir/
 * borrar los archivos dentro de su propia carpeta.
 */
const BUCKET = "receipts";

/**
 * Redimensiona y comprime una foto en el navegador antes de subirla (máximo
 * 1600px de lado más largo, JPEG calidad 82%), para no gastar de más en
 * storage ni demorar la subida con fotos de varios MB tomadas con el celular.
 * Si el navegador no puede procesar el archivo (formato no soportado, etc.),
 * lanza y el llamador sube el archivo original tal cual.
 */
async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen en este navegador.");
  ctx.drawImage(bitmap, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen."))), "image/jpeg", quality);
  });
}

/**
 * Sube la foto de un comprobante para un movimiento puntual y devuelve la
 * ruta guardada (no la URL, porque el bucket es privado). `movementId` se
 * usa como parte del nombre de archivo para que quede asociado, aunque el
 * movimiento todavía no se haya guardado en la base.
 */
export async function uploadReceipt(file: File, movementId: string): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("No hay sesión activa, no se puede subir el comprobante.");

  let blob: Blob = file;
  let contentType = file.type || "image/jpeg";
  let ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  try {
    blob = await compressImage(file);
    contentType = "image/jpeg";
    ext = "jpg";
  } catch {
    // Si el navegador no puede comprimir (formato raro, etc.), subimos el archivo tal cual.
  }

  // Sufijo random además del timestamp: si se suben varios archivos juntos
  // (en paralelo) para el mismo movimiento, Date.now() solo no alcanza para
  // garantizar rutas distintas.
  const suffix = Math.random().toString(36).slice(2, 8);
  const path = `${userId}/${movementId}-${Date.now()}-${suffix}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: true });
  if (error) throw error;
  return path;
}

/**
 * Junta las rutas de comprobantes de un movimiento, sea que use el campo
 * viejo de un solo archivo (`receiptPath`) o el nuevo de varios
 * (`receiptPaths`). Todo lo que se guarda de acá en adelante usa
 * `receiptPaths`; `receiptPath` queda solo por compatibilidad con
 * movimientos guardados antes de permitir más de un comprobante.
 */
export function receiptPathsOf(entity: { receiptPath?: string; receiptPaths?: string[] } | undefined | null): string[] {
  if (!entity) return [];
  if (entity.receiptPaths && entity.receiptPaths.length > 0) return entity.receiptPaths;
  return entity.receiptPath ? [entity.receiptPath] : [];
}

/** Genera una URL firmada y temporal (10 minutos) para ver un comprobante. */
export async function getReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error || !data) throw error ?? new Error("No se pudo generar el link del comprobante.");
  return data.signedUrl;
}

/** Borra un comprobante del storage. Falla en silencio: no queremos bloquear al usuario si el archivo ya no está. */
export async function deleteReceipt(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}
