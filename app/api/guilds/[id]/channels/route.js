import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { asBot, assertMembership } from '@/lib/discord';

export const dynamic = 'force-dynamic';

const TEXT_CHANNEL_TYPES = new Set([0, 5]);

export async function GET(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;

  try {
    await assertMembership(id, session.accessToken);
    const channels = await asBot(`/guilds/${id}/channels`);
    return NextResponse.json({
      channels: channels
        .filter((c) => TEXT_CHANNEL_TYPES.has(c.type))
        .map((c) => ({ id: c.id, name: c.name, position: c.position }))
        .sort((a, b) => a.position - b.position),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
