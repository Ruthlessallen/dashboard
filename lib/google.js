import { google } from 'googleapis';
import { getKv, setKv, delKv } from './db.js';

const TOKEN_KEY = 'google_tokens';

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function isConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3111/api/auth/google/callback'
  );
}

export function authUrl() {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',      // fuerza refresh_token en el primer consentimiento
    scope: SCOPES,
  });
}

export function saveTokens(tokens) {
  // Conservamos el refresh_token previo si Google no lo reenvia
  const prev = loadTokens() || {};
  setKv(TOKEN_KEY, JSON.stringify({ ...prev, ...tokens }));
}

export function loadTokens() {
  const raw = getKv(TOKEN_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearTokens() {
  delKv(TOKEN_KEY);
}

export function isConnected() {
  return Boolean(loadTokens());
}

/** Cliente autenticado y listo, o null si aun no hay conexion. */
export function authedClient() {
  const tokens = loadTokens();
  if (!tokens) return null;
  const client = oauthClient();
  client.setCredentials(tokens);
  // El SDK refresca solo; persistimos el token nuevo cuando ocurre.
  client.on('tokens', (t) => saveTokens(t));
  return client;
}

/** Cabecera de un mensaje de Gmail, insensible a mayusculas. */
function header(msg, name) {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

export async function getGmail({ max = 12 } = {}) {
  const auth = authedClient();
  if (!auth) return { connected: false, items: [] };

  const gmail = google.gmail({ version: 'v1', auth });
  const list = await gmail.users.messages.list({
    userId: 'me',
    maxResults: max,
    q: 'in:inbox -category:promotions -category:social',
  });

  const ids = list.data.messages || [];
  const items = await Promise.all(
    ids.map(async ({ id }) => {
      const { data } = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['From', 'Subject', 'Date'],
      });
      const from = header(data, 'From');
      return {
        id,
        from: from.replace(/<.*>/, '').replace(/"/g, '').trim() || from,
        subject: header(data, 'Subject') || '(sin asunto)',
        snippet: data.snippet || '',
        date: header(data, 'Date'),
        unread: (data.labelIds || []).includes('UNREAD'),
        link: `https://mail.google.com/mail/u/0/#inbox/${id}`,
      };
    })
  );

  return { connected: true, items, unreadCount: items.filter((i) => i.unread).length };
}

export async function getCalendar({ days = 60, max = 250 } = {}) {
  const auth = authedClient();
  if (!auth) return { connected: false, items: [] };

  const cal = google.calendar({ version: 'v3', auth });
  const now = new Date();
  const end = new Date(now.getTime() + days * 24 * 3600 * 1000);

  const { data } = await cal.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: max,
  });

  const items = (data.items || []).map((e) => ({
    id: e.id,
    title: e.summary || '(sin titulo)',
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    allDay: Boolean(e.start?.date),
    location: e.location || '',
    link: e.htmlLink,
    meet: e.hangoutLink || '',
  }));

  return { connected: true, items };
}

/** Crea un evento real en el Google Calendar del usuario. */
export async function createCalendarEvent({ title, date, time, allDay }) {
  const auth = authedClient();
  if (!auth) throw new Error('Google no esta conectado');

  const cal = google.calendar({ version: 'v3', auth });

  const body = { summary: title };
  if (allDay) {
    const end = new Date(`${date}T00:00:00`);
    end.setDate(end.getDate() + 1);
    body.start = { date };
    body.end = { date: end.toISOString().split('T')[0] };
  } else {
    const start = new Date(`${date}T${time || '09:00'}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // 1h por defecto
    body.start = { dateTime: start.toISOString() };
    body.end = { dateTime: end.toISOString() };
  }

  const { data } = await cal.events.insert({ calendarId: 'primary', requestBody: body });
  return { id: data.id, link: data.htmlLink };
}

/** Borra un evento del Google Calendar del usuario. */
export async function deleteCalendarEvent(googleEventId) {
  const auth = authedClient();
  if (!auth) return;
  const cal = google.calendar({ version: 'v3', auth });
  try {
    await cal.events.delete({ calendarId: 'primary', eventId: googleEventId });
  } catch (err) {
    if (err.code !== 404 && err.code !== 410) throw err; // ya borrado, ignorar
  }
}
