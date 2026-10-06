import fs from 'node:fs';
import path from 'node:path';
import { scraperDir } from './rutas.js';
import { claveOferta } from './ofertas-clave.js';

/**
 * Ofertas del scraper (CSV) -> lista puntuada con criterios propios.
 * La columna puntuacion_encaje del CSV se ignora a proposito.
 *
 * Puntuacion (0-100) = rol 40 + zona 20 + nivel 20 + frescura 20 - competencia
 * (hasta 15, segun solicitantes). Perfil: master data science/IA, FP DAM y FP
 * superior; sin grado universitario. Descartadas (no se borran, se pueden ver):
 * senior/semi, presencial/hibrido lejos de casa o fuera de Barcelona, filas
 * con solo el titulo (no se puede comprobar lugar ni experiencia), 3+ años
 * pedidos, titulacion no relacionada con informatica/datos y ofertas de mas
 * de 6 meses.
 */

const norm = (s = '') =>
  String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// --- CSV ---------------------------------------------------------------

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// --- Geografia (lat, lon aproximadas; distancia en linea recta) ----------

const PLACES = {
  'sant quirze del valles': [41.5337, 2.0842],
  'sant quirze': [41.5337, 2.0842],
  sabadell: [41.5431, 2.1094],
  terrassa: [41.5633, 2.0089],
  'barbera del valles': [41.5208, 2.1233],
  'badia del valles': [41.5167, 2.1117],
  'cerdanyola del valles': [41.4914, 2.1406],
  cerdanyola: [41.4914, 2.1406],
  bellaterra: [41.5, 2.1],
  ripollet: [41.4967, 2.1583],
  'montcada i reixac': [41.4833, 2.1883],
  rubi: [41.4926, 2.0326],
  'sant cugat del valles': [41.4722, 2.0856],
  'sant cugat': [41.4722, 2.0856],
  'castellar del valles': [41.6167, 2.0883],
  sentmenat: [41.6089, 2.1303],
  polinya: [41.5453, 2.1636],
  'palau-solita i plegamans': [41.5986, 2.1769],
  'santa perpetua de mogoda': [41.5333, 2.1833],
  'mollet del valles': [41.5389, 2.2139],
  'parets del valles': [41.5736, 2.2331],
  'la llagosta': [41.5167, 2.1917],
  granollers: [41.6083, 2.2886],
  'caldes de montbui': [41.6333, 2.1667],
  barcelona: [41.3874, 2.1686],
  hospitalet: [41.3596, 2.0997],
  'cornella de llobregat': [41.3536, 2.0742],
  'esplugues de llobregat': [41.3769, 2.0881],
  'sant just desvern': [41.3833, 2.0786],
  'sant joan despi': [41.3689, 2.0586],
  'sant feliu de llobregat': [41.3833, 2.0453],
  'sant boi de llobregat': [41.3439, 2.0364],
  'el prat de llobregat': [41.3278, 2.0947],
  viladecans: [41.3167, 2.0167],
  gava: [41.3, 2.0],
  castelldefels: [41.2833, 1.9833],
  badalona: [41.45, 2.2472],
  'santa coloma de gramenet': [41.4514, 2.2083],
  'sant adria de besos': [41.4297, 2.2192],
  mataro: [41.5389, 2.4445],
  martorell: [41.4744, 1.9303],
  'molins de rei': [41.4136, 2.0172],
  'sant vicenc dels horts': [41.3925, 1.9731],
  'sant andreu de la barca': [41.4478, 1.9733],
  'vilanova i la geltru': [41.2236, 1.7256],
  sitges: [41.2372, 1.8058],
  manresa: [41.7289, 1.8263],
  vic: [41.9301, 2.2549],
  igualada: [41.5794, 1.6171],
  'vilafranca del penedes': [41.3456, 1.6992],
};
const PLACE_KEYS = Object.keys(PLACES).sort((a, b) => b.length - a.length);

function haversineKm([lat1, lon1], [lat2, lon2]) {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function findPlace(ubicacion) {
  const raw = norm(ubicacion);
  if (/provincia/.test(raw)) return null; // "Barcelona (Provincia)": demasiado generico
  const text = raw.replace(/\([^)]*\)/g, ' ');
  const key = PLACE_KEYS.find((k) => text.includes(k));
  return key ? { key, coords: PLACES[key] } : null;
}

// --- Rol ---------------------------------------------------------------

