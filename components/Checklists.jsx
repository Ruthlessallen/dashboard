'use client';

import { useState } from 'react';
import { api } from './util.js';

function AddItem({ checklistId, onAdd }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const item = await api('/api/items', {
        method: 'POST',
        body: JSON.stringify({ checklist_id: checklistId, text: clean }),
      });
      onAdd(item);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="addrow" onSubmit={submit}>
      <input
        type="text"
        value={text}
        placeholder="Añadir tarea…"
        onChange={(e) => setText(e.target.value)}
      />
      <button className="btn" disabled={!text.trim() || busy}>+</button>
    </form>
  );
}

function List({ list, refresh }) {
  const [items, setItems] = useState(list.items);
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? (done / items.length) * 100 : 0;

  async function toggle(item) {
    const next = !item.done;
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, done: next } : x)));
    try {
      await api(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ done: next }) });
    } catch {
      setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, done: item.done } : x)));
    }
  }

  async function remove(item) {
    setItems((xs) => xs.filter((x) => x.id !== item.id));
    await api(`/api/items/${item.id}`, { method: 'DELETE' }).catch(() => refresh());
  }

  async function reorder(fromIdx, toIdx) {
    if (fromIdx === toIdx || fromIdx == null || toIdx == null) return;
    const prev = items;
    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    // Reasignamos posiciones secuenciales segun el nuevo orden visual
    const reindexed = next.map((it, i) => ({ ...it, position: i }));
    setItems(reindexed);

    const changed = reindexed.filter((it, i) => it.position !== prev.find((p) => p.id === it.id)?.position);
    try {
      await Promise.all(
        changed.map((it) =>
          api(`/api/items/${it.id}`, { method: 'PATCH', body: JSON.stringify({ position: it.position }) })
        )
      );
    } catch {
      setItems(prev); // revertir si falla
    }
  }

  async function removeList() {
    if (!confirm(`¿Borrar la lista "${list.name}" y sus ${items.length} tareas?`)) return;
    await api(`/api/checklists/${list.id}`, { method: 'DELETE' });
    refresh();
  }

  return (
    <div className="card">
      <header>
        <h2>{list.name}</h2>
        {list.kind === 'daily' && <span className="badge">se reinicia cada día</span>}
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {done}/{items.length}
        </span>
        {list.kind === 'custom' && (
          <button className="btn ghost" onClick={removeList} title="Borrar lista">✕</button>
        )}
      </header>

      <div className="progress"><div style={{ width: `${pct}%` }} /></div>

      <div className="body">
        {items.length === 0 && <div className="empty">Sin tareas todavía.</div>}
        {items.map((item, idx) => (
          <div
            key={item.id}
            className={`check${item.done ? ' done' : ''} draggable-item${overIdx === idx && dragIdx !== null && dragIdx !== idx ? ' drag-over' : ''}`}
            draggable
            onDragStart={() => setDragIdx(idx)}
            onDragOver={(e) => { e.preventDefault(); if (dragIdx !== null) setOverIdx(idx); }}
            onDragLeave={() => setOverIdx((o) => (o === idx ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dragIdx !== null) reorder(dragIdx, idx);
              setDragIdx(null);
              setOverIdx(null);
            }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
          >
            <span className="handle" title="Arrastra para reordenar">⠿</span>
            <input type="checkbox" checked={item.done} onChange={() => toggle(item)} />
            <span className="txt">{item.text}</span>
            <button className="btn ghost del" onClick={() => remove(item)} title="Eliminar">✕</button>
          </div>
        ))}
      </div>

      <AddItem checklistId={list.id} onAdd={(it) => setItems((xs) => [...xs, it])} />
    </div>
  );
}

export default function Checklists({ lists, refresh }) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  async function createList(e) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    await api('/api/checklists', { method: 'POST', body: JSON.stringify({ name: clean }) });
    setName('');
    setAdding(false);
    refresh();
  }

  // Separar listas por tipo
  const generalList = lists.find((l) => l.kind === 'general');
  const dailyList = lists.find((l) => l.kind === 'daily');
  const customLists = lists.filter((l) => l.kind === 'custom');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minHeight: 0 }}>
      {/* Split vertical: General y Daily */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', flex: 1, minHeight: 0 }}>
        {generalList && <List list={generalList} refresh={refresh} />}
        {dailyList && <List list={dailyList} refresh={refresh} />}
      </div>

      {/* Custom lists */}
      {customLists.map((l) => (
        <List key={l.id} list={l} refresh={refresh} />
      ))}

      {adding ? (
        <form className="card" onSubmit={createList}>
          <div className="addrow" style={{ borderTop: 'none' }}>
            <input
              type="text"
              autoFocus
              value={name}
              placeholder="Nombre de la nueva lista…"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
            />
            <button className="btn primary" disabled={!name.trim()}>Crear</button>
            <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <button className="btn" onClick={() => setAdding(true)}>+ Nueva checklist</button>
      )}
    </div>
  );
}
