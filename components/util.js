/** "hace 3 h", "ayer", "12 mar" — segun lo lejos que quede la fecha. */
export function relTime(input) {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/** Hora de un evento de calendario, o "Todo el dia". */
export function eventTime(ev) {
  if (ev.allDay) return 'Todo el día';
  const d = new Date(ev.start);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

/** Cabecera de dia: "Hoy", "Mañana" o "vie 12 sep". */
export function dayLabel(iso) {
  const d = new Date(iso);
  const t = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, t)) return 'Hoy';
  const tomorrow = new Date(t.getTime() + 86400000);
  if (same(d, tomorrow)) return 'Mañana';
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

export async function api(url, options) {
  const res = await fetch(url, {
    ...options,
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  return res.json();
}
