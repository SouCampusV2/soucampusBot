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
- Manager tools: `/orders` (overdue first), `/stats` (funnel, conversion,
  prices, ratings), a staff log channel, reminders and auto-close for
  abandoned forms
- Explicit ticket lifecycle (one status column, one transition table) and an
  event bus that features subscribe to; safe against double clicks
- Works on several servers at once; each server is configured with `/setup`
- `/invite @user` for managers

Status of every feature: [`docs/SPEC.md`](docs/SPEC.md). Plan:
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Tech stack

- [discord.js](https://discord.js.org/) v14, Node.js 22+
- SQLite (`better-sqlite3`)
- `node-cron`, `winston`, `dotenv`
- Tests on the built-in `node:test` runner, CI on GitHub Actions

No privileged gateway intents: the whole flow runs on buttons, select menus and
modals, so the bot never reads message content or the member list.

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
src/commands/                 /setup, /invite
src/embeds/templates.js       all embeds, buttons and modals
database/schema.sql           schema for a fresh database
tests/                        node:test suites + fakes of discord.js objects
docs/                         rules, spec, architecture, roadmap, changelog
```

## License

MIT
