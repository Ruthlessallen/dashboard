import { getNews } from '@/lib/news.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const force = new URL(req.url).searchParams.get('refresh') === '1';
  return Response.json(await getNews({ force }));
}
