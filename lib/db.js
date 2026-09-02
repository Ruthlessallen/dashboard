import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DATA_DIR = path.join(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

let db;

function connect() {
  if (db) return db;
  db = new DatabaseSync(path.join(DATA_DIR, 'dashboard.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS checklists (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      kind       TEXT    NOT NULL DEFAULT 'custom',  -- 'general' | 'daily' | 'custom'
      color      TEXT    NOT NULL DEFAULT 'violet',
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      checklist_id INTEGER NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
      text         TEXT    NOT NULL,
      done         INTEGER NOT NULL DEFAULT 0,
      position     INTEGER NOT NULL DEFAULT 0,
      -- para listas 'daily': fecha (YYYY-MM-DD) del ultimo dia en que se marco
      done_on      TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_items_checklist ON items(checklist_id);

    CREATE TABLE IF NOT EXISTS kv (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dragged_events (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT    NOT NULL,
      event_date      TEXT    NOT NULL,
      event_time      TEXT,
      all_day         INTEGER NOT NULL DEFAULT 0,
      source          TEXT,
      google_event_id TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migracion: la columna google_event_id se añadio despues de crear la tabla
  const cols = db.prepare("PRAGMA table_info(dragged_events)").all();
  if (!cols.some((c) => c.name === 'google_event_id')) {
    db.exec('ALTER TABLE dragged_events ADD COLUMN google_event_id TEXT');
  }

  // Semilla: las dos listas fijas que pediste
  const n = db.prepare('SELECT COUNT(*) AS c FROM checklists').get().c;
  if (n === 0) {
    const ins = db.prepare(
      'INSERT INTO checklists (name, kind, color, position) VALUES (?, ?, ?, ?)'
    );
    ins.run('General', 'general', 'violet', 0);
    ins.run('Diario', 'daily', 'emerald', 1);
  }
  return db;
}

export function getDb() {
  return connect();
}

/** Fecha local en formato YYYY-MM-DD (zona del servidor, que es la de Ruth). */
export function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Las listas 'daily' se auto-resetean: un item marcado ayer aparece
 * pendiente hoy. No borramos el historico, solo comparamos done_on.
 */
export function resetDailyIfNeeded() {
  const d = connect();
  d.prepare(`
    UPDATE items SET done = 0
    WHERE done = 1
      AND checklist_id IN (SELECT id FROM checklists WHERE kind = 'daily')
      AND (done_on IS NULL OR done_on <> ?)
  `).run(today());
}

export function setKv(k, v) {
  connect().prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
}

export function getKv(k) {
  const row = connect().prepare('SELECT v FROM kv WHERE k = ?').get(k);
  return row ? row.v : null;
}

export function delKv(k) {
  connect().prepare('DELETE FROM kv WHERE k = ?').run(k);
}
