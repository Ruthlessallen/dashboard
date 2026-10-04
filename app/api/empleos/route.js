import { loadEmpleos } from '@/lib/empleos.js';
import { scraperStatus } from '@/lib/scraper-runner.js';
import { getDb } from '@/lib/db.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = loadEmpleos();
  const states = new Map(
    getDb().prepare('SELECT url, state FROM empleo_estado').all().map((r) => [r.url, r.state])
  );
  const items = payload.items.map((i) => ({ ...i, state: states.get(i.url) || null }));
  return Response.json({ ...payload, items, scraper: scraperStatus() });
}
