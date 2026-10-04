'use client';

import { useCallback, useEffect, useState } from 'react';

const RANGES = [7, 14, 30];
const FASE = {
  sent: { label: 'Enviada', cls: 'on' },
  pending: { label: 'Pendiente', cls: 'warn' },
  unsent: { label: 'No enviada', cls: '' },
  other: { label: null, cls: '' },
};

export default function Postulaciones() {
  const [days, setDays] = useState(14);
  const [showUnsent, setShowUnsent] = useState(false);
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

  const undo = async (i) => {
    await fetch('/api/empleos/estado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: i.url, state: null }),
    }).catch(() => {});
    load();
  };

  const all = data?.items || [];
  const unsentCount = all.filter((i) => i.fase === 'unsent').length;
  const items = all.filter((i) => showUnsent || i.fase !== 'unsent');

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
      </div>

      <div className="body" style={{ maxHeight: 600 }}>
        {data?.error && <div className="empty" style={{ color: 'var(--red)' }}>{data.error}</div>}
        {data && items.length === 0 && (
          <div className="empty">
            Ninguna postulación activa en los últimos {days} días.<br />
            <span style={{ fontSize: 12 }}>Marca ofertas con «Ya apliqué» en Empleos o indica un CSV en <code>POSTULACIONES_CSV_PATH</code>.</span>
          </div>
        )}

        {items.map((i) => {
          const fase = FASE[i.fase] || FASE.other;
          return (
            <div key={`${i.fecha}-${i.empresa}-${i.puesto}-${i.url || ''}`} className="post">
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
                  {i.origen === 'dashboard' && (
                    <button className="post-undo" onClick={() => undo(i)} title="Marcada desde Empleos. Quitarla de postulaciones">Deshacer</button>
                  )}
                </div>
                {(i.lugar || i.horario) && (
                  <div className="post-meta">
                    {i.lugar && <div>📍 {i.lugar}</div>}
                    {i.horario && <div>🕒 {i.horario}</div>}
                  </div>
                )}
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
