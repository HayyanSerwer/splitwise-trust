import { NextResponse } from 'next/server';
import { CLEAR_COOKIE } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const res = NextResponse.redirect(new URL('/', request.url), { status: 303 });
  res.cookies.set(CLEAR_COOKIE);
  return res;
}
