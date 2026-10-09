import { getDb } from './db.js';

/**
 * Comprueba si las ofertas de LinkedIn siguen aceptando solicitudes.
 *
 * El scraper solo ve la oferta una vez: LinkedIn las cierra a las pocas horas
 * (p. ej. al llegar al limite de solicitantes), asi que una oferta recien
 * scrapeada puede estar ya cerrada. La pagina publica de la oferta
 * (jobs-guest/jobPosting/<id>) lleva el bloque "closed-job" cuando esta cerrada.
 *
 * - Solo se miran las ofertas visibles (no excluidas ni marcadas por mi).
 * - Una cerrada queda cerrada; una abierta se vuelve a mirar pasadas 6 h.
 * - Una peticion cada 1,5 s, como mucho 80 por pasada, y se para ante un 429/403.
 * - Se lanza en segundo plano desde GET /api/empleos; nunca dos a la vez.
 */

const RECHECK_OPEN_MS = 6 * 3600 * 1000;
const DELAY_MS = 1500;
const MAX_PER_RUN = 80;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

let running = false;

export const verificacionEnCurso = () => running;

export function clavesCerradas() {
  try {
    return new Set(getDb().prepare('SELECT clave FROM oferta_cerrada WHERE closed = 1').all().map((r) => r.clave));
  } catch {
    return new Set();
  }
}

function pendientes(items) {
  const db = getDb();
  const filas = new Map(db.prepare('SELECT clave, closed, checked_at FROM oferta_cerrada').all().map((r) => [r.clave, r]));
  const now = Date.now();
  return items
    .filter((i) => i.clave?.startsWith('li:') && !i.excludedReason && !i.state)
    .filter((i) => {
      const f = filas.get(i.clave);
      return !f || (!f.closed && now - Date.parse(f.checked_at) > RECHECK_OPEN_MS);
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, MAX_PER_RUN);
}

// true = cerrada, false = abierta, null = no se pudo saber, 'stop' = nos limitan
async function estaCerrada(id) {
  const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' },
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 429 || res.status === 403 || res.status === 999) return 'stop';
  if (res.status === 404 || res.status === 410) return true;
  if (!res.ok) return null;
  return (await res.text()).includes('closed-job');
}

export function lanzarVerificacion(items) {
  if (running) return;
  let lista;
  try {
    lista = pendientes(items);
  } catch {
    return;
  }
  if (!lista.length) return;

  running = true;
  (async () => {
    const db = getDb();
    const guardar = db.prepare(
      `INSERT INTO oferta_cerrada (clave, closed, checked_at) VALUES (?, ?, ?)
       ON CONFLICT(clave) DO UPDATE SET closed = excluded.closed, checked_at = excluded.checked_at`,
    );
    for (const it of lista) {
      try {
        const r = await estaCerrada(it.clave.slice(3));
        if (r === 'stop') break;
        if (r !== null) guardar.run(it.clave, r ? 1 : 0, new Date().toISOString());
      } catch {
        // red caida o timeout: se reintenta en la siguiente pasada
      }
      await new Promise((ok) => setTimeout(ok, DELAY_MS));
    }
  })().finally(() => { running = false; });
}
