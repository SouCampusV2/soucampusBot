# Discord Ticket Bot

A configurable Discord bot for managing client orders with a full ticket lifecycle:
**ticket creation → freelancer proposals → manager approval → payment confirmation → review.**

## Features
- 3 ticket types: **Order**, **Help**, **Team Application**
- Modal-based order form with editable summary
- Freelancer quote channels, quote relay to clients, accept/decline flows
- Discussion threads between client and freelancer
- Manual payment confirmation, deadline reminders (cron), completion + reviews
- `/invite` slash command for managers

## Tech Stack
- [discord.js](https://discord.js.org/) v14
- Node.js 18+
- SQLite (`better-sqlite3`)
- `node-cron`, `winston`, `dotenv`

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the env template and fill it in:
   ```bash
   cp .env.example .env
   ```
   Set at least `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`.
3. Start the bot:
   ```bash
   npm start
   ```

## Configuration
See `.env.example` for all options (roles, category IDs, channel IDs).

> **Roadmap:** move per-server configuration (categories, channels, roles) out of `.env`
> and into an in-Discord `/setup` command so the bot can be added to any server and
> configured by its admins without editing files. See the review notes.

## License
MIT
