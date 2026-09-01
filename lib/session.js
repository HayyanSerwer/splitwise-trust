import { cookies } from 'next/headers';
import crypto from 'node:crypto';

const COOKIE = 'hb_session';
const MAX_AGE = 60 * 60 * 24 * 7;

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

export async function getSession() {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const session = unseal(raw);
  if (!session || session.expiresAt < Date.now()) return null;
  return session;
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
