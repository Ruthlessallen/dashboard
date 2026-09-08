'use client';

import { useEffect, useState } from 'react';
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

function List({ list, items, setItems, dragItem, setDragItem, moveItem, refresh }) {
  const [overIdx, setOverIdx] = useState(null);
  const [overEnd, setOverEnd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(`checklist-collapsed-${list.id}`) === '1';
    } catch {
      return false;
    }
  });
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? (done / items.length) * 100 : 0;
  const isForeignDrag = dragItem && dragItem.fromListId !== list.id;

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(`checklist-collapsed-${list.id}`, next ? '1' : '0');
      } catch {}
      return next;
    });
  }

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

  function startEdit(item) {
    setEditingId(item.id);
    setEditText(item.text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText('');
  }

  async function saveEdit(item) {
    const clean = editText.trim();
    if (!clean || clean === item.text) {
      cancelEdit();
      return;
    }
    const prevText = item.text;
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, text: clean } : x)));
    cancelEdit();
    try {
      await api(`/api/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ text: clean }) });
    } catch {
      setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, text: prevText } : x)));
    }
  }

  // Reordenar dentro de la misma lista (por id, no por indice, para evitar
  // condiciones de carrera con el setItems funcional de arriba).
  async function reorderById(itemId, toIdx) {
    const fromIdx = items.findIndex((i) => i.id === itemId);
    if (fromIdx === -1 || fromIdx === toIdx) return;
    const prev = items;
    const next = [...items];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
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
      setItems(prev);
    }
  }

  async function removeList() {
    if (!confirm(`¿Borrar la lista "${list.name}" y sus ${items.length} tareas?`)) return;
    await api(`/api/checklists/${list.id}`, { method: 'DELETE' });
    refresh();
  }

  function handleItemDrop(e, toIdx) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragItem) return;
    if (dragItem.fromListId === list.id) {
      reorderById(dragItem.itemId, toIdx);
    } else {
      moveItem(dragItem, list.id, toIdx);
    }
    setDragItem(null);
    setOverIdx(null);
    setOverEnd(false);
  }

  function handleEndDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragItem) return;
    if (dragItem.fromListId === list.id) {
      reorderById(dragItem.itemId, items.length - 1);
    } else {
      moveItem(dragItem, list.id, items.length);
    }
    setDragItem(null);
    setOverIdx(null);
    setOverEnd(false);
  }

  return (
    <div className="card">
      <header style={{ cursor: 'pointer' }} onClick={toggleCollapsed}>
        <button
          className="btn ghost"
          onClick={(e) => { e.stopPropagation(); toggleCollapsed(); }}
          title={collapsed ? 'Desplegar' : 'Plegar'}
          style={{ padding: '4px 6px', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}
        >
          ▾
        </button>
        <h2>{list.name}</h2>
        {list.kind === 'daily' && <span className="badge">se reinicia cada día</span>}
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {done}/{items.length}
        </span>
        {list.kind === 'custom' && (
          <button className="btn ghost" onClick={(e) => { e.stopPropagation(); removeList(); }} title="Borrar lista">✕</button>
        )}
      </header>

      <div className="progress"><div style={{ width: `${pct}%` }} /></div>

      {!collapsed && (
        <>
          <div
            className="body"
            onDragOver={(e) => { if (dragItem) e.preventDefault(); }}
            onDrop={handleEndDrop}
          >
            {items.length === 0 && (
              <div
                className={`empty${isForeignDrag ? ' drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); if (isForeignDrag) setOverEnd(true); }}
                onDragLeave={() => setOverEnd(false)}
              >
                {isForeignDrag ? 'Suelta aquí para mover la tarea' : 'Sin tareas todavía.'}
              </div>
            )}
            {items.map((item, idx) => (
              <div
                key={item.id}
                className={`check${item.done ? ' done' : ''} draggable-item${overIdx === idx && dragItem && !(dragItem.fromListId === list.id && dragItem.itemId === item.id) ? ' drag-over' : ''}`}
                draggable={editingId !== item.id}
                onDragStart={() => setDragItem({ itemId: item.id, fromListId: list.id, text: item.text })}
                onDragOver={(e) => { e.preventDefault(); if (dragItem) setOverIdx(idx); }}
                onDragLeave={() => setOverIdx((o) => (o === idx ? null : o))}
                onDrop={(e) => handleItemDrop(e, idx)}
                onDragEnd={() => { setDragItem(null); setOverIdx(null); setOverEnd(false); }}
              >
                <span className="handle" title="Arrastra para reordenar o mover a otra lista">⠿</span>
                <input type="checkbox" checked={item.done} onChange={() => toggle(item)} />
                {editingId === item.id ? (
                  <input
                    type="text"
                    className="txt"
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(item);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    onBlur={() => saveEdit(item)}
                    style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 6, padding: '2px 6px' }}
                  />
                ) : (
                  <span className="txt">{item.text}</span>
                )}
                {editingId === item.id ? (
                  <button className="btn ghost" onClick={() => saveEdit(item)} title="Guardar">✓</button>
                ) : (
                  <button className="btn ghost" onClick={() => startEdit(item)} title="Editar">✎</button>
                )}
                <button className="btn ghost del" onClick={() => remove(item)} title="Eliminar">✕</button>
              </div>
            ))}
            {isForeignDrag && items.length > 0 && (
              <div
                className={`drop-tail${overEnd ? ' drag-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOverEnd(true); }}
                onDragLeave={() => setOverEnd(false)}
                onDrop={handleEndDrop}
              />
            )}
          </div>

          <AddItem checklistId={list.id} onAdd={(it) => setItems((xs) => [...xs, it])} />
        </>
      )}
    </div>
  );
}

export default function Checklists({ lists, refresh }) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [itemsByList, setItemsByList] = useState(() =>
    Object.fromEntries(lists.map((l) => [l.id, l.items]))
  );
  const [dragItem, setDragItem] = useState(null);

  // Sincroniza cuando cambia el conjunto de listas (crear/borrar lista),
  // preservando el estado local de las listas que ya conociamos (para no
  // perder ediciones optimistas en curso).
  useEffect(() => {
    setItemsByList((prev) => {
      const next = {};
      for (const l of lists) {
        next[l.id] = prev[l.id] !== undefined ? prev[l.id] : l.items;
      }
      return next;
    });
  }, [lists]);

  function setItemsFor(listId) {
    return (updater) => {
      setItemsByList((prev) => ({
        ...prev,
        [listId]: typeof updater === 'function' ? updater(prev[listId] || []) : updater,
      }));
    };
  }

  async function moveItem(drag, toListId, toIdx) {
    const { itemId, fromListId } = drag;
    if (fromListId === toListId) return;
    const prevState = itemsByList;
    const fromItems = itemsByList[fromListId] || [];
    const moved = fromItems.find((i) => i.id === itemId);
    if (!moved) return;

    const newFrom = fromItems.filter((i) => i.id !== itemId).map((it, i) => ({ ...it, position: i }));
    const toItems = itemsByList[toListId] || [];
    const newTo = [...toItems];
    const clampedIdx = Math.max(0, Math.min(toIdx, newTo.length));
    newTo.splice(clampedIdx, 0, { ...moved, checklist_id: toListId });
    const reindexedTo = newTo.map((it, i) => ({ ...it, position: i }));

    setItemsByList((prev) => ({ ...prev, [fromListId]: newFrom, [toListId]: reindexedTo }));

    try {
      await api(`/api/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ checklist_id: toListId, position: clampedIdx }),
      });
      await Promise.all([
        ...newFrom.map((it) => api(`/api/items/${it.id}`, { method: 'PATCH', body: JSON.stringify({ position: it.position }) })),
        ...reindexedTo.filter((it) => it.id !== itemId).map((it) => api(`/api/items/${it.id}`, { method: 'PATCH', body: JSON.stringify({ position: it.position }) })),
      ]);
    } catch {
      setItemsByList(prevState);
    }
  }

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

  function renderList(l) {
    return (
      <List
        key={l.id}
        list={l}
        items={itemsByList[l.id] || []}
        setItems={setItemsFor(l.id)}
        dragItem={dragItem}
        setDragItem={setDragItem}
        moveItem={moveItem}
        refresh={refresh}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', minHeight: 0 }}>
      {/* Split vertical: General y Daily */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', flex: 1, minHeight: 0 }}>
        {generalList && renderList(generalList)}
        {dailyList && renderList(dailyList)}
      </div>

      {/* Custom lists */}
      {customLists.map((l) => renderList(l))}

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
