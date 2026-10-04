'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { relTime } from './util.js';

const ROLES = [
  { id: 'all', label: 'Todos' },
  { id: 'data', label: 'Data' },
  { id: 'ia', label: 'IA' },
  { id: 'backend', label: 'Backend' },
  { id: 'software', label: 'Software' },
  { id: 'otros', label: 'Otros' },
];
const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.id, r.label]));

const MODES = [
  { id: 'all', label: 'Todas' },
  { id: 'remote', label: 'Remoto' },
  { id: 'onsite', label: 'Presencial / híbrido' },
  { id: 'unknown', label: 'Sin confirmar' },
];
const MODE_LABEL = { remote: 'Remoto', onsite: 'Presencial / híbrido', unknown: 'Modalidad sin confirmar' };

const SORTS = [
  { id: 'score', label: 'Mejor encaje' },
  { id: 'recent', label: 'Más recientes' },
  { id: 'near', label: 'Más cerca de casa' },
];

function scoreColor(s) {
  return s >= 85 ? 'var(--green)' : s >= 70 ? 'var(--blue)' : 'var(--muted)';
}

export default function Empleos() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('all');
  const [mode, setMode] = useState('all');
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState('score');
  const [query, setQuery] = useState('');
  const [showDiscarded, setShowDiscarded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetch('/api/empleos').then((r) => r.json()));
    } catch (err) {
      setData({ configured: true, error: err.message, items: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = data?.items || [];
  const discardedCount = items.filter((i) => i.excludedReason).length;
  const sources = useMemo(() => {
    const counts = {};
    for (const i of items) counts[i.source] = (counts[i.source] || 0) + 1;
    return Object.entries(counts);
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((i) => {
      if (!showDiscarded && i.excludedReason) return false;
      if (role !== 'all' && !i.roles.includes(role)) return false;
      if (mode !== 'all' && i.mode !== mode) return false;
      if (source !== 'all' && i.source !== source) return false;
      if (q && !`${i.title} ${i.company || ''} ${i.location}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const byDate = (a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0);
    if (sort === 'recent') list.sort(byDate);
    else if (sort === 'near') {
      const d = (i) => (i.mode === 'remote' ? 0 : i.distanceKm ?? 999);
      list.sort((a, b) => d(a) - d(b) || b.score - a.score);
    } else list.sort((a, b) => b.score - a.score || byDate(a, b));
    return list;
  }, [items, role, mode, source, sort, query, showDiscarded]);

  return (
    <div className="shell">
      <div className="card">
        <header>
          <a className="btn ghost" href="/">← Dashboard</a>
          <h2>Empleos</h2>
          <span className="badge">{visible.length}</span>
          <span className="spacer" />
          {data?.updatedAt && (
            <span className="muted" style={{ fontSize: 12 }} title="Última vez que el scraper escribió el CSV">
              CSV actualizado {relTime(data.updatedAt)}
            </span>
          )}
          <button className="btn ghost" onClick={load} disabled={loading}>{loading ? '…' : '↻'}</button>
        </header>

        {data && !data.configured && (
          <div className="empty">
            Falta configurar el CSV del scraper.<br />
            <span style={{ fontSize: 12 }}>Añade <code>JOBS_CSV_PATH</code> (y <code>JOBS_HOME_TOWN</code>) a <code>.env.local</code> y reinicia.</span>
          </div>
        )}
        {data?.error && data.configured && <div className="empty" style={{ color: 'var(--red)' }}>{data.error}</div>}

        {items.length > 0 && (
          <>
            <div className="filters">
              <span className="rangelabel">Rol</span>
              {ROLES.map((r) => (
                <button key={r.id} className={`chip${role === r.id ? ' active' : ''}`} onClick={() => setRole(r.id)}>{r.label}</button>
              ))}
            </div>
            <div className="filters ranges">
              <span className="rangelabel">Modalidad</span>
              {MODES.map((m) => (
                <button key={m.id} className={`chip${mode === m.id ? ' active' : ''}`} onClick={() => setMode(m.id)}>{m.label}</button>
              ))}
            </div>
            <div className="filters ranges">
              <span className="rangelabel">Fuente</span>
              <button className={`chip${source === 'all' ? ' active' : ''}`} onClick={() => setSource('all')}>Todas</button>
              {sources.map(([name, n]) => (
                <button key={name} className={`chip${source === name ? ' active' : ''}`} onClick={() => setSource(name)}>{name} · {n}</button>
              ))}
            </div>
            <div className="filters ranges">
              <input
                type="text"
                value={query}
                placeholder="Buscar por título, empresa o lugar…"
                onChange={(e) => setQuery(e.target.value)}
                style={{ maxWidth: 320 }}
              />
              <select className="empleos-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <label className="empleos-toggle">
                <input type="checkbox" checked={showDiscarded} onChange={(e) => setShowDiscarded(e.target.checked)} />
                Mostrar descartadas ({discardedCount})
              </label>
            </div>
            <div className="empleos-help">
              Puntuación propia (no la del scraper): rol 40 + zona 20 + nivel 20 + frescura 20. Pasa el ratón por el número para ver el desglose.
              {data.homeKnown ? ` Cercanía medida en línea recta desde ${data.homeName}.` : ' Sin municipio de casa configurado: no se puntúa la cercanía.'}
            </div>
          </>
        )}

        <div className="body" style={{ maxHeight: 'none' }}>
          {data && data.configured && !data.error && visible.length === 0 && (
            <div className="empty">Ninguna oferta con estos filtros.</div>
          )}
          {visible.map((i) => {
            const b = i.breakdown;
            return (
              <div key={`${i.source}-${i.id}`} className={`empleo${i.excludedReason ? ' discarded' : ''}`}>
                <div
                  className="empleo-score"
                  style={{ color: scoreColor(i.score), borderColor: scoreColor(i.score) }}
                  title={`Rol ${b.rol} · Zona ${b.zona} · Nivel ${b.nivel} · Frescura ${b.frescura}`}
                >
                  {i.score}
                </div>
                <div className="empleo-main">
                  <div className="line1">
                    <a className="title" href={i.url} target="_blank" rel="noreferrer">{i.title}</a>
                    <span className="when">{i.ageLabel}</span>
                  </div>
                  <div className="empleo-meta">
                    {i.company && <span>{i.company}</span>}
                    <span>
                      {i.location}
                      {i.mode === 'onsite' && i.distanceKm != null && ` · ~${i.distanceKm} km`}
                    </span>
                    <span>{MODE_LABEL[i.mode]}</span>
                  </div>
                  {i.summary && <div className="snippet">{i.summary}</div>}
                  <div className="empleo-tags">
                    <span className="badge on">{i.source}</span>
                    {i.roles.map((r) => <span key={r} className="badge">{ROLE_LABEL[r]}</span>)}
                    {i.techs.slice(0, 4).map((t) => <span key={t} className="badge">{t}</span>)}
                    {i.flags.map((f) => <span key={f} className="badge warn">{f}</span>)}
                    {i.excludedReason && <span className="badge off">{i.excludedReason}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
