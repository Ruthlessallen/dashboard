import fs from 'node:fs';
import { loadEmpleos } from './empleos.js';
import { getDb } from './db.js';

/**
 * Postulaciones (CSV: Fecha,Empresa,Puesto,Link,Fase,Observaciones).
 * Las observaciones no van entrecomilladas y llevan comas, asi que no sirve un
 * lector CSV normal: se localiza la columna Fase y el resto es texto libre.
 */

const norm = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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

function parseFile(text) {
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

// --- Datos derivados -------------------------------------------------------

const RE_PRACTICAS_TITULO = /pr[aá]cticas|\bintern(?:ship)?\b|becari[oa]|\bbeca\b|trainee|apprentice|aprendiz/i;
const RE_PRACTICAS_NOTAS = /convenio (?:de pr[aá]cticas|formativo)|pr[aá]cticas (?:curriculares|extracurriculares)/i;

export const esPracticas = (titulo, notas = '') => RE_PRACTICAS_TITULO.test(titulo) || RE_PRACTICAS_NOTAS.test(notas);

function horarioDe(notas) {
  const out = [];
  const horas = notas.match(/(\d{1,2})\s*h(?:oras)?(?:\s*semanales|\s*\/\s*semana)?/i);
  if (horas) out.push(`${horas[1]} h/semana`);
  const jornada = notas.match(/(?:media )?jornada (?:completa|parcial|reducida|intensiva|partida)|media jornada/i);
  if (jornada) out.push(jornada[0].toLowerCase());
  const franja = notas.match(/presencia (ma[ñn]anas|tardes)|turno (?:de )?(ma[ñn]ana|tarde|noche)|horario (?:flexible|intensivo|de [^.,;]+)/i);
  if (franja) out.push(franja[0].toLowerCase());
  return out.length ? [...new Set(out)].join(' · ') : null;
}

function lugarDe(notas) {
  const ubic = notas.match(/ubicaci[oó]n en ([^.;,(]+(?:\([^)]*\))?)/i);
  if (ubic) return { lugar: ubic[1].trim(), modalidad: null };
  const mod = notas.match(/\b(h[ií]brido|presencial|remoto|teletrabajo)\b([^.;]*)/i);
  if (mod) {
    const lugar = mod[2].replace(/^[\s:,\-–]+/, '').trim();
    return { lugar: lugar || null, modalidad: mod[1].toLowerCase() };
  }
  return { lugar: null, modalidad: null };
}

function canalDe(link) {
  const l = link.toLowerCase();
  if (/linkedin\./.test(l)) return 'LinkedIn';
  if (/tecnoempleo\./.test(l)) return 'Tecnoempleo';
  if (/infojobs\./.test(l)) return 'InfoJobs';
  if (/indeed\./.test(l)) return 'Indeed';
  if (/^https?:/.test(l)) return l.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  return link; // p. ej. "Contacto / Referido"
}

function jobIdDe(link) {
  return link.match(/(?:jobs\/view\/(?:[^/?]*-)?|currentJobId=)(\d{6,})/)?.[1] || null;
}

function faseDe(fase) {
  const f = norm(fase);
  if (f === 'descartado') return 'discarded';
  if (f === 'no enviado') return 'unsent';
  if (f === 'pendiente') return 'pending';
  if (f === 'enviada' || f === 'enviado') return 'sent';
  return 'other';
}

const MODE_TEXT = { remote: 'remoto', onsite: 'presencial / híbrido' };

export function loadPostulaciones({ days = 14 } = {}) {
  // El CSV es opcional: tambien cuentan las ofertas marcadas "Ya apliqué" en /empleos
  const file = process.env.POSTULACIONES_CSV_PATH;
  let stat = null;
  let text = '';
  let csvError = null;
  if (file) {
    try {
      stat = fs.statSync(file);
      text = fs.readFileSync(file, 'utf8');
    } catch {
      csvError = `No encuentro el CSV de postulaciones: ${file}`;
    }
  }

  // Para completar lugar / modalidad cuando la oferta tambien esta en el CSV del scraper
  let ofertasPorId = new Map();
  try {
    ofertasPorId = new Map(loadEmpleos().items.map((i) => [String(i.id), i]));
  } catch {}

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const items = [];
  for (const r of text ? parseFile(text) : []) {
    const fase = faseDe(r.fase);
    if (fase === 'discarded') continue;
    const date = new Date(`${r.fecha}T00:00:00`);
    if (Number.isNaN(date.getTime())) continue;
    const daysAgo = Math.round((today - date) / 864e5);
    if (daysAgo < 0 || daysAgo > days) continue;

    const oferta = ofertasPorId.get(jobIdDe(r.link) || '');
    const deNotas = lugarDe(r.notas);
    const lugarOferta = oferta && !/sin concretar/i.test(oferta.location) ? oferta.location : null;

    items.push({
      fecha: r.fecha,
      daysAgo,
      empresa: r.empresa,
      puesto: r.puesto,
      url: /^https?:/i.test(r.link) ? r.link : null,
      canal: canalDe(r.link),
      fase,
      faseTexto: r.fase,
      practicas: esPracticas(r.puesto, r.notas),
      lugar: lugarOferta || deNotas.lugar,
      modalidad: deNotas.modalidad || (oferta ? MODE_TEXT[oferta.mode] || null : null),
      horario: horarioDe(r.notas),
      notas: r.notas,
      origen: 'csv',
    });
  }

  // Marcadas "Ya apliqué" en /empleos (sin duplicar las que ya estan en el CSV)
  const yaEnCsv = new Set(items.flatMap((i) => [i.url, jobIdDe(i.url || '')].filter(Boolean)));
  for (const row of getDb().prepare("SELECT url, data, updated_at FROM empleo_estado WHERE state = 'applied'").all()) {
    if (yaEnCsv.has(row.url) || yaEnCsv.has(jobIdDe(row.url))) continue;
    const date = new Date(`${row.updated_at.slice(0, 10)}T00:00:00`);
    const daysAgo = Math.round((today - date) / 864e5);
    if (Number.isNaN(daysAgo) || daysAgo < 0 || daysAgo > days) continue;

    let d = {};
    try { d = JSON.parse(row.data || '{}'); } catch {}
    items.push({
      fecha: row.updated_at.slice(0, 10),
      daysAgo,
      empresa: d.company || 'Empresa sin nombre',
      puesto: d.title || row.url,
      url: row.url,
      canal: d.source || 'Empleos',
      fase: 'sent',
      faseTexto: 'Enviada',
      practicas: Boolean(d.practicas),
      lugar: d.location && !/sin concretar/i.test(d.location) ? d.location : null,
      modalidad: MODE_TEXT[d.mode] || null,
      horario: null,
      notas: '',
      origen: 'dashboard',
    });
  }
  items.sort((a, b) => a.daysAgo - b.daysAgo);

  return { configured: true, error: csvError, updatedAt: stat ? stat.mtime.toISOString() : null, days, items };
}
