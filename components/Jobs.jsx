'use client';

import { useCallback, useEffect, useState } from 'react';
import { relTime } from './util.js';

const SENIORITIES = [
  { id: 'all', label: 'Todas', color: '#6c7382' },
  { id: 'junior', label: 'Junior', color: '#059669' },
  { id: 'mid', label: 'Mid', color: '#2563eb' },
  { id: 'senior', label: 'Senior', color: '#ea580c' },
];

const RANGES = [
  { h: 1,    label: '1 h' },
  { h: 6,    label: '6 h' },
  { h: 12,   label: '12 h' },
  { h: 24,   label: '24 h' },
  { h: 48,   label: '48 h' },
  { h: null, label: 'Todo' },
];

export default function Jobs() {
  const POLL_MS = 30 * 60 * 1000; // 30 minutos
  
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [seniority, setSeniority] = useState('junior');
  const [hours, setHours] = useState(24);
  const [sources, setSources] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    const setter = isRefresh ? setRefreshing : setLoading;
    setter(true);
    try {
      const res = await fetch(`/api/jobs?seniority=${seniority}`);
      const data = await res.json();
      setItems(data.items);
      setSources(data.sources);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setter(false);
    }
  }, [seniority]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const filtered = items.filter(j => {
    if (hours == null) return true;
    const cutoff = Date.now() - hours * 3600 * 1000;
    const t = j.published ? new Date(j.published).getTime() : NaN;
    return Number.isNaN(t) ? true : t >= cutoff;
  });

  const salary = (j) => {
    if (!j.salaryMin) return '';
    const min = Math.round(j.salaryMin / 1000);
    const max = j.salaryMax ? Math.round(j.salaryMax / 1000) : null;
    return max && max !== min ? `${min}–${max}k` : `${min}k+`;
  };

  return (
    <div className="card">
      <header>
        <h2>Ofertas</h2>
        <span className="badge">{filtered.length}</span>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => load(true)} disabled={refreshing || loading}>
          {refreshing ? '…' : '↻'}
        </button>
      </header>

      <div className="filters">
        {SENIORITIES.map((s) => (
          <button
            key={s.id}
            className={`chip${seniority === s.id ? ' active' : ''}`}
            style={seniority === s.id ? { color: s.color, borderColor: s.color } : undefined}
            onClick={() => setSeniority(s.id)}
          >
            {s.label}
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

      {sources.length > 0 && (
        <div className="body pad" style={{ maxHeight: 'none', borderBottom: '1px solid var(--border)' }}>
          <div className="sources">
            {sources.map((s) => (
              <span key={s.id} className={`src ${s.ok ? 'ok' : 'bad'}`} title={s.error || `${s.count} ofertas`}>
                {s.ok ? '●' : '✕'} {s.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="body" style={{ maxHeight: 600 }}>
        {error && <div className="empty" style={{ color: 'var(--red)' }}>{error}</div>}
        {!error && filtered.length === 0 && <div className="empty">Sin ofertas en esta categoría o rango temporal. Intenta cambiar los filtros.</div>}

        {filtered.map((j) => {
          const senColor = SENIORITIES.find(s => s.id === j.seniority)?.color || '#6c7382';
          return (
            <a key={j.id} className="row" href={j.link} target="_blank" rel="noreferrer">
              <div className="line1">
                <span className="dot" style={{ background: senColor }} />
                <span className="title">{j.title}</span>
                {j.salaryMin && <span className="when" style={{ color: 'var(--green)' }}>{salary(j)}</span>}
              </div>
              <div style={{ marginLeft: 17 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{j.company}</div>
                <div style={{ fontSize: 12, marginTop: 2 }}>{j.location}</div>
                <div className="snippet">{j.description}</div>
                <div style={{ marginTop: 4, display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: senColor, fontWeight: 600 }}>{j.seniority.toUpperCase()}</span>
                  <span className="when">{relTime(j.published)}</span>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
