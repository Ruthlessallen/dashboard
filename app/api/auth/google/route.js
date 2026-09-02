import { authUrl, isConfigured } from '@/lib/google.js';

export async function GET() {
  if (!isConfigured()) {
    return new Response('Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en .env.local', { status: 500 });
  }
  return Response.redirect(authUrl());
}
