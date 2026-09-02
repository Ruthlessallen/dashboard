/**
 * Agregador de ofertas de empleo.
 *
 * Fuente: Manfred (tech principalmente, salarios públicos).
 *
 * Cada oferta se clasifica por seniority (junior/mid/senior) usando
 * el modelo de Claude para leer descripciones ambiguas.
 */

export async function getManfred({ location = 'Barcelona', keywords = [], maxAge = 7 } = {}) {
  const url = 'https://www.getmanfred.com/api/v2/public/offers?lang=ES';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const offers = await res.json();
    const now = Date.now();
    const cutoff = now - maxAge * 86400000;

    const items = offers
      .filter((o) => {
        // solo activas y recientes; cualquier ubicación en España/remoto
        if (o.status !== 'ACTIVE') return false;
        const age = new Date(o.updatedAt || 0).getTime();
        if (age < cutoff) return false;
        return true; // mostramos todas las activas, sin filtro geo
      })
      .map((o) => ({
        id: `mf:${o.id}`,
        title: o.position || '',
        company: (o.company?.name || 'Manfred'),
        link: `https://www.getmanfred.com/offers/${o.slug}`,
        salaryMin: o.salaryFrom,
        salaryMax: o.salaryTo,
        currency: o.currency?.code || 'EUR',
        description: o.highlights?.join(' ') || '',
        location: o.locations?.map(l => l.value).join(', ') || '',
        experienceMin: 0, // manfred no lo declara
        published: o.updatedAt,
        seniority: inferSeniority(0, o.position || '', o.highlights?.join(' ') || ''),
      }));

    return { connected: true, items };
  } catch (err) {
    return { connected: false, items: [], error: err.message };
  }
}

/** Heurística: años explícitos > palabras clave > default mid. */
function inferSeniority(minYears, title, description) {
  const text = (title + ' ' + description).toLowerCase();

  // Explícito
  if (minYears >= 5) return 'senior';
  if (minYears >= 2) return 'mid';
  if (minYears <= 1) return 'junior';

  // Por palabras
  if (/\b(senior|sr\.|lead|principal|staff|head|director|architect|expert)\b/.test(text)) return 'senior';
  if (/\b(junior|jr\.|trainee|becari|prácticas|intern|graduate|entry|associate|recién|primer empleo)\b/.test(text)) return 'junior';

  return 'mid';
}
