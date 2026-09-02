import { getDb } from '@/lib/db.js';

export async function PATCH(req, { params }) {
  const { id } = await params;
  const { name } = await req.json();
  const clean = (name || '').trim();
  if (!clean) return Response.json({ error: 'El nombre no puede estar vacio' }, { status: 400 });

  getDb().prepare('UPDATE checklists SET name = ? WHERE id = ?').run(clean, Number(id));
  return Response.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  const { id } = await params;
  const db = getDb();
  const list = db.prepare('SELECT kind FROM checklists WHERE id = ?').get(Number(id));
  if (!list) return Response.json({ error: 'No existe' }, { status: 404 });
  // General y Diario son fijas: se pueden vaciar, no borrar.
  if (list.kind !== 'custom') {
    return Response.json({ error: 'Las listas General y Diario no se pueden borrar' }, { status: 400 });
  }

  db.prepare('DELETE FROM items WHERE checklist_id = ?').run(Number(id));
  db.prepare('DELETE FROM checklists WHERE id = ?').run(Number(id));
  return Response.json({ ok: true });
}
