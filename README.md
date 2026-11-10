# BoCampus

[![CI](https://github.com/SouCampusV2/soucampusBot/actions/workflows/ci.yml/badge.svg)](https://github.com/SouCampusV2/soucampusBot/actions/workflows/ci.yml)

Discord bot by **SouCampus** for taking Minecraft build orders, from the first
ticket to the client's review:

**ticket → order form → freelancer quotes → client picks a builder → payment
confirmed by a manager → delivery → review.**

## Features

- Ticket panel with 3 ticket types: **Order**, **Help**, **Team Application**
- Order form in modals (need, deadline, references, size, theme, version,
  details, budget in €) with an editable summary
- Private quote channel for freelancers; quotes forwarded to the client with
  accept / discuss (private thread) / decline-with-reason buttons, and a live
  "N quotes · M not interested" counter
- Message relay between freelancer and client
- Manual payment confirmation, deadline reminders (dates parsed from
  `25.12.2026`, `in 2 weeks`…), completion and one review per order
- Team applications: applicant form, manager Accept (gives the Freelancer
  role) or Reject with a reason
- Closing any ticket: archived read-only, deleted after 48 hours unless a
  manager keeps it
- Live order card: one pinned message with the stage timeline, quotes,
  freelancer, agreed price, deadline and a price estimate from the map size
- Freelancer track record on every quote (rating, reviews, delivered orders)
- Ticket transcripts on close (.txt to the staff log and to the client)
- Website bridge: with the client's consent, portfolio drafts and reviews go to
  soucampus.online through a signed, retrying outbox — the owner publishes them
- Manager tools: `/orders` (overdue first), `/stats` (funnel, conversion,
  prices, ratings), a staff log channel, reminders and auto-close for
  abandoned forms
- Explicit ticket lifecycle (one status column, one transition table) and an
  event bus that features subscribe to; safe against double clicks
- Works on several servers at once; each server is configured with `/setup`
- `/invite @user` for managers
- `/take price:` for managers: take an order as its builder (or give it to one) without waiting for quotes
- `/setup notify`: a person or role pinged in every new ticket and quote channel
- Payment links: `/take payment_link:` or `/paylink` posts a Pay button (PayPal / Wise invoice) for the payer
- Client tiers: Client / Notable / VIP roles after paid orders (`/setup client_roles`), with a congratulations card
- Server rules as a card (`/setup rules`, edited in place) and `/rules` for anyone
- Website → Discord: `/setup site_channel` gives the site a webhook for each
  channel it posts to (portfolio, premade, free builds, announcements); the bot
  reacts under build posts

Status of every feature: [`docs/SPEC.md`](docs/SPEC.md). Plan:
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Tech stack

- [discord.js](https://discord.js.org/) v14, Node.js 22+
- SQLite (`better-sqlite3`)
- `node-cron`, `winston`, `dotenv`
- Tests on the built-in `node:test` runner, CI on GitHub Actions

One privileged intent, Message Content, used only for ticket transcripts (the bot
runs on a single server). The flow itself runs on buttons, select menus and modals.

## Setup

1. `npm install`
2. `cp .env.example .env` and set `DISCORD_TOKEN`, `CLIENT_ID`
   (and `GUILD_ID` for instant command registration on a test server).
3. `npm start`
5. On the server, as an admin: `/setup active_orders`, `/setup quotes`,
   `/setup archived`, `/setup reviews`, `/setup manager_role`,
   `/setup freelancer_role`, then `/setup panel`. Check with `/setup view`.

## Development

```bash
npm run dev     # restart on file changes
npm test        # handler tests with fake Discord objects and an in-memory database
npm run check   # syntax check of every file
```

## Project structure

```
src/core/                     client, database, per-server config, interaction router
src/modules/tickets/          ticket module, repository, order flow
src/interactions/handlers/    one file per button / modal
src/commands/                 /setup, /invite, /orders, /stats, /rules, /take, /paylink
src/embeds/templates.js       all embeds, buttons and modals
database/schema.sql           schema for a fresh database
tests/                        node:test suites + fakes of discord.js objects
docs/                         rules, spec, architecture, roadmap, changelog
```

## License

MIT
