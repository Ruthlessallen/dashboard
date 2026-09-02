import { clearTokens } from '@/lib/google.js';

export async function POST() {
  clearTokens();
  return Response.json({ ok: true });
}
