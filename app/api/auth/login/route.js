import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'DISCORD_CLIENT_ID is not set' }, { status: 500 });

  const state = crypto.randomBytes(16).toString('base64url');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: 'identify guilds',
    state,
    prompt: 'none',
  });

  const res = NextResponse.redirect(`https://discord.com/oauth2/authorize?${params}`);
  // Guards the callback against forged codes from another origin.
  res.cookies.set('hb_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}

export function redirectUri(request) {
  return process.env.OAUTH_REDIRECT_URI ?? new URL('/api/auth/callback', request.url).toString();
}
