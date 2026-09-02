import { getDb } from '@/lib/db';
import { createCalendarEvent, deleteCalendarEvent } from '@/lib/google';

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
    const { title, event_date, event_time, all_day, source } = await req.json();

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
      });
      googleEventId = created.id;
    } catch (err) {
      googleError = err.message;
    }

    db.prepare(`
      INSERT INTO dragged_events (title, event_date, event_time, all_day, source, google_event_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(title, event_date, event_time, all_day ? 1 : 0, source, googleEventId);

    return Response.json({ success: true, googleEventId, googleError }, { status: 201 });
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
