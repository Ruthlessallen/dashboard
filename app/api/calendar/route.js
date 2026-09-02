import { getCalendar, isConfigured } from '@/lib/google.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!isConfigured()) return Response.json({ connected: false, configured: false, items: [] });
  try {
    return Response.json({ configured: true, ...(await getCalendar()) });
  } catch (err) {
    return Response.json({ configured: true, connected: false, items: [], error: err.message }, { status: 200 });
  }
}
