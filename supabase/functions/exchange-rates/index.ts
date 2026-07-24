// Edge Function: cotizaciones BCU.
//
// Trae USD (billete, venta), EUR/ARS/BRL (venta + arbitraje contra USD billete),
// UI (unidad indexada) y UR (unidad reajustable), aplica el criterio de Martín:
//
//   - USD/EUR/ARS/BRL: la cotización que el BCU publicó el día D se usa para el
//     día D+1. Sábados, domingos y feriados (sin publicación) arrastran la del
//     último día hábil publicado.
//   - UI: se usa la del mismo día de publicación (sin desfasaje).
//   - UR: se actualiza una vez al mes; guardamos un solo registro por mes.
//
// Fuente: webservice SOAP del BCU (https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/…),
// documentado en https://www.bcu.gub.uy/Acerca-de-BCU/RD_Solicitudes_Informacion/Documentaci%C3%B3n-Agregada/PedroScheeffer169.pdf
//
// IMPORTANTE — primer despliegue: todavía no pudimos probar esta función contra
// el BCU real (sin salida de red desde el entorno de desarrollo). El parseo de
// la respuesta SOAP es defensivo (busca las claves por patrón, no por posición
// fija) y esta función arranca en modo "dry run" (no escribe en la tabla, solo
// devuelve lo que interpretó) para poder validar el mapeo de campos antes de
// programar el cron. Ver instrucciones al final de este archivo.

import { createClient } from "npm:@supabase/supabase-js@2";
import { XMLParser } from "npm:fast-xml-parser@4";

const SOAP_ENDPOINT = "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones";
const MONEDAS_ENDPOINT = "https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcumonedas";

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

type MonedaInfo = { codigo: number; nombre: string };
type CurrencyKey = "USD" | "EUR" | "ARS" | "BRL" | "UI" | "UR";

/** Busca recursivamente todos los objetos que tengan las claves pedidas (case-insensitive), sea cual sea la forma exacta del árbol XML->JSON. */
function findAllByShape(node: unknown, requiredKeyPatterns: RegExp[]): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];
  const visit = (n: unknown) => {
    if (n && typeof n === "object") {
      if (!Array.isArray(n)) {
        const keys = Object.keys(n as Record<string, unknown>);
        if (requiredKeyPatterns.every((p) => keys.some((k) => p.test(k)))) {
          results.push(n as Record<string, unknown>);
        }
      }
      for (const v of Object.values(n as Record<string, unknown>)) visit(v);
    }
  };
  visit(node);
  return results;
}

function getByPattern(obj: Record<string, unknown>, pattern: RegExp): unknown {
  const key = Object.keys(obj).find((k) => pattern.test(k));
  return key ? obj[key] : undefined;
}

async function soapCall(endpoint: string, methodName: string, innerXml: string): Promise<unknown> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cot="Cotiza">
  <soapenv:Header/>
  <soapenv:Body>
    <cot:${methodName}>
      <cot:Entrada>${innerXml}</cot:Entrada>
    </cot:${methodName}>
  </soapenv:Body>
