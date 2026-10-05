import { getDb } from '@/lib/db.js';

export const dynamic = 'force-dynamic';

const STATES = ['rejected', 'active'];

// state: 'rejected' (me han descartado) | 'active' (sigo adelante) | null (quitar mi marca)
export async function POST(req) {
  const { key, state } = await req.json().catch(() => ({}));
  if (typeof key !== 'string' || !key) return Response.json({ error: 'Falta la clave' }, { status: 400 });

  const db = getDb();
  if (state === null) {
    db.prepare('DELETE FROM postulacion_estado WHERE key = ?').run(key);
  } else if (STATES.includes(state)) {
    db.prepare(
      `INSERT INTO postulacion_estado (key, state) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET state = excluded.state, updated_at = datetime('now', 'localtime')`
    ).run(key, state);
  } else {
    return Response.json({ error: 'Estado no valido' }, { status: 400 });
  }
  return Response.json({ ok: true });
}
