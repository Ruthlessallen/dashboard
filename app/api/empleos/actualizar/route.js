import { startScraper } from '@/lib/scraper-runner.js';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  return Response.json(startScraper({ force: body.force === true }));
}
