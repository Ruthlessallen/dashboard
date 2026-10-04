import { loadPostulaciones } from '@/lib/postulaciones.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const days = Number(new URL(req.url).searchParams.get('days')) || 14;
  return Response.json(loadPostulaciones({ days: Math.min(Math.max(days, 1), 90) }));
}
