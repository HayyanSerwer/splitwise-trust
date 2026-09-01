# Hisaab

Split expenses with the people in your Discord server, then post the tally to a
channel. Next.js on Vercel, Postgres on Neon.

## The bot never runs

There is no bot process here and none is needed. Inviting the bot creates a
membership on Discord's side; the token is just an API key proving "I am that
member". Nothing opens a gateway connection or holds a WebSocket, which is why
this works on serverless.

That means the app is **outbound only** — it posts when you click Post to
Discord, and never listens. Slash commands would need an interactions endpoint
(`/api/discord`, Ed25519-verified, answered within 3 seconds); the architecture
here leaves room for that without changing anything below.

Two credentials do two different jobs:

- **Your OAuth token** proves who the visitor is and which servers they are in.
- **The bot token** reads the member list and posts messages, because Discord
  has no OAuth scope that returns a server's full roster.

## Money

Amounts are integer paise end to end (`lib/money.js`); no float ever touches an
amount. Splits use largest-remainder allocation, so the parts sum to exactly
the total — ₹1000 across three people is 333.34 / 333.33 / 333.33, never
₹999.99.

Balances are always derived from the ledger (`lib/balances.js`), never stored.
`simplify()` reduces the tangle of pairwise debts to the fewest transfers that
clear everyone — at most n-1 payments instead of n(n-1)/2.

Expenses and settlements are soft-deleted so a balance can always be traced
back to the rows that produced it.

## Access rules

Every group-scoped request checks two things (`requireGroup` in `lib/guard.js`):
the visitor is in the guild, **and** the visitor is in that group. Guild
membership alone would let anyone in the server read any group's balances. The
post route additionally checks the target channel belongs to that guild, so a
forged channel id cannot leak balances into another server.

## Setup

1. **Developer Portal** → your application (the same one as the tier list bot,
   or a new one).
2. **OAuth2** → add a redirect URL:
   - local: `http://localhost:3000/api/auth/callback`
   - deployed: `https://<your-app>.vercel.app/api/auth/callback`
3. **Bot** → enable **Server Members Intent**. Required for the member picker.
4. **Invite the bot** with the `bot` scope and **Send Messages** permission. It
   can stay offline.
5. **Neon** → create a project, copy the pooled connection string.
6. Configure and run:
   ```bash
   cp .env.example .env.local   # fill in the five values
   npm run migrate              # creates the tables
   npm run dev
   ```

## Deploying to Vercel

Import the repo — the project root is the app root. Add `DISCORD_CLIENT_ID`,
`DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `SESSION_SECRET` and
`DATABASE_URL` as environment variables, then add the deployed callback URL to
the Developer Portal as in step 2.

Neon's HTTP driver is used rather than a TCP pool: each serverless invocation is
its own process, so a pool would be per-instance and concurrent cold starts
would exhaust Postgres' connection limit.

## Layout

```
lib/money.js      paise parsing, formatting, largest-remainder allocation
lib/balances.js   net positions and debt simplification
lib/ledger.js     loads a group's expenses + settlements, derives the summary
lib/guard.js      session, guild and group access checks
lib/discord.js    Discord REST helpers (bot and user credentials)
db/schema.sql     five tables; run with npm run migrate
```
