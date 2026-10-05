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

// Tramos del deslizador de competencia (solicitantes). null = sin limite.
const COMPETENCIA = [10, 25, 50, 100, 200, null];

const SORTS = [
  { id: 'score', label: 'Mejor encaje' },
  { id: 'recent', label: 'Más recientes' },
  { id: 'near', label: 'Más cerca de casa' },
];

const CHECKS = [['rol', 'Rol'], ['nivel', 'Nivel'], ['zona', 'Zona'], ['fecha', 'Fecha'], ['competencia', 'Competencia']];

function checkTitle(key, i) {
  const c = i.checks[key];
  const b = i.breakdown;
  const text = {
    rol: { good: 'Data, IA o backend', ok: 'Desarrollo en general', bad: '' },
    nivel: { good: 'Junior / prácticas o 0-1 años', ok: 'Pide hasta 2 años o programa de graduados', unknown: 'No indica el nivel: revísalo', bad: '' },
    zona: {
      good: i.mode === 'remote' ? 'Remoto' : `Cerca (~${i.distanceKm} km)`,
      ok: `A distancia media (~${i.distanceKm} km)`,
      bad: `Lejos (~${i.distanceKm} km)`,
      unknown: 'Modalidad o lugar sin confirmar',
    },
    fecha: { good: 'Publicada hace poco', ok: 'Publicada hace 2-8 semanas', bad: 'Publicada hace más de 2 meses', unknown: 'Fecha desconocida' },
    competencia: { good: 'Pocos solicitantes', ok: 'Bastantes solicitantes', bad: 'Muchos solicitantes' },
  }[key][c];
  const pts = { rol: b.rol, nivel: b.nivel, zona: b.zona, fecha: b.frescura, competencia: -b.competencia }[key];
  return `${text} (${pts > 0 ? '+' : ''}${pts} pts)`;
}

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
  const [status, setStatus] = useState('pending');
  const [maxComp, setMaxComp] = useState(COMPETENCIA.length - 1); // indice en COMPETENCIA
  const [overrides, setOverrides] = useState({}); // url -> 'applied' | 'dismissed' | null

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

  const scraper = data?.scraper;
  const running = Boolean(scraper?.running);

  // Mientras el scraper trabaja, refrescamos para ir viendo las ofertas nuevas
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [running, load]);

  const updateNow = async () => {
    await fetch('/api/empleos/actualizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    }).catch(() => {});
    load();
  };

  const items = data?.items || [];
  const stateOf = (i) => (i.url in overrides ? overrides[i.url] : i.state);
  const mark = async (i, state) => {
    setOverrides((o) => ({ ...o, [i.url]: state }));
    await fetch('/api/empleos/estado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: i.url, state }),
    }).catch(() => setOverrides((o) => ({ ...o, [i.url]: i.state })));
  };
  const appliedCount = items.filter((i) => stateOf(i) === 'applied').length;
  const dismissedCount = items.filter((i) => stateOf(i) === 'dismissed').length;
  const discardedCount = items.filter((i) => i.excludedReason && !stateOf(i)).length;
  const sources = useMemo(() => {
    const counts = {};
    for (const i of items) counts[i.source] = (counts[i.source] || 0) + 1;
    return Object.entries(counts);
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((i) => {
      const st = stateOf(i);
      if (status === 'pending') {
        if (st) return false;
        if (!showDiscarded && i.excludedReason) return false;
      } else if (st !== status) return false;
      if (role !== 'all' && !i.roles.includes(role)) return false;
      if (mode !== 'all' && i.mode !== mode) return false;
      if (source !== 'all' && i.source !== source) return false;
      if (q && !`${i.title} ${i.company || ''} ${i.location}`.toLowerCase().includes(q)) return false;
      const limite = COMPETENCIA[maxComp];
      if (limite != null && i.solicitantes != null && i.solicitantes > limite) return false;
      return true;
    });
    const byDate = (a, b) => new Date(b.postedAt || 0) - new Date(a.postedAt || 0);
    if (sort === 'recent') list.sort(byDate);
    else if (sort === 'near') {
      const d = (i) => (i.mode === 'remote' ? 0 : i.distanceKm ?? 999);
      list.sort((a, b) => d(a) - d(b) || b.score - a.score);
    } else list.sort((a, b) => b.score - a.score || byDate(a, b));
    return list;
  }, [items, overrides, status, role, mode, source, sort, query, showDiscarded, maxComp]);

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

        {scraper?.available && (
          <div className="empleos-help" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {running ? (
              <span>
                ⏳ Buscando ofertas nuevas en los portales (empezó {relTime(scraper.startedAt)}).
                {scraper.logTail?.length > 0 && <span className="muted"> {scraper.logTail[scraper.logTail.length - 1].slice(0, 90)}</span>}
              </span>
            ) : (
              <span>
                {scraper.finishedAt ? `Última búsqueda ${relTime(scraper.finishedAt)}.` : 'Aún sin búsquedas.'}{' '}
                {scraper.nextAutoAt && new Date(scraper.nextAutoAt) > new Date() && `Próxima automática ${new Date(scraper.nextAutoAt).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.`}
              </span>
            )}
            {scraper.rateLimited && !running && (
              <span className="badge off" title="LinkedIn devolvió 429/403: el scraper espera 24 h antes de reintentar solo">Portal limitó las peticiones</span>
            )}
            {scraper.error && !running && <span className="badge off">{scraper.error}</span>}
            {!running && <button className="btn ghost" onClick={updateNow}>Actualizar ahora</button>}
          </div>
        )}

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
              <span className="rangelabel">Estado</span>
              <button className={`chip${status === 'pending' ? ' active' : ''}`} onClick={() => setStatus('pending')}>Pendientes</button>
              <button className={`chip${status === 'applied' ? ' active' : ''}`} onClick={() => setStatus('applied')}>Ya aplicadas · {appliedCount}</button>
              <button className={`chip${status === 'dismissed' ? ' active' : ''}`} onClick={() => setStatus('dismissed')}>Borradas por mí · {dismissedCount}</button>
            </div>
            <div className="filters ranges">
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
              <label className="empleos-slider" title="Oculta las ofertas con más solicitantes que el límite. Las que no indican cuántos son se muestran siempre.">
                Competencia máx.
                <input
                  type="range"
                  min="0"
                  max={COMPETENCIA.length - 1}
                  step="1"
                  value={maxComp}
                  onChange={(e) => setMaxComp(Number(e.target.value))}
                />
                <b>{COMPETENCIA[maxComp] == null ? 'sin límite' : `≤ ${COMPETENCIA[maxComp]} solicitantes`}</b>
              </label>
              <label className="empleos-toggle">
                <input type="checkbox" checked={showDiscarded} onChange={(e) => setShowDiscarded(e.target.checked)} />
                Mostrar las filtradas automáticamente ({discardedCount})
              </label>
            </div>
            <div className="empleos-help">
              El número es orientativo (no es el del scraper). Mira los indicadores de cada oferta: verde bien, ámbar a medias, rojo mal, gris sin dato. Pasa el ratón por encima para ver por qué.
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
            const st = stateOf(i);
            return (
              <div key={`${i.source}-${i.id}`} className={`empleo${i.excludedReason && !st ? ' discarded' : ''}`}>
                <div
                  className="empleo-score"
                  style={{ color: scoreColor(i.score), borderColor: scoreColor(i.score) }}
                  title={`Rol ${b.rol} · Zona ${b.zona} · Nivel ${b.nivel} · Frescura ${b.frescura}${b.competencia ? ` · Competencia −${b.competencia}` : ''}`}
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
                  <div className="empleo-checks">
                    {CHECKS.map(([key, label]) => i.checks[key] && (
                      <span key={key} className={`chk ${i.checks[key]}`} title={checkTitle(key, i)}>{label}</span>
                    ))}
                  </div>
                  <div className="empleo-tags">
                    <span className="badge on">{i.source}</span>
                    {i.roles.map((r) => <span key={r} className="badge">{ROLE_LABEL[r]}</span>)}
                    {i.techs.slice(0, 4).map((t) => <span key={t} className="badge">{t}</span>)}
                    {i.flags.map((f) => <span key={f} className="badge warn">{f}</span>)}
                    {i.excludedReason && <span className="badge off">{i.excludedReason}</span>}
                  </div>
                </div>
                <div className="empleo-actions">
                  {st && i.stateSource === 'postulaciones' ? (
                    <span className="muted" style={{ fontSize: 11.5 }} title="Consta en tu CSV de postulaciones, así que no se vuelve a ofrecer">
                      ya en tus postulaciones
                    </span>
                  ) : st ? (
                    <button className="btn ghost" onClick={() => mark(i, null)}>Deshacer</button>
                  ) : (
                    <>
                      <button className="btn" onClick={() => mark(i, 'applied')} title="Marcar como ya aplicada">✓ Ya apliqué</button>
                      <button className="btn ghost" onClick={() => mark(i, 'dismissed')} title="Quitar de la lista">✕ Borrar</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
