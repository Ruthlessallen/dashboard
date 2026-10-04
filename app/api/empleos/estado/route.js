import { getDb } from '@/lib/db.js';
import { loadEmpleos } from '@/lib/empleos.js';
import { esPracticas } from '@/lib/postulaciones.js';

export const dynamic = 'force-dynamic';

const STATES = ['applied', 'dismissed'];

// state: 'applied' | 'dismissed' | null (null = deshacer)
export async function POST(req) {
  const { url, state } = await req.json().catch(() => ({}));
  if (typeof url !== 'string' || !url) return Response.json({ error: 'Falta la url' }, { status: 400 });

  const db = getDb();
  if (state === null) {
    db.prepare('DELETE FROM empleo_estado WHERE url = ?').run(url);
  } else if (STATES.includes(state)) {
    // Guardamos una copia de la oferta: la tarjeta Postulaciones la sigue mostrando
    // aunque el scraper regenere el CSV y la oferta ya no este.
    const oferta = loadEmpleos().items.find((i) => i.url === url);
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
    db.prepare(
      `INSERT INTO empleo_estado (url, state, data, updated_at) VALUES (?, ?, ?, datetime('now', 'localtime'))
       ON CONFLICT(url) DO UPDATE SET state = excluded.state, data = excluded.data, updated_at = excluded.updated_at`
    ).run(url, state, data);
  } else {
    return Response.json({ error: 'Estado no valido' }, { status: 400 });
  }
  return Response.json({ ok: true });
}