const ROLE_WEIGHT = { data: 40, ia: 38, backend: 34, software: 20, otros: 5 };

const RE = {
  data: /\bdata\b|\bdatos\b|\bbi\b|business intelligence|power ?bi|analytics|analitica|big data|\betl\b|\bsql\b|estadist|quantitative/,
  ia: /\bia\b|\bai\b|inteligencia artificial|artificial intelligence|machine learning|\bml\b|mlops|\bllm|\bnlp\b|genai|generativ|agentic|agentica|deep learning/,
  backend: /backend|back-end|back end|python|\bjava\b|\.net|\bnode|django|flask|fastapi|spring|golang|\bphp\b|ruby|kotlin|c#|\bapis?\b/,
  software: /software|developer|desarrollador|programador|programmer|full ?stack|\bengineer\b|ingenier/,
  qa: /\bqa\b|\btest(er|ing)?\b|pruebas|quality/,
};

function classifyRoles(title, extra) {
  const t = norm(title);
  const found = new Set();
  for (const role of ['data', 'ia', 'backend', 'software']) if (RE[role].test(t)) found.add(role);
  if (RE.qa.test(t)) { found.delete('backend'); found.delete('software'); }
  if (!found.size) {
    // Sin pistas en el titulo: miramos tecnologias / resto (solo palabras fuertes)
    const e = norm(extra);
    for (const role of ['data', 'ia', 'backend']) if (RE[role].test(e)) found.add(role);
  }
  if (!found.size) found.add('otros');
  return [...found];
}

// --- Nivel -------------------------------------------------------------

const RE_EXCLUDE_TITLE =
  /\b(senior|sr|ssr|semi[- ]?senior|semisenior|lead|lider|principal|staff|head|director|manager|gerente|responsable|jefe|jefa|coordinador|coordinadora|arquitecto|arquitecta|architect|expert|expert[oa]|middle|medior|mid[- ]?level)\b/;
const RE_JUNIOR = /\b(junior|jr|trainee|becari[oa]s?|practicas|intern|internship|entry[- ]level|aprendiz|sin experiencia|primer empleo)\b/;
// Programas "graduate": suelen pedir titulo universitario reciente
const RE_GRADUATE = /\b(graduate|graduates|new grad|recien graduad[oa]s?|young graduates)\b/;

// Titulaciones: solo sirven las de informatica / programacion / datos.
const RE_DEGREE_CTX = /(?:grado|licenciatura|licenciad[oa]|graduad[oa]|titulacion|carrera|diplomatura|estudios|degree|bachelor|master|msc|background)[^.;\n]{0,140}/g;
const RE_UNREL = /matematic|fisica|\bade\b|administracion y direccion|empresariales|economi|marketing|publicidad|periodismo|derecho|psicologia|quimica|biologia|ingenieria (?:industrial|quimica|civil|mecanica|electrica|electronica|aeronautica)|arquitectura|finanzas|mathematics|physics|business administration|finance/;
const RE_REL = /informatic|computer|software|programacion|telecomunic|\bdatos\b|\bdata\b|inteligencia artificial|\bia\b|\bai\b|sistemas de informacion|estadistic|statistic|tecnolog/;
const RE_PROFILE_NOUN = /(?:^\s*|(?:buscamos|se busca|buscando|perfil|incorporamos|incorporar|seeking|looking for)[^.]{0,40}\s)(matematic[oa]s?|fisic[oa]s?|economista|quimic[oa]|biolog[oa]|abogad[oa]|psicolog[oa])\b/;
const FIELD_LABEL = {
  matematic: 'matemáticas', fisic: 'física', ade: 'ADE', administracion: 'ADE', empresariales: 'empresariales',
  economi: 'economía', marketing: 'marketing', publicidad: 'publicidad', periodismo: 'periodismo', derecho: 'derecho',
  psicolog: 'psicología', quimic: 'química', biolog: 'biología', ingenieria: 'ingeniería no informática',
  arquitectura: 'arquitectura', finanzas: 'finanzas', mathematics: 'matemáticas', physics: 'física',
  business: 'empresa', finance: 'finanzas', abogad: 'derecho',
};

