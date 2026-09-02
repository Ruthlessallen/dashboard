import { getDb, today } from '@/lib/db.js';

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();

  if (typeof body.done === 'boolean') {
    db.prepare('UPDATE items SET done = ?, done_on = ? WHERE id = ?')
      .run(body.done ? 1 : 0, body.done ? today() : null, Number(id));
  }
  if (typeof body.text === 'string' && body.text.trim()) {
    db.prepare('UPDATE items SET text = ? WHERE id = ?').run(body.text.trim(), Number(id));
  }
  if (typeof body.position === 'number') {
    db.prepare('UPDATE items SET position = ? WHERE id = ?').run(body.position, Number(id));
  }

  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(Number(id));
  return Response.json({ ...row, done: Boolean(row.done) });
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  getDb().prepare('DELETE FROM items WHERE id = ?').run(Number(id));
  return Response.json({ ok: true });
}
