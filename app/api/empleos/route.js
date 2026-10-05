import { loadEmpleos } from '@/lib/empleos.js';
import { scraperStatus } from '@/lib/scraper-runner.js';
import { getDb } from '@/lib/db.js';
import { claveOferta } from '@/lib/ofertas-clave.js';
import { clavesPostulaciones } from '@/lib/postulaciones-csv.js';

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

  const items = payload.items.map((i) => {
    const k = i.clave || i.url;
    const propia = marcas.get(k);
    if (propia) return { ...i, state: propia, stateSource: 'dashboard' };
    const derivada = estadoDesdeFase(postulaciones.get(k));
    return { ...i, state: derivada, stateSource: derivada ? 'postulaciones' : null };
  });
  return Response.json({ ...payload, items, scraper: scraperStatus() });
}
