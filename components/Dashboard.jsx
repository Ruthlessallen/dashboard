'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GmailCard, CalendarCard } from './Google.jsx';
import Jobs from './Jobs.jsx';
import News from './News.jsx';
import Checklists from './Checklists.jsx';

const NEWS_POLL_MS = 15 * 60 * 1000;
const GOOGLE_POLL_MS = 5 * 60 * 1000;

export default function Dashboard() {
  const [gmail, setGmail] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [news, setNews] = useState(null);
  const [lists, setLists] = useState([]);
  const [auth, setAuth] = useState(null);
  const [refreshingNews, setRefreshingNews] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [agendaModal, setAgendaModal] = useState(null);
  const [agendaView, setAgendaView] = useState('upcoming');
  const [agendaDate, setAgendaDate] = useState(new Date());
  const [draggedEvents, setDraggedEvents] = useState([]);

  // --- Redimensionar columnas -------------------------------------------
  const MIN_COL_PX = 220;
  const [colPx, setColPx] = useState(null); // null = usar el layout por defecto (fr)
  const [isDesktop, setIsDesktop] = useState(false);
  const colRefs = useRef([]);
  const resizeState = useRef(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dashboard-col-widths') || 'null');
      if (Array.isArray(saved) && saved.length === 5) setColPx(saved);
    } catch {}

    const mq = window.matchMedia('(min-width: 1201px)');
    setIsDesktop(mq.matches);
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const startResize = useCallback((idx) => (e) => {
    e.preventDefault();
    const base = colPx || colRefs.current.map((el) => el?.getBoundingClientRect().width || 200);
    resizeState.current = { idx, startX: e.clientX, base };

    const onMove = (ev) => {
      const { idx, startX, base } = resizeState.current;
      // El ancho se traspasa solo entre las dos columnas vecinas, nunca se
      // crea ni se quita ancho total: asi ensanchar una nunca empuja el
      // resto fuera de la pantalla. dx se recorta para que ninguna de las
      // dos baje del minimo.
      const maxGrow = base[idx + 1] - MIN_COL_PX;
      const maxShrink = base[idx] - MIN_COL_PX;
      const dx = Math.min(Math.max(ev.clientX - startX, -maxShrink), maxGrow);
      const next = [...base];
      next[idx] = base[idx] + dx;
      next[idx + 1] = base[idx + 1] - dx;
      setColPx(next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      resizeState.current = null;
      setColPx((cur) => {
        if (cur) {
          try { localStorage.setItem('dashboard-col-widths', JSON.stringify(cur)); } catch {}
        }
        return cur;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [colPx]);

  const gridStyle = isDesktop && colPx
    ? { gridTemplateColumns: colPx.map((w) => `${Math.round(w)}px`).join(' 18px ') }
    : undefined;

  const loadGoogle = useCallback(async () => {
    const [g, c, a] = await Promise.all([
      fetch('/api/gmail').then((r) => r.json()).catch(() => null),
      fetch('/api/calendar').then((r) => r.json()).catch(() => null),
      fetch('/api/auth/status').then((r) => r.json()).catch(() => null),
    ]);
    setGmail(g);
    setCalendar(c);
    setAuth(a);
  }, []);

  const loadNews = useCallback(async (force = false) => {
    setRefreshingNews(true);
    try {
      const r = await fetch(`/api/news${force ? '?refresh=1' : ''}`);
      setNews(await r.json());
    } finally {
      setRefreshingNews(false);
    }
  }, []);

  const loadLists = useCallback(async () => {
    setLists(await fetch('/api/checklists').then((r) => r.json()).catch(() => []));
  }, []);

  const loadDraggedEvents = useCallback(async () => {
    setDraggedEvents(await fetch('/api/events').then((r) => r.json()).catch(() => []));
  }, []);

  useEffect(() => {
    loadGoogle();
    loadNews();
    loadLists();
    loadDraggedEvents();
    const a = setInterval(loadGoogle, GOOGLE_POLL_MS);
    const b = setInterval(() => loadNews(), NEWS_POLL_MS);
    const c = setInterval(loadDraggedEvents, 30000);

    // Setup drag & drop listeners
    const handleDragStart = (e) => {
      // Preferimos el texto del titulo real (evita arrastrar el icono del
      // asa "⠿" o la "✕" de borrar, que tambien viven dentro de la fila)
      const titleEl = e.target.querySelector?.('.txt, .title');
      const text = (titleEl?.textContent || e.target.textContent || e.target.innerText || '').trim();
      setDraggedItem({ text, type: e.target.className });
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', text);
    };

    const handleDragEnd = () => {
      setDraggedItem(null);
    };

    document.addEventListener('dragstart', handleDragStart, true);
    document.addEventListener('dragend', handleDragEnd, true);

    return () => {
      clearInterval(a);
      clearInterval(b);
      clearInterval(c);
      document.removeEventListener('dragstart', handleDragStart, true);
      document.removeEventListener('dragend', handleDragEnd, true);
    };
  }, [loadGoogle, loadNews, loadLists, loadDraggedEvents]);


  const handleDrop = (info) => {
    setAgendaModal(info);
  };

  const saveToAgenda = async (formData) => {
    try {
      // Determinar la fecha del evento
      let eventDate = new Date(agendaModal.date);
      if (agendaModal.dayFixed) {
        // El día ya viene fijado (se soltó sobre una celda concreta del mes)
      } else if (agendaView === 'upcoming' && formData.day) {
        eventDate = new Date(formData.day);
      } else if (agendaView === 'week' && formData.dayOfWeek) {
        const daysMap = { lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6, domingo: 0 };
        const targetDay = daysMap[formData.dayOfWeek];
        const weekStart = new Date(agendaDate);
        weekStart.setDate(agendaDate.getDate() - agendaDate.getDay());
        eventDate = new Date(weekStart);
        eventDate.setDate(weekStart.getDate() + targetDay);
      } else if (agendaView === 'month' && formData.dayOfMonth) {
        eventDate = new Date(agendaDate.getFullYear(), agendaDate.getMonth(), parseInt(formData.dayOfMonth));
      }

      const dateStr = eventDate.toISOString().split('T')[0];
      const timeStr = formData.time === 'all-day' ? null : formData.time;

      // Guardar en BD
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: agendaModal.text,
          event_date: dateStr,
          event_time: timeStr,
          all_day: formData.time === 'all-day' ? 1 : 0,
          source: 'dragged',
        }),
      });

      // Recargar los eventos arrastrados
      await loadDraggedEvents();
      setAgendaModal(null);
    } catch (err) {
      console.error('Error al guardar:', err);
    }
  };

  const deleteFromAgenda = async (draggedId) => {
    try {
      await fetch(`/api/events?id=${draggedId}`, { method: 'DELETE' });
      await loadDraggedEvents();
    } catch (err) {
      console.error('Error al borrar:', err);
    }
  };

  return (
    <div className="shell">
      <div className="grid" style={gridStyle}>
        <div className="col area-cal" ref={(el) => { colRefs.current[0] = el; }}>
          <CalendarCard
            data={calendar}
            draggedEvents={draggedEvents}
            onViewChange={setAgendaView}
            onDateChange={setAgendaDate}
            onDrop={handleDrop}
            onDeleteDragged={deleteFromAgenda}
          />
        </div>

        {isDesktop && <div className="h1 col-resize-handle" title="Arrastra para ensanchar" onMouseDown={startResize(0)} />}

        <div className="col area-lists" ref={(el) => { colRefs.current[1] = el; }}>
          <Checklists lists={lists} refresh={loadLists} />
        </div>

        {isDesktop && <div className="h2 col-resize-handle" title="Arrastra para ensanchar" onMouseDown={startResize(1)} />}

        <div className="col area-news" ref={(el) => { colRefs.current[2] = el; }}>
          <News data={news} onRefresh={() => loadNews(true)} refreshing={refreshingNews} />
        </div>

        {isDesktop && <div className="h3 col-resize-handle" title="Arrastra para ensanchar" onMouseDown={startResize(2)} />}

        <div className="col area-mail" ref={(el) => { colRefs.current[3] = el; }}>
          <GmailCard data={gmail} />
        </div>

        {isDesktop && <div className="h4 col-resize-handle" title="Arrastra para ensanchar" onMouseDown={startResize(3)} />}

        <div className="col area-jobs" ref={(el) => { colRefs.current[4] = el; }}>
          <Jobs />
        </div>
      </div>

      {/* Modal para añadir a Agenda */}
      {agendaModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setAgendaModal(null)}
        >
          <div
            className="card"
            style={{ width: '400px', maxWidth: '90vw' }}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>Añadir a Agenda</h2>
              <span className="spacer" />
              <button
                className="btn ghost"
                onClick={() => setAgendaModal(null)}
                style={{ padding: '4px 8px' }}
              >
                ✕
              </button>
            </header>
            <AddToAgendaForm
              item={agendaModal}
              view={agendaView}
              onSave={saveToAgenda}
              onCancel={() => setAgendaModal(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AddToAgendaForm({ item, view, onSave, onCancel }) {
  const [hour, setHour] = useState('10');
  const [minute, setMinute] = useState('00');
  const [allDay, setAllDay] = useState(false);
  const [day, setDay] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState('');

  const handleSave = () => {
    onSave({
      time: allDay ? 'all-day' : `${hour}:${minute}`,
      day,
      dayOfWeek,
      dayOfMonth,
    });
  };

  return (
    <div className="body" style={{ padding: '16px' }}>
      <div style={{ marginBottom: '16px' }}>
        <strong style={{ fontSize: '13px' }}>Elemento:</strong>
        <div style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
          {item.text?.substring(0, 60)}
        </div>
      </div>

      {view === 'upcoming' && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>
              ¿Qué día? (ej: 2026-09-02)
            </label>
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value)}
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '6px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
              }}
            />
          </div>
        </>
      )}

      {(view === 'day' || item.dayFixed) && (
        <div style={{ marginBottom: '12px', fontSize: '12px', color: 'var(--muted)' }}>
          Día: {item.date?.toLocaleDateString('es-ES')}
        </div>
      )}

      {view === 'week' && !item.dayFixed && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>
              ¿Qué día de la semana?
            </label>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '6px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
              }}
            >
              <option value="">Selecciona un día</option>
              <option value="lunes">Lunes</option>
              <option value="martes">Martes</option>
              <option value="miercoles">Miércoles</option>
              <option value="jueves">Jueves</option>
              <option value="viernes">Viernes</option>
              <option value="sabado">Sábado</option>
              <option value="domingo">Domingo</option>
            </select>
          </div>
        </>
      )}

      {view === 'month' && !item.dayFixed && (
        <>
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600 }}>
              ¿Qué día del mes? (1-31)
            </label>
            <input
              type="number"
              min="1"
              max="31"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '6px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
              }}
            />
          </div>
        </>
      )}

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          ¿Es todo el día?
        </label>
      </div>

      {!allDay && (
        <div style={{ marginBottom: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600 }}>Hora</label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <input
              type="number"
              min="0"
              max="23"
              value={hour}
              onChange={(e) => setHour(String(e.target.value).padStart(2, '0'))}
              style={{ width: '60px', padding: '6px', border: '1px solid var(--border)', borderRadius: '6px' }}
            />
            <span>:</span>
            <input
              type="number"
              min="0"
              max="59"
              value={minute}
              onChange={(e) => setMinute(String(e.target.value).padStart(2, '0'))}
              style={{ width: '60px', padding: '6px', border: '1px solid var(--border)', borderRadius: '6px' }}
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn primary" onClick={handleSave}>Guardar</button>
      </div>
    </div>
  );
}
