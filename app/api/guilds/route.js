import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { asBot, userGuilds } from '@/lib/discord';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    // Only servers where both the visitor and the bot are present are usable.
    const [mine, botGuilds] = await Promise.all([
      userGuilds(session.accessToken),
      asBot('/users/@me/guilds'),
    ]);

    const botIds = new Set(botGuilds.map((g) => g.id));
    const guilds = mine.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null,
      ready: botIds.has(g.id),
    }));

    guilds.sort((a, b) => Number(b.ready) - Number(a.ready) || a.name.localeCompare(b.name));
    return NextResponse.json({ user: session.name, guilds });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
