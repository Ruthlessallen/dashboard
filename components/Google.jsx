'use client';

import { useState, useEffect } from 'react';
import { relTime, eventTime, dayLabel } from './util.js';

function ConnectPrompt({ configured }) {
  if (!configured) {
    return (
      <div className="empty">
        Falta configurar las credenciales de Google.<br />
        <span style={{ fontSize: 12 }}>Copia <code>.env.local.example</code> a <code>.env.local</code> y sigue el README.</span>
      </div>
    );
  }
  return (
    <div className="empty">
      <a className="btn primary" href="/api/auth/google">Conectar con Google</a>
    </div>
  );
}

export function GmailCard({ data }) {
  const { connected, configured, items = [], unreadCount = 0, error } = data || {};

  return (
    <div className="card">
      <header>
        <h2>Correo</h2>
        {connected && unreadCount > 0 && <span className="badge on">{unreadCount} sin leer</span>}
        <span className="spacer" />
        {connected && (
          <a className="btn ghost" href="https://mail.google.com" target="_blank" rel="noreferrer">
            Abrir Gmail ↗
          </a>
        )}
      </header>
      <div className="body">
        {error && <div className="empty" style={{ color: 'var(--red)' }}>{error}</div>}
        {!connected && !error && <ConnectPrompt configured={configured} />}
        {connected && items.length === 0 && <div className="empty">Bandeja vacía. 🎉</div>}
        {items.map((m) => (
          <a key={m.id} className="row draggable-item" href={m.link} target="_blank" rel="noreferrer" draggable>
            <div className="line1">
              <span className="dot" style={{ background: m.unread ? 'var(--blue)' : 'transparent' }} />
              <span className="title" style={{ fontWeight: m.unread ? 650 : 500 }}>{m.from}</span>
              <span className="when">{relTime(m.date)}</span>
            </div>
            <div style={{ marginLeft: 17 }}>
              <div style={{ fontSize: 13 }}>{m.subject}</div>
              <div className="snippet">{m.snippet}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export function CalendarCard({ data, draggedEvents = [], onViewChange, onDateChange, onDrop, onDeleteDragged }) {
  const [view, setView] = useState('upcoming');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [search, setSearch] = useState('');
  const { connected, configured, items = [], error } = data || {};

  // Notificar cambios de vista y fecha al padre
  useEffect(() => {
    onViewChange?.(view);
    onDateChange?.(selectedDate);
  }, [view, selectedDate, onViewChange, onDateChange]);

  // Los eventos arrastrados que ya se sincronizaron con Google Calendar
  // llegan tambien en "items" (como evento nativo): los marcamos ahi para
  // poder borrarlos, en vez de duplicarlos como fila aparte.
  const draggedByGoogleId = new Map(
    (draggedEvents || []).filter((ev) => ev.google_event_id).map((ev) => [ev.google_event_id, ev.id])
  );
  const itemsMarked = items.map((it) =>
    draggedByGoogleId.has(it.id) ? { ...it, draggedId: draggedByGoogleId.get(it.id) } : it
  );

  // Los que NO se pudieron sincronizar (sin google_event_id) se muestran
  // como fila aparte, igual que antes.
  const convertedDragged = (draggedEvents || [])
    .filter((ev) => !ev.google_event_id)
    .map((ev) => ({
      id: `dragged-${ev.id}`,
      draggedId: ev.id,
      title: ev.title,
      start: ev.event_date + (ev.event_time ? `T${ev.event_time}:00` : 'T09:00:00'),
      link: '#',
      meet: false,
      allDay: ev.all_day,
    }));

  // Combinar eventos y ordenar cronologicamente (si no, lo arrastrado
  // aparece pegado al final en vez de en su fecha real)
  const allEvents = [...itemsMarked, ...convertedDragged].sort(
    (a, b) => new Date(a.start) - new Date(b.start)
  );

  // Filtrar por texto de busqueda (titulo o ubicacion)
  const searchLower = search.trim().toLowerCase();
  const searchedEvents = searchLower
    ? allEvents.filter((ev) =>
        ev.title?.toLowerCase().includes(searchLower) ||
        ev.location?.toLowerCase().includes(searchLower))
    : allEvents;

  // Agrupamos por dia para que la lista se lea como una agenda.
  const groups = [];
  for (const ev of searchedEvents) {
    const key = new Date(ev.start).toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(ev);
    else groups.push({ key, label: dayLabel(ev.start), date: new Date(ev.start), events: [ev] });
  }

  // Mapa dia -> eventos, para pintar la cuadricula de mes
  const eventsByDay = new Map();
  for (const ev of searchedEvents) {
    const key = new Date(ev.start).toDateString();
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key).push(ev);
  }

  const navigate = (dir) => {
    const d = new Date(selectedDate);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + (dir * 7));
    else if (view === 'month') d.setMonth(d.getMonth() + dir);
    setSelectedDate(d);
  };

  const isInRange = (g) => {
    const d = g.date;
    if (view === 'day') return d.toDateString() === selectedDate.toDateString();
    if (view === 'week') {
      const weekStart = new Date(selectedDate);
      weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      return d >= weekStart && d <= weekEnd;
    }
    if (view === 'month') return d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear();
    return true;
  };

  const filteredGroups = view === 'upcoming' ? groups : groups.filter(isInRange);

  // Cuadricula del mes: 6 semanas (42 celdas) empezando en lunes
  const monthDays = (() => {
    if (view !== 'month') return [];
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = (firstOfMonth.getDay() + 6) % 7; // lunes = 0
    const gridStart = new Date(year, month, 1 - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  })();
  const WEEKDAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const today = new Date();
  const dateLabel = view === 'day'
    ? selectedDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    : view === 'week'
    ? `Semana ${Math.ceil(selectedDate.getDate() / 7)}`
    : view === 'month'
    ? selectedDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    : 'Próximas';

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    let text = e.dataTransfer.getData('text/plain') || '';
    if (!text) {
      text = e.dataTransfer.getData('text') || 'Elemento sin título';
    }
    // Limpiar el texto (remover espacios extra, truncar si es muy largo)
    text = text.trim().substring(0, 200);
    if (text) {
      onDrop?.({ text, view, date: selectedDate });
    }
  };

  return (
    <div className="card">
      <header>
        <h2>Agenda</h2>
        <select
          value={view}
          onChange={(e) => { setView(e.target.value); setSelectedDate(new Date()); }}
          style={{
            fontSize: '12px',
            padding: '4px 8px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            cursor: 'pointer',
            color: 'var(--text)',
          }}
        >
          <option value="upcoming">Próximas</option>
          <option value="day">Día a día</option>
          <option value="week">Semana</option>
          <option value="month">Mes</option>
        </select>
        <span className="spacer" />
        {connected && (
          <a className="btn ghost" href="/api/auth/google" title="Vuelve a conceder permisos si arrastrar a la agenda no crea el evento en tu Google Calendar real">
            Reconectar
          </a>
        )}
        {connected && (
          <a className="btn ghost" href="https://calendar.google.com" target="_blank" rel="noreferrer">
            Abrir Calendar ↗
          </a>
        )}
      </header>

      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en la agenda…"
          style={{ width: '100%', fontSize: 12.5, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)' }}
        />
      </div>

      {view !== 'upcoming' && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
          <button className="btn ghost" onClick={() => navigate(-1)}>← Atrás</button>
          <span style={{ fontSize: '12px', fontWeight: 600, flex: 1, textAlign: 'center', textTransform: 'capitalize' }}>{dateLabel}</span>
          <button className="btn ghost" onClick={() => navigate(1)}>Adelante →</button>
        </div>
      )}

      {view === 'month' ? (
        <div className="body drop-zone" style={{ minHeight: '300px', padding: '8px 12px 12px' }} onDragOver={handleDragOver} onDrop={handleDrop}>
          {error && <div className="empty" style={{ color: 'var(--red)' }}>{error}</div>}
          {!connected && !error && <ConnectPrompt configured={configured} />}
          {connected && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} style={{ fontSize: 10.5, fontWeight: 650, color: 'var(--muted)', textAlign: 'center', padding: '2px 0' }}>{w}</div>
              ))}
              {monthDays.map((d, i) => {
                const inMonth = d.getMonth() === selectedDate.getMonth();
                const isToday = d.toDateString() === today.toDateString();
                const dayEvents = eventsByDay.get(d.toDateString()) || [];
                return (
                  <div
                    key={i}
                    onClick={() => { setSelectedDate(d); setView('day'); }}
                    style={{
                      minHeight: 68,
                      borderRadius: 8,
                      padding: '4px 5px',
                      background: isToday ? 'rgba(124,58,237,.08)' : 'var(--panel-2)',
                      border: isToday ? '1px solid var(--accent)' : '1px solid transparent',
                      opacity: inMonth ? 1 : 0.4,
                      cursor: 'pointer',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 600, color: isToday ? 'var(--accent)' : 'var(--text)', marginBottom: 2 }}>
                      {d.getDate()}
                    </div>
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div key={ev.id} style={{ fontSize: 10, lineHeight: 1.3, color: 'var(--text)', background: 'var(--panel)', borderRadius: 3, padding: '1px 3px', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div style={{ fontSize: 9.5, color: 'var(--muted)' }}>+{dayEvents.length - 2} más</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="body drop-zone agenda-list" style={{ minHeight: view === 'upcoming' ? 'auto' : '300px' }} onDragOver={handleDragOver} onDrop={handleDrop}>
        {error && <div className="empty" style={{ color: 'var(--red)' }}>{error}</div>}
        {!connected && !error && <ConnectPrompt configured={configured} />}
        {connected && filteredGroups.length === 0 && <div className="empty">Sin eventos.</div>}
        {filteredGroups.map((g, idx) => (
          <div
            key={`${g.key}-${idx}`}
            style={(view === 'week' || view === 'upcoming') && idx > 0 ? { borderTop: '1px solid var(--border)' } : undefined}
          >
            {(view === 'upcoming' || view === 'week') && (
              <div style={{ padding: '9px 16px 3px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', fontWeight: 700 }}>
                {g.label}
              </div>
            )}
            {g.events.map((ev) => {
              const isLocalOnly = ev.id.startsWith('dragged-'); // no se pudo sincronizar con Google
              const isDeletable = Boolean(ev.draggedId);
              const Row = isLocalOnly ? 'div' : 'a';
              return (
                <Row
                  key={ev.id}
                  className="row draggable-item"
                  href={isLocalOnly ? undefined : ev.link}
                  target={isLocalOnly ? undefined : '_blank'}
                  rel={isLocalOnly ? undefined : 'noreferrer'}
                  draggable
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="line1">
                      <span className="when" style={{ width: 62, color: 'var(--accent)' }}>{eventTime(ev)}</span>
                      <span className="title">{ev.title}</span>
                      {ev.meet && <span className="badge on">Meet</span>}
                    </div>
                    {ev.location && <div className="snippet" style={{ marginLeft: 70 }}>{ev.location}</div>}
                  </div>
                  {isDeletable && (
                    <button
                      className="btn ghost del"
                      title="Quitar de la agenda"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDeleteDragged?.(ev.draggedId); }}
                      style={{ opacity: 1 }}
                    >
                      ✕
                    </button>
                  )}
                </Row>
              );
            })}
          </div>
        ))}
        {connected && (
          <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--muted)', textAlign: 'center', borderTop: '1px solid var(--border)', marginTop: '8px' }}>
            💡 Arrastra tareas, noticias, correos u ofertas aquí
          </div>
        )}
      </div>
      )}
    </div>
  );
}
