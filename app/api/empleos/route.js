import { loadEmpleos } from '@/lib/empleos.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(loadEmpleos());
}
