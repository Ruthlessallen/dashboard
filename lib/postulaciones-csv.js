import fs from 'node:fs';
import path from 'node:path';
import { claveOferta } from './ofertas-clave.js';

/**
 * Postulaciones (CSV: Fecha,Empresa,Puesto,Link,Fase,Observaciones).
 * Las observaciones no van entrecomilladas y llevan comas, asi que no sirve un
 * lector CSV normal: se localiza la columna Fase y el resto es texto libre.
 */

export const norm = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const KNOWN_FASES = ['descartado', 'no enviado', 'pendiente', 'enviada', 'enviado', 'entrevista', 'rechazado', 'oferta', 'aceptado'];

function parseLine(line) {
  const f = line.split(',');
  if (f.length < 5) return null;

  // 1) las observaciones empiezan por "Encaje ..." -> Fase y Link son los dos campos anteriores
  let notesAt = f.findIndex((x, i) => i >= 4 && /^encaje\b/i.test(x.trim()));
  let faseAt;
  let linkAt;
  if (notesAt !== -1) {
    faseAt = notesAt - 1;
    linkAt = notesAt - 2;
  } else {
    // 2) una fase conocida; 3) un enlace http
    const k = f.findIndex((x, i) => i >= 3 && KNOWN_FASES.includes(norm(x.trim())));
    if (k !== -1) { faseAt = k; linkAt = k - 1; notesAt = k + 1; }
    else {
      const u = f.findIndex((x, i) => i >= 3 && /^https?:/i.test(x.trim()));
      if (u === -1) return null;
      linkAt = u; faseAt = u + 1; notesAt = u + 2;
    }
  }
  if (linkAt < 3) return null;

  return {
    fecha: f[0].trim(),
    empresa: f[1].trim(),
    puesto: f.slice(2, linkAt).join(',').trim(),
    link: f[linkAt].trim(),
    fase: (f[faseAt] || '').trim(),
    notas: f.slice(notesAt).join(',').trim(),
  };
}

export function parseFile(text) {
  const rows = [];
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    if (!/^\d{4}-\d{2}-\d{2},/.test(line)) {
      // linea suelta: continuacion de las observaciones anteriores
      if (rows.length) rows[rows.length - 1].notas += ` ${line.trim()}`;
      continue;
    }
    const r = parseLine(line);
    if (r) rows.push(r);
  }
  return rows;
}


export function faseDe(fase) {
  const f = norm(fase);
  if (f === 'descartado') return 'discarded';
  if (f === 'no enviado') return 'unsent';
  if (f === 'pendiente') return 'pending';
  if (f === 'enviada' || f === 'enviado') return 'sent';
  return 'other';
}

export const rutaPostulaciones = () =>
  process.env.POSTULACIONES_CSV_PATH || path.join(process.cwd(), 'data', 'postulaciones.csv');

/** Lee el CSV; si es el de por defecto y no existe, lo crea con su cabecera. */
export function leerPostulaciones() {
  const file = rutaPostulaciones();
  try {
    if (!process.env.POSTULACIONES_CSV_PATH && !fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'Fecha,Empresa,Puesto,Link,Fase,Observaciones\n');
    }
    const stat = fs.statSync(file);
    return { rows: parseFile(fs.readFileSync(file, 'utf8')), stat, error: null };
  } catch {
    return { rows: [], stat: null, error: `No encuentro el CSV de postulaciones: ${file}` };
  }
}

/** clave de oferta -> fase ('sent', 'pending', 'unsent', 'discarded', 'other') de cada postulacion con enlace */
export function clavesPostulaciones() {
  const out = new Map();
  for (const r of leerPostulaciones().rows) {
    const clave = claveOferta(r.link);
    if (clave) out.set(clave, faseDe(r.fase));
  }
  return out;
}
