import { loadEmpleos } from './empleos.js';
import { getDb } from './db.js';
import { claveOferta } from './ofertas-clave.js';
import { leerPostulaciones, faseDe } from './postulaciones-csv.js';

/**
 * Postulaciones (CSV: Fecha,Empresa,Puesto,Link,Fase,Observaciones).
 * Las observaciones no van entrecomilladas y llevan comas, asi que no sirve un
 * lector CSV normal: se localiza la columna Fase y el resto es texto libre.
 */

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

const MODE_TEXT = { remote: 'remoto', onsite: 'presencial / híbrido' };

// Identificador estable de una postulacion (para guardar mi decision sobre ella)
const keyOf = (url, fecha, empresa, puesto) => url || `${fecha}|${empresa}|${puesto}`;

// Mi decision (guardada en SQLite) manda sobre la Fase del CSV
function conEstado(item, estado) {
  const out = { ...item, estado };
  if (estado === 'rejected') { out.fase = 'discarded'; out.faseTexto = 'Descartada'; }
  else if (estado === 'active') { out.fase = 'active'; out.faseTexto = 'Sigo adelante'; }
  return out;
}

export function loadPostulaciones({ days = 14 } = {}) {
  // Por defecto data/postulaciones.csv (se crea con su cabecera si no existe);
  // tambien cuentan las ofertas marcadas "Ya apliqué" en /empleos
  const { rows, stat, error: csvError } = leerPostulaciones();

  // Para completar lugar / modalidad cuando la oferta tambien esta en el CSV del scraper
  let ofertasPorId = new Map();
  try {
    ofertasPorId = new Map(loadEmpleos().items.filter((i) => i.clave).map((i) => [i.clave, i]));
  } catch {}

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overrides = new Map(getDb().prepare('SELECT key, state FROM postulacion_estado').all().map((r) => [r.key, r.state]));

  const items = [];
  for (const r of rows) {
    const fase = faseDe(r.fase);
    const date = new Date(`${r.fecha}T00:00:00`);
    if (Number.isNaN(date.getTime())) continue;
    const daysAgo = Math.round((today - date) / 864e5);
    const url = /^https?:/i.test(r.link) ? r.link : null;
    const key = keyOf(url, r.fecha, r.empresa, r.puesto);
    const estado = overrides.get(key) || null;
    // Las que sigo (estado "active") se muestran aunque pasen de la ventana de dias
    if (daysAgo < 0 || (daysAgo > days && estado !== 'active')) continue;

    const oferta = ofertasPorId.get(claveOferta(r.link) || '');
    const deNotas = lugarDe(r.notas);
    const lugarOferta = oferta && !/sin concretar/i.test(oferta.location) ? oferta.location : null;

    items.push(conEstado({
      key,
      fecha: r.fecha,
      daysAgo,
      empresa: r.empresa,
      puesto: r.puesto,
      url,
      canal: canalDe(r.link),
      fase,
      faseTexto: r.fase,
      practicas: esPracticas(r.puesto, r.notas),
      lugar: lugarOferta || deNotas.lugar,
      modalidad: deNotas.modalidad || (oferta ? MODE_TEXT[oferta.mode] || null : null),
      horario: horarioDe(r.notas),
      notas: r.notas,
      origen: 'csv',
    }, estado));
  }

  // Una misma oferta repetida en el CSV (enlaces distintos): nos quedamos con la mas reciente
  const masReciente = new Map();
  const sinClave = [];
  for (const it of items) {
    const c = claveOferta(it.url);
    if (!c) { sinClave.push(it); continue; }
    const previa = masReciente.get(c);
    if (!previa || it.daysAgo <= previa.daysAgo) masReciente.set(c, it);
  }
  items.length = 0;
  items.push(...sinClave, ...masReciente.values());

  // Marcadas "Ya apliqué" en /empleos (sin duplicar las que ya estan en el CSV: se
  // reconoce la misma oferta por su identificador, aunque el enlace sea distinto)
  const yaEnCsv = new Set(items.map((i) => claveOferta(i.url)).filter(Boolean));
  for (const row of getDb().prepare("SELECT url, data, updated_at FROM empleo_estado WHERE state = 'applied'").all()) {
    if (yaEnCsv.has(claveOferta(row.url))) continue;
    const date = new Date(`${row.updated_at.slice(0, 10)}T00:00:00`);
    const daysAgo = Math.round((today - date) / 864e5);
    const estado = overrides.get(row.url) || null;
    if (Number.isNaN(daysAgo) || daysAgo < 0 || (daysAgo > days && estado !== 'active')) continue;

    let d = {};
    try { d = JSON.parse(row.data || '{}'); } catch {}
    items.push(conEstado({
      key: row.url,
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
    }, estado));
  }
  // Las que sigo, primero; despues, las mas recientes
  items.sort((a, b) => (b.fase === 'active') - (a.fase === 'active') || a.daysAgo - b.daysAgo);

  return { configured: true, error: csvError, updatedAt: stat ? stat.mtime.toISOString() : null, days, items };
}
