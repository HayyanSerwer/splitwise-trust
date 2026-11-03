import { cookies } from 'next/headers';
import crypto from 'node:crypto';

const COOKIE = 'hb_session';
// The cookie outlives the Discord access token: it carries the refresh token,
// and every refresh rewrites it, so regular visitors stay signed in for good.
const MAX_AGE = 60 * 60 * 24 * 365;
// Refresh this long before the access token runs out, so a request never
// races the expiry.
const REFRESH_EARLY = 1000 * 60 * 60 * 24;

// The session holds the visitor's Discord access token, so it is encrypted
// rather than merely signed, and never leaves the httpOnly cookie.
function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function seal(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

export function unseal(token) {
  try {
    const [iv, tag, body] = token.split('.').map((p) => Buffer.from(p, 'base64url'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Only call from route handlers or server actions: a refresh rewrites the cookie.
export async function getSession() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const session = unseal(raw);
  if (!session) return null;
  if (session.expiresAt - REFRESH_EARLY > Date.now()) return session;

  const fresh = session.refreshToken ? await refresh(session) : null;
  if (fresh) {
    jar.set(sessionCookie(fresh));
    return fresh;
  }
  // Refresh failed (revoked, or a parallel request already rotated the
  // token); the old access token is still usable until it actually expires.
  return session.expiresAt > Date.now() ? session : null;
}

// Pages fire several API calls at once; share one refresh between them so
// Discord's single-use refresh token isn't spent twice by this instance.
const inflight = new Map();

function refresh(session) {
  const pending = inflight.get(session.refreshToken);
  if (pending) return pending;
  const p = exchangeRefresh(session).finally(() => {
    setTimeout(() => inflight.delete(session.refreshToken), 10_000);
  });
  inflight.set(session.refreshToken, p);
  return p;
}

async function exchangeRefresh(session) {
  const res = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken,
    }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const token = await res.json();
  return { ...session, ...tokenFields(token) };
}

export function tokenFields(token) {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}

export function sessionCookie(session) {
  return {
    name: COOKIE,
    value: seal(session),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  };
}

export const CLEAR_COOKIE = { name: COOKIE, value: '', path: '/', maxAge: 0 };
