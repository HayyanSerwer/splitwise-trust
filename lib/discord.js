const API = 'https://discord.com/api/v10';

export function botHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');
  return { Authorization: `Bot ${token}` };
}

async function call(path, headers) {
  const res = await fetch(`${API}${path}`, { headers, cache: 'no-store' });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Discord ${res.status} on ${path}: ${detail.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export const asUser = (path, accessToken) =>
  call(path, { Authorization: `Bearer ${accessToken}` });

export const asBot = (path) => call(path, botHeaders());

// Members come back 1000 at a time, ordered by id, walked with an `after` cursor.
export async function fetchAllMembers(guildId, cap = 5000) {
  const members = [];
  let after = '0';

  while (members.length < cap) {
    const page = await asBot(`/guilds/${guildId}/members?limit=1000&after=${after}`);
    members.push(...page);
    if (page.length < 1000) break;
    after = page[page.length - 1].user.id;
  }

  return members
    .filter((m) => !m.user.bot)
    .map((m) => ({
      id: m.user.id,
      name: m.nick || m.user.global_name || m.user.username,
      username: m.user.username,
      avatar: avatarUrl(m.user),
      roles: m.roles,
      joinedAt: m.joined_at,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Roles carry the server's own ranking: level bots assign roles that sit in
// hierarchy order, so a member's highest role position stands in for "level".
export async function fetchRoles(guildId) {
  const roles = await asBot(`/guilds/${guildId}/roles`);
  return roles
    .filter((r) => r.id !== guildId && !r.managed)
    .map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null,
    }))
    .sort((a, b) => b.position - a.position);
}

export function avatarUrl(user) {
  if (user.avatar) {
    const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
  }
  const index = (BigInt(user.id) >> 22n) % 6n;
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

// A visitor may only read a guild they are actually in — without this check,
// anyone with a guild id could pull its member list through this site.
export async function assertMembership(guildId, accessToken) {
  const guilds = await asUser('/users/@me/guilds', accessToken);
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) {
    const err = new Error('You are not a member of that server.');
    err.status = 403;
    throw err;
  }
  return guild;
}
