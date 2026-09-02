import { isConfigured, isConnected } from '@/lib/google.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ configured: isConfigured(), connected: isConnected() });
}
