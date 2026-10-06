'use client';

import { useEffect, useState } from 'react';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const proximaHora = () => `${pad((new Date().getHours() + 1) % 24)}:00`;

/** Formulario para crear un evento en la agenda (Google Calendar + copia local). */
export default function NuevoEvento({ date, onClose, onSaved }) {
  const [title, setTitle] = useState('');
  const [day, setDay] = useState(ymd(date || new Date()));
  const [allDay, setAllDay] = useState(false);
  const [time, setTime] = useState(proximaHora());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function guardar(e) {
    e.preventDefault();
    if (!title.trim() || !day || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          event_date: day,
          event_time: allDay ? null : time,
          all_day: allDay ? 1 : 0,
          source: 'manual',
        }),
      }).then((r) => r.json());
      if (res.error) throw new Error(res.error);
      onSaved?.();
      if (res.googleError) {
        // Se guardo en el dashboard pero no en Google: lo decimos en vez de callar
        setAviso(`Guardado solo en el dashboard: no se pudo crear en Google Calendar (${res.googleError}). Pulsa «Reconectar» en la agenda si es un tema de permisos.`);
        setBusy(false);
      } else {
        onClose();
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <form className="card" style={{ width: 400, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <header>
          <h2>Nuevo evento</h2>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose} style={{ padding: '4px 8px' }}>✕</button>
        </header>
        <div className="body" style={{ padding: 16, display: 'grid', gap: 12, maxHeight: 'none' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
            Título
            <input type="text" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qué es…" />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
            Día
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="nuevo-evento-input" />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            Todo el día
          </label>
          {!allDay && (
            <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 600 }}>
              Hora (dura 1 h)
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="nuevo-evento-input" />
            </label>
          )}
          {error && <div style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
          {aviso && <div style={{ color: 'var(--orange)', fontSize: 12 }}>{aviso}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost" onClick={onClose}>{aviso ? 'Cerrar' : 'Cancelar'}</button>
            {!aviso && <button className="btn primary" disabled={!title.trim() || !day || busy}>{busy ? 'Guardando…' : 'Guardar'}</button>}
          </div>
        </div>
      </form>
    </div>
  );
}
