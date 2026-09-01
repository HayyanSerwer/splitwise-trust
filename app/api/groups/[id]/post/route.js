import { asBot, botHeaders } from '@/lib/discord';
import { requireSession, requireGroup, route, httpError } from '@/lib/guard';
import { loadSummary } from '@/lib/ledger';
import { formatAmount } from '@/lib/money';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ACCENT = 0x5865f2;

function buildEmbed(group, summary) {
  const name = (id) => `<@${id}>`;

  const owed = summary.transfers.length
    ? summary.transfers
        .map((t) => `${name(t.fromUserId)} → ${name(t.toUserId)} · **${formatAmount(t.amountCents, group.currency)}**`)
        .join('\n')
    : '_Everyone is square._';

  // Only people who are actually up or down; listing a row of zeroes buries
  // the two lines anyone cares about.
  const standings = summary.balances
    .filter((b) => b.net !== 0)
    .sort((a, b) => b.net - a.net)
    .map((b) => `${name(b.id)} ${b.net > 0 ? 'is owed' : 'owes'} ${formatAmount(Math.abs(b.net), group.currency)}`)
    .join('\n');

  return {
    title: group.name,
    color: ACCENT,
    description: owed,
    fields: standings ? [{ name: 'Standings', value: standings.slice(0, 1024) }] : [],
    footer: { text: `${summary.expenses.length} expense${summary.expenses.length === 1 ? '' : 's'}` },
    timestamp: new Date().toISOString(),
  };
}

export const POST = route(async (request, { params }) => {
  const session = await requireSession();
  const { id } = await params;
  const { group, members } = await requireGroup(id, session);

  const { channelId } = await request.json();
  if (!channelId) throw httpError('Pick a channel', 400);

  // The channel must belong to the guild the visitor was verified against,
  // otherwise a forged channel id could post this group's balances into any
  // server the bot happens to be in.
  const channel = await asBot(`/channels/${channelId}`);
  if (channel.guild_id !== group.guild_id) {
    throw httpError('That channel is not in this server', 403);
  }

  const summary = await loadSummary(group.id, members);

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { ...botHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [buildEmbed(group, summary)],
      // <@id> still renders as a highlighted name without this, it just does
      // not ping. Balances get posted often enough that pinging would be spam.
      allowed_mentions: { parse: [] },
    }),
  });

  if (!res.ok) {
    console.error('post failed', await res.text());
    throw httpError('Discord rejected the message. Check the bot can post in that channel.', 502);
  }

  return Response.json({ ok: true });
});
