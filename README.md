# BoCampus

Discord bot by **SouCampus** for taking Minecraft build orders, from the first
ticket to the client's review:

**ticket → order form → freelancer quotes → client picks a builder → payment
confirmed by a manager → delivery → review.**

## Features

- Ticket panel with 3 ticket types: **Order**, **Help**, **Team Application**
- Order form in modals (need, deadline, references, size, theme, version,
  details, budget) with an editable summary
- Private quote channel for freelancers; quotes forwarded to the client with
  accept / discuss (private thread) / decline-with-reason buttons
- Message relay between freelancer and client
- Manual payment confirmation, daily deadline reminders, completion and reviews
- Works on several servers at once; each server is configured with `/setup`
- `/invite @user` for managers

Status of every feature: [`docs/SPEC.md`](docs/SPEC.md). Plan:
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## Tech stack

- [discord.js](https://discord.js.org/) v14, Node.js 18+
- SQLite (`better-sqlite3`)
- `node-cron`, `winston`, `dotenv`

## Setup

1. `npm install`
2. `cp .env.example .env` and set `DISCORD_TOKEN`, `CLIENT_ID`
   (and `GUILD_ID` for instant command registration on a test server).
3. In the Developer Portal enable the **Server Members** intent.
4. `npm start`
5. On the server, as an admin: `/setup active_orders`, `/setup quotes`,
   `/setup archived`, `/setup reviews`, `/setup manager_role`,
   `/setup freelancer_role`, then `/setup panel`. Check with `/setup view`.

## Project structure

```
src/core/                     client, database, per-server config, interaction router
src/modules/tickets/          ticket module, repository, order flow
src/interactions/handlers/    one file per button / modal
src/commands/                 /setup, /invite
src/embeds/templates.js       all embeds, buttons and modals
database/schema.sql           schema for a fresh database
docs/                         rules, spec, architecture, roadmap, changelog
```

## License

MIT
