import { getManfred } from '@/lib/jobs.js';
import { getLinkedInJobs } from '@/lib/linkedin-jobs.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const location = new URL(req.url).searchParams.get('location') || 'barcelona';
  const seniority = new URL(req.url).searchParams.get('seniority') || 'all';

  const [manfred, linkedin] = await Promise.all([
    getManfred({ location, maxAge: 14 }),
    getLinkedInJobs({ max: 30 }),
  ]);

  // Fusionamos, deduplicamos (la misma oferta puede llegar en varias alertas) y filtramos por seniority
  const merged = [...manfred.items, ...linkedin.items];
  const seen = new Set();
  const all = merged.filter(j => (seen.has(j.id) ? false : (seen.add(j.id), true)));
  const filtered = seniority === 'all' ? all : all.filter(j => j.seniority === seniority);

  // Ordenamos por fecha descendente
  filtered.sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));

  return Response.json({
    sources: [
      { id: 'manfred', name: 'Manfred', ok: manfred.connected, count: manfred.items.length, error: manfred.error },
      { id: 'linkedin', name: 'LinkedIn', ok: linkedin.connected, count: linkedin.items.length, error: linkedin.error },
    ],
    items: filtered.slice(0, 50),
    fetchedAt: new Date().toISOString(),
  });
}
