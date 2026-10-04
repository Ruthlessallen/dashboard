import fs from 'node:fs';

/**
 * Ofertas del scraper (CSV) -> lista puntuada con criterios propios.
 * La columna puntuacion_encaje del CSV se ignora a proposito.
 *
 * Puntuacion (0-100) = rol 40 + zona 20 + nivel 20 + frescura 20.
 * Descartadas (no se borran, se pueden ver): senior/semi, 3+ años pedidos,
 * ofertas de mas de 6 meses.
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
const RE_JUNIOR = /\b(junior|jr|trainee|becari[oa]s?|practicas|intern|internship|graduate|graduates|new grad|entry[- ]level|recien|aprendiz|sin experiencia|primer empleo)\b/;

/** Años de experiencia pedidos segun el texto: { min, plus } o null. */
function yearsRequired(text) {
  const t = norm(text);
  let best = null;
  const consider = (min, plus) => {
    if (!Number.isFinite(min) || min > 20) return;
    if (!best || min > best.min || (min === best.min && plus)) best = { min, plus };
  };
  for (const m of t.matchAll(/(\d+)\s*(?:-|–|a|y|to)\s*(\d+)\s*\+?\s*(?:anos|years|yrs)/g)) consider(+m[1], false);
  for (const m of t.matchAll(/(\d+)\s*\+\s*(?:anos|years|yrs)/g)) consider(+m[1], true);
  for (const m of t.matchAll(/(?:mas de|more than|minimo(?: de)?|al menos|at least|minimum(?: of)?)\s*(\d+)\s*(?:anos|years|yrs)/g)) consider(+m[1], true);
  for (const m of t.matchAll(/(\d+)\s*(?:anos|years|yrs)\s*(?:de\s*)?(?:experiencia|experience|exp)/g)) consider(+m[1], false);
  return best;
}

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

function zonePoints(mode, distanceKm) {
  if (mode === 'remote') return 16;
  if (mode === 'unknown') return 9;
  if (distanceKm == null) return 6;
  return distanceKm <= 6 ? 20 : distanceKm <= 12 ? 18 : distanceKm <= 20 ? 12 : distanceKm <= 30 ? 8 : distanceKm <= 50 ? 4 : 0;
}

function processRow(r, home, now) {
  const source = sourceOf(r.url);
  const generic = source === 'Tecnoempleo';
  const company = generic || /^(InfoJobs|Indeed) \(/.test(r.empresa) ? null : r.empresa;
  const mode = modeOf(r.modalidad);
  const place = findPlace(r.ubicacion);
  const distanceKm = home && place ? Math.round(haversineKm(home, place.coords)) : null;
  const summary = generic ? '' : r.resumen_descripcion;
  const tagSegment = generic ? (r.url.split('tecnoempleo.com/')[1] || '').split('/')[1] || '' : '';
  const techs = generic ? [] : (r.tecnologias || '').split(',').map((s) => s.trim()).filter(Boolean);

  const roles = classifyRoles(r.titulo, `${techs.join(' ')} ${tagSegment.replace(/-/g, ' ')} ${summary}`);
  const rolePts = Math.max(...roles.map((x) => ROLE_WEIGHT[x]));

  const title = norm(r.titulo);
  const years = yearsRequired(`${r.titulo} ${summary}`);
  const seniorTitle = RE_EXCLUDE_TITLE.test(title);
  const juniorTitle = RE_JUNIOR.test(title);
  const associate = /\bassociate\b/.test(title);

  const posted = postedAt(r.fecha_relativa, r.fecha_escaneo);
  const ageDays = posted ? Math.max(0, (now - posted.getTime()) / 864e5) : null;

  let excludedReason = null;
  if (seniorTitle) excludedReason = 'Senior / semi / responsable (por el título)';
  else if (years && (years.min >= 3 || (years.min >= 2 && years.plus))) excludedReason = `Pide ${years.min}${years.plus ? '+' : ''} años de experiencia`;
  else if (ageDays != null && ageDays > 180) excludedReason = 'Publicada hace más de 6 meses';

  const flags = [];
  let levelPts = juniorTitle ? 20 : associate ? 12 : 8;
  if (years && years.min === 2 && !years.plus && !excludedReason) { levelPts = Math.min(levelPts, 5); flags.push('Pide ~2 años'); }
  if (!juniorTitle && !years) flags.push('Nivel sin confirmar');
  if (generic) flags.push('Sin detalle (solo título)');
  if (ageDays != null && ageDays > 90 && !excludedReason) flags.push('Antigua');

  const breakdown = {
    rol: rolePts,
    zona: zonePoints(mode, distanceKm),
    nivel: levelPts,
    frescura: ageDays == null ? 5 : freshnessPoints(ageDays),
  };
  const score = Math.min(100, breakdown.rol + breakdown.zona + breakdown.nivel + breakdown.frescura);

  return {
    id: r.job_id || r.url,
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
    flags,
    excludedReason,
  };
}

let cache = { key: null, payload: null };

export function loadEmpleos() {
  const file = process.env.JOBS_CSV_PATH;
  if (!file) return { configured: false, error: 'Falta JOBS_CSV_PATH en .env.local', items: [] };

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return { configured: true, error: `No encuentro el CSV: ${file}`, items: [] };
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
  const items = [];
  for (const r of objects) {
    const it = processRow(r, home, now);
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
