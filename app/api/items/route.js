import { getDb } from '@/lib/db.js';

export async function POST(req) {
  const { checklist_id, text } = await req.json();
  const clean = (text || '').trim();
  if (!clean) return Response.json({ error: 'La tarea no puede estar vacia' }, { status: 400 });

  const db = getDb();
  const pos = db
    .prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM items WHERE checklist_id = ?')
    .get(Number(checklist_id)).p;

  const info = db
    .prepare('INSERT INTO items (checklist_id, text, position) VALUES (?, ?, ?)')
    .run(Number(checklist_id), clean, pos);

  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(info.lastInsertRowid);
  return Response.json({ ...row, done: Boolean(row.done) }, { status: 201 });
}
