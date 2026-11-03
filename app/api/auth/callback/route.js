import { NextResponse } from 'next/server';
import { sessionCookie, tokenFields } from '@/lib/session';
import { redirectUri } from '../login/route';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = request.cookies.get('hb_state')?.value;

  if (url.searchParams.get('error')) return NextResponse.redirect(new URL('/?error=denied', url));
  if (!code || !state || state !== expected) {
    return NextResponse.redirect(new URL('/?error=state', url));
  }

  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(request),
  });

  const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!tokenRes.ok) {
    console.error('token exchange failed', await tokenRes.text());
    return NextResponse.redirect(new URL('/?error=token', url));
  }

  const token = await tokenRes.json();
  const me = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  }).then((r) => r.json());

  const res = NextResponse.redirect(new URL('/', url));
  res.cookies.set(
    sessionCookie({
      ...tokenFields(token),
      userId: me.id,
      name: me.global_name || me.username,
    }),
  );
  res.cookies.delete('hb_state');
  return res;
}