function degreeMismatch(text) {
  const t = norm(text);
  let hit = t.match(RE_PROFILE_NOUN)?.[1] || null;
  if (!hit) {
    for (const w of t.matchAll(RE_DEGREE_CTX)) {
      const un = w[0].match(RE_UNREL);
      if (un && !RE_REL.test(w[0])) { hit = un[0]; break; }
    }
  }
  if (!hit) return null;
  const key = Object.keys(FIELD_LABEL).find((k) => hit.startsWith(k));
  return key ? FIELD_LABEL[key] : hit;
}

// Solicitantes (columna opcional del scraper): "45 solicitantes", "Más de 200", "Sé de los primeros 25"...
const APPLICANT_COLUMNS = ['solicitantes', 'num_solicitantes', 'numero_solicitantes', 'solicitudes', 'candidatos', 'applicants'];
function parseApplicants(row) {
  const col = APPLICANT_COLUMNS.find((c) => row[c] !== undefined && String(row[c]).trim() !== '');
  if (!col) return null;
  const t = norm(row[col]);
  const m = t.match(/(\d+)/);
  if (!m) return null;
  if (/primer|first/.test(t)) return { n: 1, label: `menos de ${m[1]} solicitantes` };
  const plus = /mas de|more than|over|\+/.test(t);
  return { n: +m[1] + (plus ? 1 : 0), label: `${plus ? 'más de ' : ''}${m[1]} solicitantes` };
}
const competitionPenalty = (n) => (n <= 10 ? 0 : n <= 25 ? 3 : n <= 50 ? 7 : n <= 100 ? 11 : 15);

// "Somos una empresa con 20 años de experiencia" no es lo que se le pide a quien aplica.
// "We are looking for 3+ years" si es un requisito: no cuenta como historia de la empresa.
const RE_COMPANY_HISTORY = /(somos|nuestr[oa]s?|llevamos|trayectoria|fundad[oa]|we are(?! looking| seeking| hiring)|we have|our company|desde hace|since \d{4})/;

