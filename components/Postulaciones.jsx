'use client';

import { useCallback, useEffect, useState } from 'react';

const RANGES = [7, 14, 30];
const FASE = {
  active: { label: 'Sigo adelante', cls: 'on' },
  sent: { label: 'Enviada', cls: 'on' },
  pending: { label: 'Pendiente', cls: 'warn' },
  unsent: { label: 'No enviada', cls: '' },
  discarded: { label: 'Descartada', cls: 'off' },
  other: { label: null, cls: '' },
};

export default function Postulaciones() {
  const [days, setDays] = useState(14);
  const [showUnsent, setShowUnsent] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetch(`/api/postulaciones?days=${days}`).then((r) => r.json()));
    } catch (err) {
      setData({ configured: true, error: err.message, items: [] });
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  const post = async (url, body) => {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
    load();
  };
  // state: 'active' (sigo adelante) | 'rejected' (me han descartado) | null (quitar mi marca)
  const mark = (i, state) => post('/api/postulaciones/estado', { key: i.key, state });
  // Quitar una marcada desde Empleos (en realidad no la envié)
  const unapply = (i) => post('/api/empleos/estado', { url: i.url, state: null });

  const all = data?.items || [];
  const unsentCount = all.filter((i) => i.fase === 'unsent').length;
  const rejectedCount = all.filter((i) => i.fase === 'discarded').length;
  const items = all.filter((i) => (i.fase === 'discarded' ? showRejected : i.fase === 'unsent' ? showUnsent : true));

  return (
    <div className="card">
      <header>
        <h2>Postulaciones</h2>
        <span className="badge">{items.length}</span>
        <span className="spacer" />
        <a className="btn ghost" href="/empleos" title="Ofertas del scraper, con puntuación propia">Empleos →</a>
        <button className="btn ghost" onClick={load} disabled={loading}>{loading ? '…' : '↻'}</button>
      </header>

      <div className="filters">
        <span className="rangelabel">Últimos</span>
        {RANGES.map((d) => (
          <button key={d} className={`chip${days === d ? ' active' : ''}`} onClick={() => setDays(d)}>{d} días</button>
        ))}
        {unsentCount > 0 && (
          <button className={`chip${showUnsent ? ' active' : ''}`} onClick={() => setShowUnsent((v) => !v)}>
            No enviadas · {unsentCount}
          </button>
        )}
        {rejectedCount > 0 && (
          <button className={`chip${showRejected ? ' active' : ''}`} onClick={() => setShowRejected((v) => !v)}>
            Descartadas · {rejectedCount}
          </button>
        )}
      </div>

      <div className="body" style={{ maxHeight: 600 }}>
        {data?.error && <div className="empty" style={{ color: 'var(--red)' }}>{data.error}</div>}
        {data && items.length === 0 && (
          <div className="empty">
            Ninguna postulación activa en los últimos {days} días.<br />
            <span style={{ fontSize: 12 }}>Marca ofertas con «Ya apliqué» en Empleos o añádelas a <code>data/postulaciones.csv</code>.</span>
          </div>
        )}

        {items.map((i) => {
          const fase = FASE[i.fase] || FASE.other;
          return (
            <div key={i.key} className={`post${i.fase === 'discarded' ? ' discarded' : ''}`}>
              <div className={`post-days${i.daysAgo === 0 ? ' today' : ''}`} title={`Postulada el ${i.fecha}`}>
                {i.daysAgo === 0 ? (
                  <b>Hoy</b>
                ) : (
                  <>
                    <b>{i.daysAgo}</b>
                    <span>{i.daysAgo === 1 ? 'día' : 'días'}</span>
                  </>
                )}
              </div>
              <div className="post-main">
                {i.url ? (
                  <a className="title" href={i.url} target="_blank" rel="noreferrer">{i.puesto}</a>
                ) : (
                  <span className="title">{i.puesto}</span>
                )}
                <div className="post-company">{i.empresa} · <span className="muted">{i.canal}</span></div>
                <div className="post-tags">
                  <span className={`badge ${fase.cls}`}>{fase.label || i.faseTexto}</span>
                  <span className="badge">{i.practicas ? 'Prácticas' : 'Empleo'}</span>
                  {i.modalidad && <span className="badge">{i.modalidad}</span>}
                </div>
                {(i.lugar || i.horario) && (
                  <div className="post-meta">
                    {i.lugar && <div>📍 {i.lugar}</div>}
                    {i.horario && <div>🕒 {i.horario}</div>}
                  </div>
                )}
                <div className="post-actions">
                  {i.fase !== 'active' && (
                    <button className="post-btn ok" onClick={() => mark(i, 'active')} title="Me han contestado / sigo en el proceso">✓ Sigo adelante</button>
                  )}
                  {i.fase !== 'discarded' && (
                    <button className="post-btn bad" onClick={() => mark(i, 'rejected')} title="Me han descartado">✕ Descartada</button>
                  )}
                  {i.estado && <button className="post-undo" onClick={() => mark(i, null)}>Deshacer</button>}
                  {i.origen === 'dashboard' && !i.estado && (
                    <button className="post-undo" onClick={() => unapply(i)} title="Marcada desde Empleos: quitarla si en realidad no la envié">Quitar</button>
                  )}
                </div>
                {i.notas && (
                  <details className="post-notes">
                    <summary>Notas</summary>
                    <p>{i.notas}</p>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
