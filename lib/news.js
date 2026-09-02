import Parser from 'rss-parser';
import { FEEDS, HN_KEYWORDS, HN_MIN_POINTS } from './feeds.js';

const parser = new Parser({
  timeout: 12000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RuthDashboard/1.0)' },
});

const CACHE_MS = 15 * 60 * 1000; // 15 min: suficiente para no martillear las fuentes
let cache = { at: 0, payload: null };

function clean(html = '') {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Algunos feeds (Lobste.rs) usan el "resumen" solo para el enlace de comentarios. */
function summaryOf(it) {
  const raw = clean(it.contentSnippet || it.content || it.summary || '');
  if (/^comments?$/i.test(raw)) return '';
  return raw.slice(0, 220);
}

async function fetchFeed(feed) {
  try {
    const res = await parser.parseURL(feed.url);
    const items = (res.items || []).slice(0, 12).map((it) => ({
      id: `${feed.id}:${it.guid || it.link || it.title}`,
      title: clean(it.title || '(sin titulo)'),
      link: it.link,
      summary: summaryOf(it),
      date: it.isoDate || it.pubDate || null,
      source: feed.name,
      sourceId: feed.id,
      cat: feed.cat,
    }));
    return { ok: true, id: feed.id, name: feed.name, cat: feed.cat, count: items.length, items };
  } catch (err) {
    return { ok: false, id: feed.id, name: feed.name, cat: feed.cat, count: 0, items: [], error: err.message };
  }
}

async function fetchHackerNews() {
  const since = Math.floor(Date.now() / 1000) - 3 * 24 * 3600; // ultimas 72h
  const seen = new Set();
  const items = [];
  const errors = [];

  await Promise.all(
    HN_KEYWORDS.map(async (kw) => {
      const url =
        'https://hn.algolia.com/api/v1/search?' +
        new URLSearchParams({
          query: kw,
          tags: 'story',
          numericFilters: `points>${HN_MIN_POINTS},created_at_i>${since}`,
          hitsPerPage: '15',
        });
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        for (const hit of json.hits || []) {
          if (seen.has(hit.objectID)) continue;
          seen.add(hit.objectID);
          items.push({
            id: `hn:${hit.objectID}`,
            title: clean(hit.title || ''),
            link: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
            summary: `${hit.points} puntos · ${hit.num_comments || 0} comentarios · match: ${kw}`,
            date: hit.created_at,
            source: 'Hacker News',
            sourceId: 'hn',
            cat: 'hn',
            points: hit.points,
            comments: `https://news.ycombinator.com/item?id=${hit.objectID}`,
          });
        }
      } catch (err) {
        errors.push(`${kw}: ${err.message}`);
      }
    })
  );

  items.sort((a, b) => b.points - a.points);
  return {
    ok: errors.length < HN_KEYWORDS.length,
    id: 'hn',
    name: 'Hacker News',
    cat: 'hn',
    count: items.length,
    items: items.slice(0, 30),
    error: errors.length ? errors.join('; ') : undefined,
  };
}

export async function getNews({ force = false } = {}) {
  if (!force && cache.payload && Date.now() - cache.at < CACHE_MS) {
    return { ...cache.payload, cached: true };
  }

  const active = FEEDS.filter((f) => f.enabled);
  const results = await Promise.all([...active.map(fetchFeed), fetchHackerNews()]);

  const items = results.flatMap((r) => r.items);
  items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const payload = {
    fetchedAt: new Date().toISOString(),
    items: items.slice(0, 250),
    sources: results.map(({ items: _drop, ...meta }) => meta),
  };
  cache = { at: Date.now(), payload };
  return { ...payload, cached: false };
}
