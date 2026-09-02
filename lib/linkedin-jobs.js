import { authedClient } from './google.js';

/**
 * Lee los correos de alertas de empleo de LinkedIn y extrae las ofertas.
 * LinkedIn envía correos con un formato bastante consistente.
 */
export async function getLinkedInJobs({ max = 20 } = {}) {
  const auth = authedClient();
  if (!auth) return { connected: false, items: [] };

  const { google } = await import('googleapis');
  const gmail = google.gmail({ version: 'v1', auth });

  try {
    // Los correos de alerta de empleo de LinkedIn siempre vienen de esta dirección
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:jobalerts-noreply@linkedin.com',
      maxResults: max,
    });

    const ids = list.data.messages || [];
    const items = [];

    for (const { id } of ids) {
      try {
        const { data } = await gmail.users.messages.get({
          userId: 'me',
          id,
          format: 'full',
        });

        // Un solo correo puede traer varias ofertas: las desglosamos todas
        items.push(...parseLinkedInEmail(data));
        if (items.length >= max) break;
      } catch {
        /* ignoramos si falla un correo */
      }
    }

    return { connected: true, items: items.slice(0, max) };
  } catch (err) {
    return { connected: false, items: [], error: err.message };
  }
}

/** Extrae todas las ofertas de un correo de alerta de LinkedIn (puede traer varias). */
function parseLinkedInEmail(msg) {
  const date = header(msg, 'Date');

  // Obtener body (texto o HTML)
  let body = '';
  if (msg.payload?.body?.data) {
    body = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
  } else if (msg.payload?.parts) {
    const part = findPart(msg.payload, 'text/plain');
    if (part?.body?.data) {
      body = Buffer.from(part.body.data, 'base64').toString('utf-8');
    }
  }

  // Limpiar HTML si el cuerpo viniera en ese formato
  if (/<[a-z][\s\S]*>/i.test(body)) {
    body = body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  }
  body = body.replace(/\r\n/g, '\n');

  // Cortamos antes del pie de página ("ver todos los empleos", legal, etc.)
  const cutIdx = body.search(/Ver todos los empleos en LinkedIn/i);
  const jobsSection = cutIdx > -1 ? body.slice(0, cutIdx) : body;

  // LinkedIn separa cada oferta del digest con una línea de guiones
  const blocks = jobsSection.split(/-{10,}/g);

  const jobs = [];
  for (const block of blocks) {
    const linkMatch = block.match(/Ver anuncio de empleo:\s*(\S+)/i);
    if (!linkMatch) continue; // bloque sin oferta (cabecera, etc.)
    const link = linkMatch[1];

    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
      .filter(l => !/^Ver anuncio de empleo/i.test(l))
      .filter(l => !/^(Esta empresa busca personal activamente|Solicitar con perfil y CV|\d+\s*contactos?)$/i.test(l))
      .filter(l => !/^Tu alerta de empleo/i.test(l))
      .filter(l => !/^(Nuevos empleos|\d+\s+nuevo(s)?\s+empleo)/i.test(l));

    if (lines.length < 2) continue;

    const title = clean(lines[0]);
    const company = clean(lines[1]) || 'LinkedIn';
    const location = clean(lines[2] || '');

    if (!title) continue;

    const idMatch = link.match(/jobs\/view\/(\d+)/);
    const jobId = idMatch ? idMatch[1] : `${msg.id}-${jobs.length}`;

    jobs.push({
      id: `li:${jobId}`,
      title,
      company,
      location,
      link,
      source: 'LinkedIn',
      published: date,
      seniority: 'junior', // Asumir junior si viene de tus alertas
    });
  }

  return jobs;
}

function findPart(payload, mimeType) {
  if (payload.mimeType === mimeType) return payload;
  for (const part of payload.parts || []) {
    const found = findPart(part, mimeType);
    if (found) return found;
  }
  return null;
}

function header(msg, name) {
  const h = msg.payload?.headers?.find(x => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function clean(text = '') {
  return text.replace(/[^\w\s,\-áéíóúñ]/g, '').trim();
}
