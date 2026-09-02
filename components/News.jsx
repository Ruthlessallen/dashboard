'use client';

import { useEffect, useMemo, useState } from 'react';
import { relTime } from './util.js';

const CATS = [
  { id: 'all',  label: 'Todo',          color: 'var(--muted)' },
  { id: 'ia',   label: 'IA',            color: '#7c3aed' },
  { id: 'data', label: 'Data',          color: '#059669' },
  { id: 'web',  label: 'Web',           color: '#2563eb' },
  { id: 'hn',   label: 'Hacker News',   color: '#ea580c' },
];

/* Ventanas temporales. `h: null` = sin recortar. */
const RANGES = [
  { h: 1,    label: '1 h' },
  { h: 6,    label: '6 h' },
  { h: 12,   label: '12 h' },
  { h: 24,   label: '24 h' },
  { h: 48,   label: '48 h' },
  { h: null, label: 'Todo' },
];

const PREFS_KEY = 'news-filters';

export default function News({ data, onRefresh, refreshing }) {
  const [cat, setCat] = useState('all');
  const [hours, setHours] = useState(48);
  const [showSources, setShowSources] = useState(false);
  // Sin este guard, el efecto de guardado se dispara en el montaje y pisa las
  // preferencias con los valores por defecto antes de haberlas leido.
  const [loaded, setLoaded] = useState(false);

  // Recuperamos los filtros tras montar, no en el render, para no romper la hidratacion.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
      if (saved.cat) setCat(saved.cat);
      if (saved.hours !== undefined) setHours(saved.hours);
    } catch {
      /* sin preferencias guardadas: nos quedamos con los valores por defecto */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ cat, hours }));
    } catch {
      /* modo privado o almacenamiento bloqueado: no es critico */
    }
  }, [loaded, cat, hours]);

  const items = useMemo(() => {
    const all = data?.items || [];
    const cutoff = hours == null ? null : Date.now() - hours * 3600 * 1000;
    return all.filter((i) => {
      if (cat !== 'all' && i.cat !== cat) return false;
      if (cutoff == null) return true;
      const t = i.date ? new Date(i.date).getTime() : NaN;
      // Sin fecha fiable no la escondemos: preferimos mostrar de mas que perder algo.
      return Number.isNaN(t) ? true : t >= cutoff;
    });
  }, [data, cat, hours]);

  const failed = (data?.sources || []).filter((s) => !s.ok);

  return (
    <div className="card">
      <header>
        <h2>Noticias</h2>
        <span className="badge">{items.length}</span>
        {failed.length > 0 && (
          <button className="badge off" style={{ cursor: 'pointer' }} onClick={() => setShowSources((v) => !v)}>
            {failed.length} fuente{failed.length > 1 ? 's' : ''} caída{failed.length > 1 ? 's' : ''}
          </button>
        )}
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 11 }}>
          {data?.fetchedAt ? relTime(data.fetchedAt) : ''}
        </span>
        <button className="btn ghost" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? '…' : '↻'}
        </button>
      </header>

      <div className="filters">
        {CATS.map((c) => (
          <button
            key={c.id}
            className={`chip${cat === c.id ? ' active' : ''}`}
            style={cat === c.id ? { color: c.color, borderColor: c.color } : undefined}
            onClick={() => setCat(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="filters ranges">
        <span className="rangelabel">Últimas</span>
        {RANGES.map((r) => (
          <button
            key={r.label}
            className={`chip${hours === r.h ? ' active' : ''}`}
            onClick={() => setHours(r.h)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {showSources && (
        <div className="body pad" style={{ maxHeight: 'none', borderBottom: '1px solid var(--border)' }}>
          <div className="sources">
            {(data?.sources || []).map((s) => (
              <span key={s.id} className={`src ${s.ok ? 'ok' : 'bad'}`} title={s.error || `${s.count} entradas`}>
                {s.ok ? '●' : '✕'} {s.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="body" style={{ maxHeight: 720 }}>
        {items.length === 0 && (
          <div className="empty">
            {data
              ? 'Nada en esta ventana de tiempo. Prueba a ampliarla.'
              : 'Cargando noticias…'}
          </div>
        )}
        {items.map((n) => {
          const color = CATS.find((c) => c.id === n.cat)?.color || 'var(--muted)';
          return (
            <a key={n.id} className="row" href={n.link} target="_blank" rel="noreferrer">
              <div className="line1">
                <span className="dot" style={{ background: color, marginTop: 6 }} />
                <span className="title">{n.title}</span>
                <span className="when">{relTime(n.date)}</span>
              </div>
              <div style={{ marginLeft: 17 }}>
                <div className="snippet">{n.summary}</div>
                <div style={{ marginTop: 4, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color }}>{n.source}</span>
                  {n.comments && (
                    <span
                      className="when"
                      onClick={(e) => { e.preventDefault(); window.open(n.comments, '_blank'); }}
                      style={{ cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      comentarios
                    </span>
                  )}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
