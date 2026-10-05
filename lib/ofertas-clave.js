/**
 * Identificador estable de una oferta a partir de su enlace, para reconocer la
 * misma oferta aunque el enlace cambie de forma (con o sin titulo en la ruta,
 * con parametros de seguimiento, http/https, www...).
 *
 * Debe dar exactamente lo mismo que scraper/clave_oferta.py: si cambias uno,
 * cambia el otro.
 */

const TRACKING = /^(utm_.*|source|ref|referrer|refid|trk|trkemail|trackingid|lipi|midtoken|midsig|eid|otptoken|applicationorigin|page|sortby|hl|lang|from|src|domain)$/i;

export function claveOferta(url) {
  const u = String(url ?? '').trim();
  if (!/^https?:\/\//i.test(u)) return null;

  let m;
  if (/linkedin\./i.test(u) && (m = u.match(/(?:jobs\/view\/(?:[^/?#]*-)?|currentJobId=)(\d{6,})/i))) return `li:${m[1]}`;
  if ((m = u.match(/tecnoempleo\.com\/[^?#]*\/rf-([0-9a-f]+)/i))) return `te:${m[1].toLowerCase()}`;
  if ((m = u.match(/infojobs\.net\/[^?#]*\/of-(i[0-9a-f]+)/i))) return `ij:${m[1].toLowerCase()}`;
  if (/indeed\./i.test(u) && (m = u.match(/[?&]v?jk=([0-9a-f]+)/i))) return `in:${m[1].toLowerCase()}`;

  try {
    const x = new URL(u);
    const params = [...x.searchParams.entries()]
      .filter(([k]) => !TRACKING.test(k))
      .map(([k, v]) => `${k.toLowerCase()}=${v}`)
      .sort();
    let p = x.pathname;
    try { p = decodeURIComponent(p); } catch {}
    p = p.replace(/\/+$/, '').toLowerCase();
    const host = x.hostname.toLowerCase().replace(/^www\./, '');
    return `url:${host}${p}${params.length ? `?${params.join('&')}` : ''}`;
  } catch {
    return null;
  }
}
