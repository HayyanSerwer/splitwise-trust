import crypto from 'node:crypto';

const API = 'https://discord.com/api/v10';

export function botHeaders() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error('DISCORD_BOT_TOKEN is not set');
  return { Authorization: `Bot ${token}` };
}

async function call(path, headers, attempt = 0) {
  const res = await fetch(`${API}${path}`, { headers, cache: 'no-store' });

  // Discord says exactly how long to wait; honouring it turns a hard failure
  // into a slow success. Bounded so a sustained limit still surfaces as an
  // error rather than hanging the request.
  if (res.status === 429 && attempt < 3) {
    const body = await res.json().catch(() => ({}));
    const wait = Math.min(Number(body.retry_after ?? 1) * 1000, 5000);
    await new Promise((resolve) => setTimeout(resolve, wait + 100));
    return call(path, headers, attempt + 1);
  }

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

// /users/@me/guilds is rate limited to roughly one request per second per
// token, and every guild-scoped route needs it. Caching the in-flight promise
// (not just the result) means a page that fires several requests at once
// shares a single call instead of racing into a 429.
const guildCache = new Map();
const GUILD_TTL = 60_000;

export function userGuilds(accessToken) {
  const key = crypto.createHash('sha256').update(accessToken).digest('base64url');
  const hit = guildCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.promise;

  const promise = asUser('/users/@me/guilds', accessToken).catch((err) => {
    guildCache.delete(key); // A failure must not be served for the next minute.
    throw err;
  });

  guildCache.set(key, { expires: Date.now() + GUILD_TTL, promise });
  if (guildCache.size > 200) {
    for (const [k, v] of guildCache) if (v.expires <= Date.now()) guildCache.delete(k);
  }
  return promise;
}

// A visitor may only read a guild they are actually in — without this check,
// anyone with a guild id could pull its member list through this site.
export async function assertMembership(guildId, accessToken) {
  const guilds = await userGuilds(accessToken);
  const guild = guilds.find((g) => g.id === guildId);
  if (!guild) {
    const err = new Error('You are not a member of that server.');
    err.status = 403;
    throw err;
  }
  return guild;
}
