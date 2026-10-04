import { getDb } from '@/lib/db.js';

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
    db.prepare(
      `INSERT INTO empleo_estado (url, state) VALUES (?, ?)
       ON CONFLICT(url) DO UPDATE SET state = excluded.state, updated_at = datetime('now')`
    ).run(url, state);
  } else {
    return Response.json({ error: 'Estado no valido' }, { status: 400 });
  }
  return Response.json({ ok: true });
}
