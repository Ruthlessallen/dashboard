import { loadEmpleos } from '@/lib/empleos.js';
import { scraperStatus } from '@/lib/scraper-runner.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ ...loadEmpleos(), scraper: scraperStatus() });
}
