import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { assertMembership, fetchAllMembers, fetchRoles } from '@/lib/discord';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { id } = await params;

  try {
    const guild = await assertMembership(id, session.accessToken);
    const [members, roles] = await Promise.all([fetchAllMembers(id), fetchRoles(id)]);
    return NextResponse.json({ guild: { id, name: guild.name }, members, roles });
  } catch (err) {
    console.error(err);
    const missingIntent = err.status === 403;
    return NextResponse.json(
      {
        error: missingIntent
          ? 'Discord refused the member list. Enable Server Members Intent for the bot in the Developer Portal, then reload.'
          : err.message,
      },
      { status: err.status ?? 500 },
    );
  }
}