const WORD_NUM = { tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const WORD_NUM_RE = Object.keys(WORD_NUM).join('|');
const RE_STRICT_WORDS = /minim|al menos|at least|more than|mas de/;

/**
 * Años de experiencia pedidos segun el texto: { min, plus } o null.
 * `min` es lo que de verdad se exige: en un rango cuenta el tope
 * ("2 a 3 años" -> 3, "0-2 años" -> 2). Mas de 10 años o frases sobre la
 * empresa (dentro de la misma oracion) se ignoran. Solo cuentan los años
 * que van junto a "experiencia": "tras 3 años" o "hace tres años" no.
 */
function yearsRequired(text) {
  const t = norm(text);
  let best = null;
  const consider = (m, n, plus) => {
    if (!Number.isFinite(n) || n > 10) return;
    const before = t.slice(Math.max(0, m.index - 70), m.index);
    const sentence = before.slice(Math.max(before.lastIndexOf('.'), before.lastIndexOf(';'), before.lastIndexOf(':')) + 1);
    if (RE_COMPANY_HISTORY.test(sentence)) return;
    if (!best || n > best.min || (n === best.min && plus)) best = { min: n, plus };
  };
  for (const m of t.matchAll(/(\d+)\s*(?:-|–|a|y|to)\s*(\d+)\s*\+?\s*(?:anos|years|yrs)/g)) consider(m, +m[2], false);
  for (const m of t.matchAll(/(\d+)\s*\+\s*(?:anos|years|yrs)/g)) consider(m, +m[1], true);
  for (const m of t.matchAll(/\+\s*(\d+)\s*(?:anos|years|yrs)/g)) consider(m, +m[1], true);
  for (const m of t.matchAll(/(\d+)\s*(?:anos|years|yrs)\s*(?:o mas|or more)/g)) consider(m, +m[1], true);
  for (const m of t.matchAll(/(?:mas de|more than|minimo(?: de)?|al menos|at least|minimum(?: of)?)\s*(\d+)\s*(?:anos|years|yrs)/g)) consider(m, +m[1], true);
  for (const m of t.matchAll(/(\d+)\s*(?:anos|years|yrs)\s*(?:de|of)?\s*(?:experiencia|experience|exp)/g)) consider(m, +m[1], false);
  // "experiencia minima de 3 años", "experience of approx. 3 years"
  for (const m of t.matchAll(/(?:experiencia|experience)\s*(?:previa |minima |profesional |laboral |aproximada )?(?:de |of |: ?)?(?:al menos |minimo de |minimo |aprox\.? |aproximadamente |approx\.? |around |at least )?(\d+)\s*(?:anos|years|yrs)/g)) consider(m, +m[1], RE_STRICT_WORDS.test(m[0]));
  // Con letras: "tres años de experiencia", "al menos cinco años", "three years of experience"
  const words = new RegExp(`\\b(${WORD_NUM_RE})\\b\\s*\\+?\\s*(?:anos|years|yrs)\\s*(?:de|of)\\s*(?:experiencia|experience)|(?:minimo(?: de)?|al menos|at least|more than|mas de)\\s*(${WORD_NUM_RE})\\s*(?:anos|years|yrs)`, 'g');
  for (const m of t.matchAll(words)) consider(m, WORD_NUM[m[1] || m[2]], RE_STRICT_WORDS.test(m[0]) || m[0].includes('+'));
  return best;
}

// Ofertas reservadas a personas con discapacidad (no son para ti)
const RE_DISABILITY_TITLE = /discapacidad|disabilit/;
const RE_DISABILITY_TEXT = /(?:para|dirigid[oa]s? a|reservad[oa]s? a|exclusiv\w* para|promovid[oa]s? para|solo para)\s+(?:personas?\s+(?:con\s+)?)?(?:discapacidad|diversidad funcional)|certificado de discapacidad|discapacidad (?:igual|superior) (?:o superior )?(?:al?|del) 33/;

// --- Fecha -------------------------------------------------------------

const UNIT_MS = {
  hora: 3600e3, horas: 3600e3,
  dia: 864e5, dias: 864e5,
  semana: 6048e5, semanas: 6048e5,
  mes: 2592e6, meses: 2592e6,
  ano: 31536e6, anos: 31536e6,
};

function postedAt(relative, scannedAt) {
  const m = norm(relative).match(/hace (\d+) (\w+)/);
  const base = new Date(String(scannedAt).replace(' ', 'T'));
  if (Number.isNaN(base.getTime())) return null;
  if (!m || !UNIT_MS[m[2]]) return base; // "Reciente": nos quedamos con el dia del escaneo
  return new Date(base.getTime() - Number(m[1]) * UNIT_MS[m[2]]);
}

const freshnessPoints = (days) =>
  days <= 3 ? 20 : days <= 7 ? 17 : days <= 14 ? 14 : days <= 30 ? 10 : days <= 60 ? 6 : days <= 120 ? 3 : 0;

// --- Proceso principal -------------------------------------------------

function sourceOf(url) {
  if (/linkedin\.com/.test(url)) return 'LinkedIn';
  if (/tecnoempleo\.com/.test(url)) return 'Tecnoempleo';
  if (/infojobs\.net/.test(url)) return 'InfoJobs';
  if (/indeed\./.test(url)) return 'Indeed';
  return 'Otra';
}

function modeOf(modalidad) {
  const m = norm(modalidad);
  if (m.includes('remoto') && (m.includes('presencial') || m.includes('hibrido'))) return 'unknown';
  if (m.includes('remoto')) return 'remote';
  if (m.includes('presencial') || m.includes('hibrido')) return 'onsite';
  return 'unknown';
}

// Presencial/hibrido mas lejos de esto no sirve (zonePoints ya da 0 puntos mas alla)
const FAR_KM = 50;
// Ciudades fuera de Barcelona que no estan en PLACES: Tecnoempleo escribe "Madrid (Barcelona)"
// (ciudad real + categoria de busqueda entre parentesis), y esa ciudad no se reconoce.
const RE_OUTSIDE_PLACE =
  /\b(madrid|valencia|sevilla|malaga|bilbao|zaragoza|alicante|almeria|murcia|granada|cordoba|valladolid|vigo|coruna|gijon|oviedo|pamplona|san sebastian|donostia|palma|santander|logrono|burgos|toledo|badajoz|cadiz|huelva|jaen|albacete|castellon|girona|gerona|tarragona|lleida|lerida|reus|las palmas|tenerife|vitoria|salamanca|leon|alcala de henares|getafe|mostoles|alcobendas|pozuelo|las rozas)\b/;

function zonePoints(mode, distanceKm) {
  if (mode === 'remote') return 16;
  if (mode === 'unknown') return 9;
  if (distanceKm == null) return 6;
  return distanceKm <= 6 ? 20 : distanceKm <= 12 ? 18 : distanceKm <= 20 ? 12 : distanceKm <= 30 ? 8 : distanceKm <= 50 ? 4 : 0;
}

function processRow(r, home, now) {
  const source = sourceOf(r.url);
  // El colector antiguo de Tecnoempleo solo guardaba el titulo: lo detectamos
  // por el contenido, asi las filas nuevas (con detalle real) se aprovechan.
  const generic = /^Tecnoempleo Directo$/i.test(r.empresa) || /^Oferta de empleo en Tecnoempleo/.test(r.resumen_descripcion);
  const company = generic || /^(InfoJobs|Indeed) \(/.test(r.empresa) ? null : r.empresa;
  const mode = modeOf(r.modalidad);
  const place = findPlace(r.ubicacion);
  const distanceKm = home && place ? Math.round(haversineKm(home, place.coords)) : null;
  const summary = generic ? '' : r.resumen_descripcion;
  const tagSegment = generic ? (r.url.split('tecnoempleo.com/')[1] || '').split('/')[1] || '' : '';
  const techs = generic ? [] : (r.tecnologias || '').split(',').map((s) => s.trim()).filter(Boolean);

  // Si el titulo no dice nada, solo miramos tecnologias / etiquetas: el texto libre
  // de la descripcion menciona "datos" o "IA" en ofertas que no tienen nada que ver.
  const roles = classifyRoles(r.titulo, `${techs.join(' ')} ${tagSegment.replace(/-/g, ' ')}`);
  const rolePts = Math.max(...roles.map((x) => ROLE_WEIGHT[x]));

  const title = norm(r.titulo);
  // experiencia_requerida (columna del scraper): solo cuenta si da años o prácticas
  const scraperExp = norm(r.experiencia_requerida || '');
  const scraperYears = scraperExp.match(/^(\d+)\s*anos?/);
  if (scraperYears && +scraperYears[1] > 10) scraperYears[1] = '0'; // historia de la empresa, no un requisito
  let years = yearsRequired(`${r.titulo} ${summary}`);
  // La columna del scraper se queda con el minimo ("2 a 3 años" -> 2): si solo
  // viene de ahi y dice 2, es dudoso.
  const yearsFromScraperOnly = Boolean(scraperYears && !years);
  if (scraperYears && (!years || +scraperYears[1] > years.min)) years = { min: +scraperYears[1], plus: false };
  const seniorTitle = RE_EXCLUDE_TITLE.test(title);
  const juniorTitle = RE_JUNIOR.test(title) || /^practicas/.test(scraperExp);
  const associate = /\bassociate\b/.test(title);
  const graduateProgram = RE_GRADUATE.test(title);
  const degreeField = degreeMismatch(`${r.titulo} ${summary}`);
  const applicants = parseApplicants(r);

  const posted = postedAt(r.fecha_relativa, r.fecha_escaneo);
  const ageDays = posted ? Math.max(0, (now - posted.getTime()) / 864e5) : null;

  const disabilityOnly = RE_DISABILITY_TITLE.test(title) || RE_DISABILITY_TEXT.test(norm(summary));

  // Presencial/hibrido lejos de casa, o en una ciudad que no es de Barcelona
  const outsideBcn =
    mode === 'onsite' &&
    (distanceKm != null
      ? distanceKm > FAR_KM
      : !place && RE_OUTSIDE_PLACE.test(norm(r.ubicacion).replace(/\([^)]*\)/g, ' ')));

  let excludedReason = null;
  if (seniorTitle) excludedReason = 'Senior / semi / responsable (por el título)';
  else if (disabilityOnly) excludedReason = 'Reservada a personas con discapacidad';
  else if (outsideBcn) excludedReason = distanceKm != null ? `Presencial/híbrido a ${distanceKm} km de casa` : `Presencial/híbrido fuera de Barcelona (${r.ubicacion})`;
  else if (generic) excludedReason = 'Solo título: no se puede comprobar ubicación ni experiencia';
  else if (years && (years.min >= 3 || (years.min >= 2 && years.plus))) excludedReason = `Pide ${years.min}${years.plus ? '+' : ''} años de experiencia`;
  else if (degreeField) excludedReason = `Pide titulación no relacionada (${degreeField})`;
  else if (roles.length === 1 && roles[0] === 'otros') excludedReason = 'No es data / IA / backend / software';
  else if (ageDays != null && ageDays > 180) excludedReason = 'Publicada hace más de 6 meses';

  const flags = [];
  let levelPts = juniorTitle ? 20 : associate ? 12 : 8;
  if (years && years.min === 2 && !years.plus && !excludedReason) {
    levelPts = Math.min(levelPts, 5);
    flags.push(yearsFromScraperOnly ? 'Dice 2 años: revisa si es 2-3' : 'Pide hasta 2 años');
  }
  if (!juniorTitle && !years) flags.push('Nivel sin confirmar');
  if (graduateProgram) flags.push('Para graduados universitarios');
  if (applicants) flags.push(applicants.label);
  if (generic) flags.push('Sin detalle (solo título)');
  if (ageDays != null && ageDays > 90 && !excludedReason) flags.push('Antigua');

  const breakdown = {
    rol: rolePts,
    zona: zonePoints(mode, distanceKm),
    nivel: levelPts,
    frescura: ageDays == null ? 5 : freshnessPoints(ageDays),
    competencia: applicants ? competitionPenalty(applicants.n) : 0,
  };
  let score = Math.max(
    0,
    Math.min(100, breakdown.rol + breakdown.zona + breakdown.nivel + breakdown.frescura - breakdown.competencia)
  );
  // Sin empresa, lugar ni descripcion no puede superar a una oferta verificada
  if (generic) score = Math.min(score, 70);

  // Semaforo por criterio: good / ok / bad (lo que hay detras del numero)
  const levelCheck = juniorTitle || (years && years.min <= 1) ? 'good' : years && years.min === 2 ? 'ok' : 'unknown';
  const checks = {
    rol: roles.includes('data') || roles.includes('ia') || roles.includes('backend') ? 'good' : 'ok',
    nivel: graduateProgram && !juniorTitle ? 'ok' : levelCheck,
    zona:
      mode === 'remote' ? 'good'
      : mode === 'unknown' || distanceKm == null ? 'unknown'
      : distanceKm <= 20 ? 'good' : distanceKm <= 30 ? 'ok' : 'bad',
    fecha: ageDays == null ? 'unknown' : ageDays <= 14 ? 'good' : ageDays <= 60 ? 'ok' : 'bad',
    competencia: applicants ? (applicants.n <= 25 ? 'good' : applicants.n <= 50 ? 'ok' : 'bad') : null,
  };

  return {
    id: r.job_id || r.url,
    clave: claveOferta(r.url),
    solicitantes: applicants ? applicants.n : null,
    source,
    title: r.titulo,
    company,
    location: generic ? 'Provincia de Barcelona (sin concretar)' : r.ubicacion,
    distanceKm,
    mode,
    url: r.url,
    postedAt: posted ? posted.toISOString() : null,
    ageLabel: generic ? 'Reciente' : r.fecha_relativa,
    techs,
    summary,
    roles,
    score,
    breakdown,
    checks,
    flags,
    excludedReason,
  };
}

let cache = { key: null, payload: null };

export function loadEmpleos() {
  const file = process.env.JOBS_CSV_PATH || path.join(scraperDir(), 'ofertas_encontradas.csv');

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return {
      configured: true,
      error: process.env.JOBS_CSV_PATH
        ? `No encuentro el CSV: ${file}`
        : 'Aún no hay ofertas: se generarán con la primera actualización del scraper.',
      items: [],
    };
  }

  const homeName = process.env.JOBS_HOME_TOWN || '';
  const key = `${file}|${stat.mtimeMs}|${stat.size}|${homeName}`;
  if (cache.key === key) return cache.payload;

  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const [header, ...body] = rows;
  const objects = body
    .filter((cells) => cells.length === header.length)
    .map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), cells[i]])));

  const home = homeName ? findPlace(homeName)?.coords || null : null;
  const now = Date.now();
  const seen = new Set();
  const seenClave = new Set();
  const items = [];
  for (const r of objects) {
    const it = processRow(r, home, now);
    if (it.clave) {
      if (seenClave.has(it.clave)) continue;
      seenClave.add(it.clave);
    }
    const dupKey = it.company ? `${norm(it.title)}|${norm(it.company)}` : null;
    if (dupKey) {
      if (seen.has(dupKey)) continue;
      seen.add(dupKey);
    }
    items.push(it);
  }
  items.sort((a, b) => b.score - a.score || new Date(b.postedAt || 0) - new Date(a.postedAt || 0));

  const payload = {
    configured: true,
    homeKnown: Boolean(home),
    homeName,
    updatedAt: stat.mtime.toISOString(),
    items,
  };
  cache = { key, payload };
  return payload;
}