</soapenv:Envelope>`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: envelope,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`BCU respondió ${res.status}: ${text.slice(0, 500)}`);
  return xmlParser.parse(text);
}

/** Trae el listado completo de monedas/unidades del BCU y resuelve los códigos que necesitamos por nombre. */
async function resolverCodigosMoneda(): Promise<Record<CurrencyKey, MonedaInfo>> {
  const parsed = await soapCall(MONEDAS_ENDPOINT, "wsbcumonedas.Execute", "<cot:Grupo>0</cot:Grupo>");
  const rows = findAllByShape(parsed, [/codigo/i, /nombre/i]);
  const monedas: MonedaInfo[] = rows.map((r) => ({
    codigo: Number(getByPattern(r, /codigo/i)),
    nombre: String(getByPattern(r, /nombre/i)).trim().toUpperCase(),
  }));

  const findOptional = (test: (nombre: string) => boolean): MonedaInfo | undefined => monedas.find((x) => test(x.nombre));
  const find = (test: (nombre: string) => boolean, label: string): MonedaInfo => {
    const m = findOptional(test);
    if (!m) throw new Error(`No encontré en el listado de monedas del BCU una entrada para: ${label}. Nombres recibidos: ${monedas.map((x) => x.nombre).join(", ")}`);
    return m;
  };

  // IMPORTANTE: para ARS y BRL usamos la variante "BILLETE", igual que para USD
  // ("DLS. USA BILLETE"). Antes usábamos la variante sin "BILLETE" ("PESO
  // ARGENTINO", "REAL"), pensando que era una serie aparte y más "oficial";
  // pero la página de cotizaciones del BCU (bcu.gub.uy, confirmado a mano)
  // solo publica y actualiza a diario "PESO ARG.BILLETE" y "REAL BILLETE" — no
  // hay una fila separada para la variante sin billete en el listado del día,
  // así que veníamos comparando el arbitraje de ARS/BRL (sin billete) contra
  // USD billete: dos bases distintas, y probablemente datos viejos si esa
  // serie sin billete ya no se actualiza. Confirmado con capturas del usuario
  // el 23/07/2026: DLS. USA BILLETE 40,2 / PESO ARG.BILLETE 0,028 (arbitraje
  // 1435,71) / REAL BILLETE 7,96 (arbitraje 5,05) / UNIDAD INDEXADA 6,6229.
  return {
    USD: find((n) => n.includes("DLS") && n.includes("BILLETE"), "Dólar USA Billete"),
    // EUR no tiene (hasta donde vimos) una variante "BILLETE" separada en el
    // listado público, pero probamos primero por si existiera en el catálogo
    // completo del webservice, y si no, caemos a la variante genérica "EURO".
    EUR: findOptional((n) => n.includes("EURO") && n.includes("BILLETE")) ?? find((n) => n.includes("EURO"), "Euro"),
    ARS: find((n) => n.includes("ARG") && n.includes("BILLETE"), "Peso Argentino Billete"),
    BRL: find((n) => n.includes("REAL") && n.includes("BILLETE"), "Real Billete"),
    UI: find((n) => n.includes("INDEXADA"), "Unidad Indexada"),
    UR: find((n) => n.includes("REAJUST") && !n.includes("PREVISIONAL"), "Unidad Reajustable"),
  };
}

// `arbAct` es el arbitraje que el propio BCU ya trae calculado en su respuesta
// (campo "ArbAct" del webservice) — coincide exacto con la columna "Arbitraje"
// de su página pública. Usamos este valor directamente en vez de recalcularlo
// nosotros dividiendo ventas (ver nota más abajo, en construirSerieDesfasada).
type Cotizacion = { fecha: string; codigo: number; venta: number; arbAct: number | null };
type Diagnostico = { desde: string; hasta: string; codigos: number[]; rawPreview: string };

async function traerCotizacionesRaw(
  codigos: number[],
  fechaDesde: string,
  fechaHasta: string
): Promise<{ text: string; parsed: unknown; rows: Record<string, unknown>[] }> {
  const monedaXml = codigos.map((c) => `<cot:item>${c}</cot:item>`).join("");
  const inner = `<cot:Moneda>${monedaXml}</cot:Moneda><cot:FechaDesde>${fechaDesde}</cot:FechaDesde><cot:FechaHasta>${fechaHasta}</cot:FechaHasta><cot:Grupo>0</cot:Grupo>`;
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cot="Cotiza">
  <soapenv:Header/>
  <soapenv:Body>
    <cot:wsbcucotizaciones.Execute>
      <cot:Entrada>${inner}</cot:Entrada>
    </cot:wsbcucotizaciones.Execute>
  </soapenv:Body>
</soapenv:Envelope>`;
  const res = await fetch(SOAP_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
    body: envelope,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`BCU respondió ${res.status}: ${text.slice(0, 500)}`);
  const parsed = xmlParser.parse(text);
  const rows = findAllByShape(parsed, [/fecha/i, /moneda|codigo/i, /tcv|venta/i]);
  return { text, parsed, rows };
}

async function traerCotizaciones(
  codigos: number[],
  fechaDesde: string,
  fechaHasta: string,
  diagnosticos?: Diagnostico[]
): Promise<Cotizacion[]> {
  const { text, rows } = await traerCotizacionesRaw(codigos, fechaDesde, fechaHasta);
  const resultado = rows
    .map((r) => {
      const arbRaw = getByPattern(r, /arbact/i);
      const arb = arbRaw !== undefined ? Number(arbRaw) : NaN;
      return {
        fecha: String(getByPattern(r, /fecha/i) ?? "").slice(0, 10),
        codigo: Number(getByPattern(r, /moneda|codigo/i)),
        venta: Number(getByPattern(r, /tcv|venta/i)),
        arbAct: Number.isFinite(arb) ? arb : null,
      };
    })
    // El BCU a veces devuelve una fila "vacía" (fecha nula, código 0) en vez de
    // datos reales o un error explícito — la descartamos acá.
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) && r.codigo > 0 && Number.isFinite(r.venta) && r.venta > 0);
  if (resultado.length === 0 && diagnosticos) {
    diagnosticos.push({ desde: fechaDesde, hasta: fechaHasta, codigos, rawPreview: text.slice(0, 1500) });
  }
  return resultado;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Igual que traerCotizaciones, pero parte el rango en tandas más chicas (por
 * defecto ~90 días) para no mandarle al BCU un pedido único gigante (útil
 * para cargar varios años de histórico de una sola invocación). Si se pasa
 * `diagnosticos`, cada tanda que vuelva vacía queda registrada ahí con una
 * muestra de la respuesta cruda del BCU, para poder diagnosticar por qué.
 */
