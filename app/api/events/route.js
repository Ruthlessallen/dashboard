import { getDb } from '@/lib/db';
import { createCalendarEvent, deleteCalendarEvent, patchCalendarEvent } from '@/lib/google';

export async function GET(req) {
  try {
    const db = getDb();
    const events = db.prepare(
      'SELECT * FROM dragged_events ORDER BY event_date DESC LIMIT 100'
    ).all();
    return Response.json(events);
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const db = getDb();
    const { title, event_date, event_time, all_day, source, description } = await req.json();
    const desc = description?.trim() || null;

    // Intentamos crear el evento tambien en el Google Calendar real del
    // usuario; si falla (no conectado, scope insuficiente...) seguimos
    // guardandolo igualmente en local para no perder el drag & drop.
    let googleEventId = null;
    let googleError = null;
    try {
      const created = await createCalendarEvent({
        title,
        date: event_date,
        time: event_time,
        allDay: Boolean(all_day),
        description: desc,
      });
      googleEventId = created.id;
    } catch (err) {
      googleError = err.message;
    }

    db.prepare(`
      INSERT INTO dragged_events (title, event_date, event_time, all_day, source, google_event_id, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(title, event_date, event_time, all_day ? 1 : 0, source, googleEventId, desc);

    return Response.json({ success: true, googleEventId, googleError }, { status: 201 });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// Cambia la descripcion (y opcionalmente el titulo) de un evento. Se identifica
// por googleEventId (vale para cualquier evento de la agenda) o por id local.
export async function PATCH(req) {
  try {
    const db = getDb();
    const { googleEventId, id, description, title } = await req.json();
    const desc = description === undefined ? undefined : (description.trim() || null);

    let googleError = null;
    if (googleEventId) {
      try {
        await patchCalendarEvent(googleEventId, {
          title,
          description: desc === undefined ? undefined : (desc ?? ''),
        });
      } catch (err) {
        googleError = err.message;
      }
    }

    const where = googleEventId ? 'google_event_id = ?' : 'id = ?';
    const key = googleEventId || Number(id);
    if (desc !== undefined) db.prepare(`UPDATE dragged_events SET description = ? WHERE ${where}`).run(desc, key);
    if (title !== undefined) db.prepare(`UPDATE dragged_events SET title = ? WHERE ${where}`).run(title, key);

    return Response.json({ success: !googleError, googleError });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const db = getDb();
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'Falta id' }, { status: 400 });

    const row = db.prepare('SELECT google_event_id FROM dragged_events WHERE id = ?').get(Number(id));
    if (row?.google_event_id) {
      await deleteCalendarEvent(row.google_event_id).catch((err) => console.error('Error borrando de Google Calendar:', err));
    }

    db.prepare('DELETE FROM dragged_events WHERE id = ?').run(Number(id));

    return Response.json({ success: true });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
