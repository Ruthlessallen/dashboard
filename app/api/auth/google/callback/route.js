import { oauthClient, saveTokens } from '@/lib/google.js';

export async function GET(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error || !code) return Response.redirect(new URL('/?auth=error', url.origin));

  try {
    const { tokens } = await oauthClient().getToken(code);
    saveTokens(tokens);
    return Response.redirect(new URL('/?auth=ok', url.origin));
  } catch {
    return Response.redirect(new URL('/?auth=error', url.origin));
  }
}