async function traerCotizacionesChunked(
  codigos: number[],
  fechaDesde: string,
  fechaHasta: string,
  diagnosticos?: Diagnostico[],
  diasPorTanda = 89
): Promise<Cotizacion[]> {
  const desde = new Date(fechaDesde + "T00:00:00");
  const hasta = new Date(fechaHasta + "T00:00:00");
  const resultados: Cotizacion[] = [];
  let cursor = desde;
  while (cursor <= hasta) {
    const finTanda = new Date(Math.min(addDays(cursor, diasPorTanda - 1).getTime(), hasta.getTime()));
    const parcial = await traerCotizaciones(codigos, iso(cursor), iso(finTanda), diagnosticos);
    resultados.push(...parcial);
    cursor = addDays(finTanda, 1);
  }
  return resultados;
}

/**
 * Pide varias monedas, pero una por una (no todas juntas en el mismo pedido).
 * El BCU se comporta raro (devuelve una fila vacía en vez de datos reales)
 * cuando se combinan varias monedas en un pedido con muchos días — pidiendo
 * de a una, igual que ya veníamos haciendo con UR, evita el problema.
 */
async function traerCotizacionesPorMoneda(
  codigos: number[],
  fechaDesde: string,
  fechaHasta: string,
  diagnosticos?: Diagnostico[]
): Promise<Cotizacion[]> {
  const resultados: Cotizacion[] = [];
  for (const codigo of codigos) {
    const parcial = await traerCotizacionesChunked([codigo], fechaDesde, fechaHasta, diagnosticos);
    resultados.push(...parcial);
  }
  return resultados;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dryRun") === "1";
    const lookbackDays = Number(url.searchParams.get("lookbackDays") ?? "10");
    // Para el uso normal (cron diario) alcanza con mirar los últimos `lookbackDays`.
    // Para cargar histórico (ej. desde 2020) se puede pasar ?desde=2020-01-01 una
    // sola vez; el pedido al BCU se banda internamente en tandas de ≤1 año.
    const desdeParam = url.searchParams.get("desde");

    const codigos = await resolverCodigosMoneda();

    const hoy = new Date();
    const desde = desdeParam ?? iso(addDays(hoy, -lookbackDays));
    const desdeUR = desdeParam ?? iso(addDays(hoy, -60));
    const hasta = iso(hoy);

    // Modo debug: pide un único rango (sin banda ni desfasajes) para las 5
    // monedas diarias y devuelve las filas tal cual las interpretó, crudas.
    if (url.searchParams.get("debugChunk") === "1") {
      const codigosDiarios = [codigos.USD, codigos.EUR, codigos.ARS, codigos.BRL, codigos.UI];
      const { rows } = await traerCotizacionesRaw(codigosDiarios.map((c) => c.codigo), desde, hasta);
      return Response.json({ codigosResueltos: codigos, desde, hasta, cantidadFilasCrudas: rows.length, primeras10: rows.slice(0, 10) });
    }

    const diagnosticos: Diagnostico[] = [];
    const codigosDiarios = [codigos.USD, codigos.EUR, codigos.ARS, codigos.BRL, codigos.UI];
    const cotizaciones = await traerCotizacionesPorMoneda(codigosDiarios.map((c) => c.codigo), desde, hasta, diagnosticos);
    // UR se pide aparte porque solo hay que retener un valor por mes.
    const cotizacionesUR = await traerCotizacionesChunked([codigos.UR.codigo], desdeUR, hasta, diagnosticos);

    const porCodigo = (codigo: number) =>
      cotizaciones.filter((c) => c.codigo === codigo).sort((a, b) => a.fecha.localeCompare(b.fecha));

    const filas: {
      currency: CurrencyKey;
      rate_date: string;
      published_date: string;
      sell: number;
      arbitrage: number | null;
    }[] = [];

    // USD/EUR/ARS/BRL: la cotización publicada el día D se usa el día D+1. Para
    // cada día calendario del rango (incluidos fines de semana/feriados) buscamos
    // la última publicación anterior a ese día y la usamos — así un día sin
    // publicación (fin de semana/feriado) automáticamente "arrastra" la del
    // último día hábil, sin tener que ir llenando huecos entre pares de filas
    // consecutivas (esa versión anterior tenía un error de índices que se
    // comía el primer día de cada fin de semana largo).
    const usdSerie = porCodigo(codigos.USD.codigo);

    // Busca, dentro de una serie ordenada por fecha, la última publicación
    // con fecha <= limite (o null si no hay ninguna todavía).
    const buscarUltimaPublicacion = (serie: Cotizacion[], limite: string): Cotizacion | null => {
      let res: Cotizacion | null = null;
      for (const row of serie) {
        if (row.fecha <= limite) res = row;
        else break;
      }
      return res;
    };

    const construirSerieDesfasada = (
      key: CurrencyKey,
      serie: Cotizacion[],
      arbitrajeContraUsd: boolean
    ) => {
      if (serie.length === 0) return;
      const primeraPublicacion = new Date(serie[0].fecha + "T00:00:00");
      let cursor = addDays(primeraPublicacion, 1);
      const fin = hoy;
      while (cursor <= fin) {
        const limiteBusqueda = iso(addDays(cursor, -1));
        const pub = buscarUltimaPublicacion(serie, limiteBusqueda);
        if (pub) {
          // Usamos el arbitraje que ya viene calculado por el BCU en su propia
          // respuesta (pub.arbAct), en vez de recalcularlo dividiendo ventas
          // nosotros mismos. Probamos primero dividir venta propia / venta de
          // USD del mismo día de publicación, pero el BCU no siempre publica
          // ARS/BRL/EUR el mismo día calendario que USD, así que ese cálculo
          // quedaba levemente corrido (ej. 1.434,72 en vez de 1.435,71 para
          // ARS el 24/07/2026). El campo ArbAct que trae el BCU coincide
          // exacto con la columna "Arbitraje" de su página pública, así que
          // es la fuente más confiable.
          const arbitrage = arbitrajeContraUsd ? pub.arbAct : null;
          filas.push({ currency: key, rate_date: iso(cursor), published_date: pub.fecha, sell: pub.venta, arbitrage });
        }
        cursor = addDays(cursor, 1);
      }
    };

    construirSerieDesfasada("USD", usdSerie, false);
    construirSerieDesfasada("EUR", porCodigo(codigos.EUR.codigo), true);
    construirSerieDesfasada("ARS", porCodigo(codigos.ARS.codigo), true);
    construirSerieDesfasada("BRL", porCodigo(codigos.BRL.codigo), true);

    // UI: mismo día, sin desfasaje ni arbitraje.
    porCodigo(codigos.UI.codigo).forEach((row) => {
      filas.push({ currency: "UI", rate_date: row.fecha, published_date: row.fecha, sell: row.venta, arbitrage: null });
    });

    // UR: un registro por mes (el último valor publicado de cada mes calendario).
    const urPorMes = new Map<string, Cotizacion>();
    cotizacionesUR
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .forEach((row) => urPorMes.set(row.fecha.slice(0, 7), row));
    for (const row of urPorMes.values()) {
      filas.push({ currency: "UR", rate_date: row.fecha.slice(0, 7) + "-01", published_date: row.fecha, sell: row.venta, arbitrage: null });
    }

    if (dryRun) {
      return Response.json({ dryRun: true, codigosResueltos: codigos, totalFilas: filas.length, diagnosticos, filas }, { status: 200 });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Cargas grandes de histórico pueden ser miles de filas: las mandamos en
    // tandas para no pegarle a Supabase un solo insert gigante.
    const TANDA = 1000;
    for (let i = 0; i < filas.length; i += TANDA) {
      const tanda = filas.slice(i, i + TANDA);
      const { error } = await supabase.from("exchange_rates").upsert(tanda, { onConflict: "currency,rate_date" });
      if (error) throw error;
    }

    return Response.json({ ok: true, filasGuardadas: filas.length });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// CÓMO PROBARLA (antes de programar el cron):
//
// 1. Deploy:  supabase functions deploy exchange-rates
// 2. Invocar en modo prueba (no escribe nada, solo muestra qué interpretó):
//      curl "https://<tu-proyecto>.supabase.co/functions/v1/exchange-rates?dryRun=1" \
//        -H "Authorization: Bearer <SUPABASE_ANON_KEY>"
// 3. Revisá el JSON de respuesta: "codigosResueltos" debe mostrar los 6 códigos
//    reales del BCU (USD, EUR, ARS, BRL, UI, UR) y "filas" una fila por moneda/fecha
//    con "sell" con pinta de cotización real. Si algo no matchea (por ejemplo si
//    el BCU nombra distinto alguna moneda, o los campos de la respuesta de
//    cotizaciones no son los esperados), pasame el JSON de error y lo ajusto.
// 4. Cuando el dry run se vea bien, invocá sin ?dryRun=1 una vez para cargar el
//    histórico inicial, y después programamos el cron diario.
// ─────────────────────────────────────────────────────────────────────────
