import { loadEmpleos } from '@/lib/empleos.js';
import { scraperStatus } from '@/lib/scraper-runner.js';
import { getDb } from '@/lib/db.js';
import { claveOferta } from '@/lib/ofertas-clave.js';
import { clavesPostulaciones } from '@/lib/postulaciones-csv.js';
import { clavesCerradas, lanzarVerificacion, verificacionEnCurso } from '@/lib/ofertas-abiertas.js';

export const dynamic = 'force-dynamic';

// Fase de una postulacion -> estado de la oferta en /empleos
const estadoDesdeFase = (fase) =>
  fase === 'discarded' ? 'dismissed' : fase === 'sent' || fase === 'pending' || fase === 'other' ? 'applied' : null;

export async function GET() {
  const payload = loadEmpleos();

  // Mis marcas (por identificador de oferta, no por enlace exacto)
  const marcas = new Map();
  for (const r of getDb().prepare('SELECT url, state FROM empleo_estado').all()) {
    marcas.set(claveOferta(r.url) || r.url, r.state);
  }
  // Lo que ya consta en postulaciones.csv cuenta como revisado: aplicada o descartada
  const postulaciones = clavesPostulaciones();

  // Ofertas de LinkedIn que ya no aceptan solicitudes (comprobadas en segundo plano)
  const cerradas = clavesCerradas();

  const items = payload.items.map((i) => {
    const k = i.clave || i.url;
    const base = cerradas.has(k) && !i.excludedReason
      ? { ...i, excludedReason: 'Cerrada: ya no acepta solicitudes' }
      : i;
    const propia = marcas.get(k);
    if (propia) return { ...base, state: propia, stateSource: 'dashboard' };
    const derivada = estadoDesdeFase(postulaciones.get(k));
    return { ...base, state: derivada, stateSource: derivada ? 'postulaciones' : null };
  });

  // Comprobamos en segundo plano las que aun no se han mirado (no bloquea la respuesta)
  lanzarVerificacion(items);

  return Response.json({ ...payload, items, scraper: scraperStatus(), verificacion: { running: verificacionEnCurso() } });
}
