import { getDb } from '@/lib/db.js';
import { loadEmpleos } from '@/lib/empleos.js';
import { esPracticas } from '@/lib/postulaciones.js';
import { claveOferta } from '@/lib/ofertas-clave.js';

export const dynamic = 'force-dynamic';

const STATES = ['applied', 'dismissed'];

// Borra todas las marcas de esa oferta (misma oferta aunque el enlace sea distinto)
function borrarMarcas(db, url) {
  const clave = claveOferta(url);
  for (const r of db.prepare('SELECT url FROM empleo_estado').all()) {
    if (r.url === url || (clave && claveOferta(r.url) === clave)) {
      db.prepare('DELETE FROM empleo_estado WHERE url = ?').run(r.url);
    }
  }
}

// state: 'applied' | 'dismissed' | null (null = deshacer)
export async function POST(req) {
  const { url, state } = await req.json().catch(() => ({}));
  if (typeof url !== 'string' || !url) return Response.json({ error: 'Falta la url' }, { status: 400 });

  const db = getDb();
  if (state === null) {
    borrarMarcas(db, url);
  } else if (STATES.includes(state)) {
    // Guardamos una copia de la oferta: la tarjeta Postulaciones la sigue mostrando
    // aunque el scraper regenere el CSV y la oferta ya no este.
    const clave = claveOferta(url);
    const oferta = loadEmpleos().items.find((i) => i.url === url || (clave && i.clave === clave));
    const data = oferta
      ? JSON.stringify({
          title: oferta.title,
          company: oferta.company,
          location: oferta.location,
          mode: oferta.mode,
          source: oferta.source,
          practicas: esPracticas(oferta.title, ''),
        })
      : null;
    borrarMarcas(db, url);
    db.prepare(
      "INSERT INTO empleo_estado (url, state, data, updated_at) VALUES (?, ?, ?, datetime('now', 'localtime'))"
    ).run(url, state, data);
  } else {
    return Response.json({ error: 'Estado no valido' }, { status: 400 });
  }
  return Response.json({ ok: true });
}
