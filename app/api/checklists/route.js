import { getDb, resetDailyIfNeeded } from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  resetDailyIfNeeded();
  const db = getDb();
  const lists = db.prepare('SELECT * FROM checklists ORDER BY position, id').all();
  const items = db.prepare('SELECT * FROM items ORDER BY done, position, id').all();

  return Response.json(
    lists.map((l) => ({
      ...l,
      items: items
        .filter((i) => i.checklist_id === l.id)
        .map((i) => ({ ...i, done: Boolean(i.done) })),
    }))
  );
}

export async function POST(req) {
  const { name, color = 'violet' } = await req.json();
  const clean = (name || '').trim();
  if (!clean) return Response.json({ error: 'El nombre no puede estar vacio' }, { status: 400 });

  const db = getDb();
  const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM checklists').get().p;
  const info = db
    .prepare('INSERT INTO checklists (name, kind, color, position) VALUES (?, ?, ?, ?)')
    .run(clean, 'custom', color, pos);

  const row = db.prepare('SELECT * FROM checklists WHERE id = ?').get(info.lastInsertRowid);
  return Response.json({ ...row, items: [] }, { status: 201 });
}
