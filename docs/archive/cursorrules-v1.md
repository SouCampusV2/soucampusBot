# Discord Ticket Bot - Development Guidelines
# Version: 1.0.0 | Language: English

## Project Overview
A secure Discord bot for managing client orders with a full ticket lifecycle:
ticket creation → freelancer proposals → manager approval → payment confirmation → review.

---

## Tech Stack
- discord.js v14.x (slash commands, modals, buttons, select menus)
- Node.js 18+
- SQLite (via `better-sqlite3`) for development; swap to PostgreSQL for production
- `dotenv` for secrets
- `node-cron` for deadline reminders
- `winston` for logging

---

## Security Requirements
1. All tokens and secrets in `.env` — never hardcoded
2. Validate all user inputs before writing to DB
3. Use Discord `permissionOverwrites` for channel access control
4. Rate limiting: max 1 ticket creation per user per 60 seconds
5. Only users with correct roles can trigger role-specific actions
6. Log all critical actions (ticket created, proposal sent, payment confirmed) via winston

---

## Architecture: Event-Driven Modular Design

```
ticket-bot/
├── .env
├── .cursorrules
├── package.json
├── src/
│   ├── index.js                    # Entry point, loads bot and modules
│   ├── core/
│   │   ├── Bot.js                  # Singleton bot class
│   │   ├── Database.js             # DB abstraction (query, run, get)
│   │   └── InteractionRouter.js   # Routes all interactions by customId prefix
│   ├── modules/
│   │   ├── tickets/
│   │   │   ├── TicketModule.js     # Registers all ticket interactions
│   │   │   ├── flows/
│   │   │   │   ├── OrderFlow.js    # Full order creation dialog
│   │   │   │   ├── HelpFlow.js     # Help ticket (client + manager channel)
│   │   │   │   └── ApplicationFlow.js  # Team application ticket
│   │   │   └── TicketRepository.js
│   │   ├── proposals/
│   │   │   ├── ProposalModule.js   # Quote, message, decline logic
│   │   │   └── ProposalRepository.js
│   │   ├── payments/
│   │   │   └── PaymentModule.js    # Manual confirmation by manager
│   │   ├── reviews/
│   │   │   └── ReviewModule.js     # Post-completion review flow
│   │   └── notifications/
│   │       └── DeadlineChecker.js  # Cron: warns 24h before deadline
│   ├── interactions/
│   │   └── handlers/               # One file per button/modal customId prefix
│   │       ├── createTicket.js
│   │       ├── confirmTicket.js
│   │       ├── submitQuote.js
│   │       ├── sendMessage.js
│   │       ├── declineOrder.js
│   │       ├── selectFreelancer.js
│   │       ├── confirmPayment.js
│   │       ├── closeDiscussion.js
│   │       ├── extendDeadline.js
│   │       └── submitReview.js
│   ├── commands/
│   │   └── inviteCommand.js    # Slash command /invite @user (manager: add user to ticket channel)
│   ├── embeds/
│   │   └── templates.js            # All embed builders in one place
│   ├── utils/
│   │   ├── permissions.js          # Role/channel permission helpers
│   │   ├── validator.js            # Input sanitization
│   │   └── channelNaming.js        # Consistent channel name generation
│   └── jobs/
│       └── deadlineJob.js          # node-cron scheduler
└── database/
    └── schema.sql
```

**Key principle:** `InteractionRouter` reads the prefix of `customId` (e.g. `quote:ticketId`) and dispatches to the correct handler. Adding a new button = add one handler file, zero changes elsewhere.

---

## User Roles

```javascript
const ROLES = {
  CLIENT: 'Client',
  FREELANCER: 'Freelancer',
  MANAGER: 'Manager',
  ADMIN: 'Admin'
};
```

Role assignment is manual (via Discord or admin command). Freelancers must be approved by a manager before receiving the Freelancer role.

---

## Ticket Types

### 1. Order Ticket (full flow below)
### 2. Help Ticket — creates private channel: client + all managers
### 3. Team Application — creates a ticket channel visible to managers only, structured like an order ticket but with application-specific questions

---

## Full Order Flow

### STEP 1 — Trigger
- In a designated channel, bot posts an embed with a **"Create Ticket"** button
- User clicks → bot shows a **Select Menu** with 3 options: `Help`, `Team Application`, `Order`
- User selects an option → bot shows a **"Confirm"** button with the selected type displayed
- User clicks Confirm → private channel is created: `order-[username]` (category: `ACTIVE ORDERS`)
  - Permissions: visible only to the client and managers

### STEP 2 — Order Dialog (in private channel)
**Modal-based form:** "Fill order form" button → Modal 1 (5 fields) → "Continue — version & details" → Modal 2 (version, extra_details) → Budget select → Summary. After the form is complete (summary shown), **do not allow refill**: if user clicks "Fill order form" or "Continue" again, reply ephemeral "Order form is already complete." Do **not** reply to random text messages in the order channel when step >= 8 (no "Order form is complete. Use the summary above." spam).

Questions in order:
1. What are you in need of?
2. When is the deadline? (store as date for cron)
3. Do you have any reference images? (URLs)
4. What size would you like your build to be?
5. What theme would you like your build to be?
6. What version do you want your product in?
7. Would you like to add any more details?
8. What is your budget? → **Select Menu**: `<$100` / `$100–$500` / `$501–$1000` / `$1000+`

### STEP 3 — Order Summary Embed
After all questions, bot posts a **summary embed** in the client's channel:
- Left-side colored bar (Discord embed `color` field, use brand color e.g. `#5865F2`)
- Fields: one per answer, label = question, value = client's answer
- Below embed: **"Edit Order"** button → opens a **Discord Modal** pre-filled with all current values (TextInput components with `value` set). Client can edit any field and resubmit.

### STEP 4 — Freelancer Channel Created
After summary is confirmed (or after 60s with no edit action), bot:
1. Creates channel `quote-[username]-building` in category `QUOTES`
2. Channel is visible to all users with role `Freelancer` (and managers)
3. Posts the order details embed (same as client summary, but **without the client's username** visible)
4. Posts 3 action buttons below:

| Button | Label | Action |
|--------|-------|--------|
| 🟢 | Submit Quote | Opens Modal: Deadline (text), Price (text), Short message (paragraph) |
| 💬 | Send Message | Opens Modal: single paragraph text input |
| 🔴 | Not Interested | Removes this freelancer's view of the channel; sends them a DM |

### STEP 5 — Quote Submitted
- Quote appears in the freelancer channel as an embed (author: freelancer username, price, deadline, message)
- The **same quote embed** is forwarded to the **client's private channel** with action buttons (only **order creator** can use them):
  - **Принять** — accept quote, assign freelancer and **add freelancer to client (order) channel** so they share one chat
  - **Связаться с фрилансером** — create a **discussion thread** (private thread in client channel; client + freelancer; not a new channel). Thread has a **"Закрыть дискуссию"** button that archives the thread
  - **Отказать: цена** / **Отказать: портфолио** / **Отказать: дедлайн** — decline quote with reason (logged in action_log); **also send a message to the freelancer (quote) channel** with who was declined, why, and quote details (price, deadline, message, freelancer name)
- Client clicks Принять → freelancer is assigned and gets access to the client channel

### STEP 6 — Send Message (Freelancer ↔ Client)
- Freelancer clicks "Send Message" → fills modal
- Message appears in **both** the freelancer channel AND the client's private channel as a styled embed (thread-style)
- **Replies** are sent **under the original message** (Discord reply reference), not as new standalone messages — store last relay message IDs per ticket and use `reply: { messageReference }` when posting replies
- Client can reply via **"Reply"** button on the message embed → opens modal → reply appears in both channels **as a reply to the original message**

### STEP 7 — Not Interested
- Freelancer clicks "Not Interested"
- Bot removes their read/send permissions on that channel (`permissionOverwrites.delete`)
- Bot sends freelancer a DM: *"You've declined the order from [client]. You will no longer see this listing."*
- Bot updates a counter in the client's channel: *"2 of 8 freelancers have submitted a quote. 1 freelancer declined."*

### STEP 8 — Payment
- After freelancer is selected, manager sees a **"Confirm Payment Received"** button in the freelancer ticket channel
- **Payment confirmation is only on manager action** (no automatic message)
- Manager clicks → bot sends message to **client channel** and to **freelancer (quote) channel**: *"Payment has been confirmed…"* so the message appears in the shared order chat; bot also sends freelancer a DM

### STEP 9 — Deadline Reminder
- `node-cron` runs daily
- If a ticket's deadline is within 24 hours: bot posts reminder in both the client channel and the freelancer ticket channel
- Manager can click **"Extend Deadline"** button → Modal with new date input → updates DB and posts new deadline in both channels

### STEP 10 — Review
- After manager clicks **"Mark as Complete"**:
  - Client channel gets a message: *"Your order is complete! Please leave a review."*
  - **"Leave Review"** button → Modal: Rating (1–5, text input with validation), Comment (paragraph)
  - Review embed posted in a public `#reviews` channel (or a designated reviews channel)
  - Freelancer channel is archived (set to read-only, moved to `ARCHIVED` category)
  - Client channel is deleted after 48h (or archived — manager's choice via button)

---

## Database Schema

```sql
-- schema.sql

CREATE TABLE tickets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,              -- 'order' | 'help' | 'application'
  client_id TEXT NOT NULL,
  client_channel_id TEXT,
  freelancer_channel_id TEXT,
  assigned_freelancer_id TEXT,
  deadline TEXT,
  payment_confirmed INTEGER DEFAULT 0,
  completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE ticket_fields (
  ticket_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_value TEXT,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

CREATE TABLE proposals (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  freelancer_id TEXT NOT NULL,
  price TEXT,
  deadline TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending',   -- 'pending' | 'accepted' | 'declined'
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  freelancer_id TEXT NOT NULL,
  rating INTEGER,
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE action_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id TEXT,
  actor_id TEXT,
  action TEXT,
  detail TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## CustomId Naming Convention
All interaction customIds follow the pattern: `prefix:ticketId[:extraData]`

Examples:
- `confirm_ticket:abc123`
- `submit_quote:abc123`
- `send_message:abc123`
- `decline_order:abc123`
- `select_freelancer:abc123:freelancerId`
- `confirm_payment:abc123`
- `close_discussion:abc123:threadId`
- `extend_deadline:abc123`
- `edit_order:abc123`
- `submit_review:abc123`
- `mark_complete:abc123`

**Slash commands:** `/invite @user` — manager invites a user to the current ticket channel (client or freelancer channel).

---

## Code Style
- `async/await` only, no callbacks
- All comments in English
- Every async function wrapped in `try/catch` with winston error logging
- Constants in `UPPER_CASE`
- Functions and variables in `camelCase`
- Classes in `PascalCase`
- No magic strings — define all customId prefixes and role names as constants

---

## Environment Variables (.env)
```
DISCORD_TOKEN=
CLIENT_ID=
GUILD_ID=          # ID сервера Discord (гильдии). Режим разработчика → правый клик по серверу → Копировать ID.
DB_PATH=./database/bot.db
LOG_LEVEL=info

# Роль менеджера: ROLE_MANAGER_ID=... (ID роли) ИЛИ создайте роль с именем "Manager" и не указывайте ID.
ROLE_MANAGER_ID=

# Category IDs (set after first server setup)
CATEGORY_ACTIVE_ORDERS=
CATEGORY_QUOTES=
CATEGORY_ARCHIVED=

# Channel IDs
CHANNEL_TICKET_PANEL=
CHANNEL_REVIEWS=
```

---

## Implementation Status

### ✅ COMPLETED
- [x] Project initialized
- [x] File structure created
- [x] .cursorrules defined
- [x] Bot core + InteractionRouter
- [x] Ticket creation flow (all 3 types): panel, Create Ticket → Select (Help/Team Application/Order) → Confirm → private channel in ACTIVE ORDERS, rate limit 60s, TicketRepository
- [x] Order dialog (STEP 2): **modal-based** — "Fill order form" button → Modal 1 (5 fields) → "Continue" → Modal 2 (version, extra_details) → Budget select → Summary; save to ticket_fields + deadline
- [x] Summary embed + Edit modal (STEP 3): Edit Order button under summary; modal with 5 pre-filled fields; on submit update DB and re-post summary in channel
- [x] Freelancer channel (STEP 4): 60s after summary → quote channel in QUOTES; visible to **Freelancer** and **Manager**; order embed + 3 buttons; Not Interested = deny ViewChannel for user (so creator loses access) + DM
- [x] Quote submission (STEP 5): Submit Quote modal; quote to client with 5 buttons (Принять, Связаться с фрилансером, Отказать x3). Only order creator. Contact → **discussion thread** (not channel) with "Закрыть дискуссию" button. Decline → action_log **and message to freelancer channel** (who declined, why, quote details). Принять → freelancer added to client channel.
- [x] Message relay (STEP 6): Send Message modal → message in both channels; **replies appear under the original message** (messageReference). Reply → both channels as reply to original.
- [x] Payment confirmation (STEP 8): After freelancer selected, "Confirm Payment Received" in freelancer channel (manager only); updates payment_confirmed, notifies **client channel + freelancer channel + freelancer DM**; then "Mark as Complete" button.
- [x] Order form: After summary (step >= 8), "Fill order form" / "Continue" reply "Order form is already complete."; no reply to random messages in order channel when form complete.
- [x] Close discussion: Button "Закрыть дискуссию" in discussion thread → archives thread.
- [x] Slash command `/invite @user`: Manager invites a user to the current ticket channel (client or freelancer).
- [x] Deadline reminder (STEP 9): node-cron daily 09:00; tickets with deadline within 24h get reminder in client + freelancer channel; "Extend Deadline" button → modal → update DB and post in both channels.
- [x] Mark as Complete + Review (STEP 10): Manager "Mark as Complete" → client channel gets "Leave Review" button; freelancer channel archived (CATEGORY_ARCHIVED, read-only). Client "Leave Review" → modal (rating 1–5, comment) → review embed in CHANNEL_REVIEWS.

### 🔄 IN PROGRESS
- [ ] Freelancer decline counter in client channel (STEP 7); optional channel delete 48h after complete

### ⏳ TODO
- [ ] Channel archiving / cleanup (client channel 48h or manager choice)

---

## Checkpoints (resume after limit / new session)

**Done so far:**
- Bot + DB + InteractionRouter; ticket creation flow (panel, Create Ticket → Select → Confirm → channel, rate limit 60s).
- **Order dialog (STEP 2):** Modal-based. After order channel creation: message with button "Fill order form" (`start_order:ticketId`). Click → Modal 1 (5 fields: need, deadline, reference_urls, size, theme). Submit → "Continue" button (`order_form_2:ticketId`). Click → Modal 2 (version, extra_details). Submit → budget Select in channel → `order_budget` saves and shows summary + Edit Order. Messages in channel only give hints ("Click the button above"). Prefixes: `START_ORDER`, `ORDER_FORM_1`, `ORDER_FORM_2`, `ORDER_FORM_2_MODAL`, `ORDER_BUDGET`.
- **STEP 3:** Summary + Edit Order (modal, 5 fields).

**Next step (optional):** Freelancer decline counter in client channel; client channel delete/archive 48h after complete or manager button.

**Note:** Quote channels visible to **Freelancer** and **Manager** roles (both in overwrites). Not Interested uses deny ViewChannel so user (including creator) loses access.

---

## Testing (how to verify)

1. **Env:** `.env` — `DISCORD_TOKEN`, `CHANNEL_TICKET_PANEL`, `CATEGORY_ACTIVE_ORDERS`; optional `ROLE_MANAGER_ID` or role named "Manager". Developer Portal: **Message Content** intent on if needed.
2. **Start:** `npm start` in `botds` — console: "Bot ready", "Ticket panel posted" (if panel channel set).
3. **Panel:** In `CHANNEL_TICKET_PANEL` — embed + "Create Ticket" button.
4. **Create ticket:** Create Ticket → select Help / Team Application / Order → Confirm → channel appears in `CATEGORY_ACTIVE_ORDERS`; welcome message in channel.
5. **Order flow (type Order only):** In order channel — "Fill order form" button → Modal 1 (5 fields) → submit → "Continue" → Modal 2 (version, extra_details) → submit → budget Select in channel → choose budget → Summary embed + "Edit Order" button.
6. **Edit Order:** Under summary click Edit Order → modal with 5 fields pre-filled → submit → "Order updated." + new summary message in channel.
7. **Limits:** Second ticket within 60s → "only one ticket per 60 seconds".
8. **After order done:** Quote channel; 5 client buttons (Принять, Связаться, Отказать x3). **Send Message** + **Reply** in both channels. **Confirm Payment** (manager) → client + freelancer DM; then **Mark as Complete** → **Leave Review** (client); review to CHANNEL_REVIEWS; freelancer channel archived. **Extend Deadline** (manager) in reminder or anytime. Set `CHANNEL_REVIEWS` and `CATEGORY_ARCHIVED` in .env.

---

## Что проверить вручную (чек-лист)

- **Квоты у клиента:** У сообщения с квотой 5 кнопок; нажимать может только создатель заказа. Принять (фрилансер добавляется в канал заказа) / Связаться с фрилансером (создаётся **ветка/тред** в канале заказа, кнопка «Закрыть дискуссию») / Отказать: цена, портфолио, дедлайн (в канал фрилансеров уходит сообщение: кому отказали, почему, детали квоты).
- **STEP 8 — Оплата:** После выбора фрилансера в канале квот появляется «Confirm Payment Received». Нажимает только менеджер → сообщение об оплате в **канал клиента и в канал фрилансеров** (и фрилансеру в ЛС); затем в канале квот — «Mark as Complete».
- **/invite @user:** В канале тикета (клиента или фрилансеров) менеджер может вызвать `/invite @user` — пользователь получит доступ к каналу.
- **STEP 9 — Дедлайн:** Cron каждый день в 09:00; тикеты с дедлайном в ближайшие 24ч получают напоминание в оба канала; в канале фрилансеров кнопка «Extend Deadline» → модалка с датой → обновление дедлайна и сообщение в оба канала.
- **STEP 10 — Завершение и отзыв:** Менеджер жмёт «Mark as Complete» → в канал клиента «Your order is complete! Please leave a review» + кнопка «Leave Review». Клиент жмёт → модалка (рейтинг 1–5, комментарий) → отзыв в CHANNEL_REVIEWS; канал фрилансеров переносится в CATEGORY_ARCHIVED и становится только для чтения.

---

## Updates Log

### v1.0.0
- Full spec defined
- Architecture finalized: event-driven modular with InteractionRouter
- Database schema designed
- All flows documented in detail
- Ticket creation flow implemented (panel, select, confirm, channel, DB)
- Order dialog (STEP 2): modal-based form (Part 1 → Part 2 → budget select), ticket_fields + deadline; bugfix: step 6 (extra_details) now correctly sends budget menu
- Summary + Edit Order (STEP 3): summary embed with Edit Order button; modal with 5 pre-filled fields; submit updates ticket_fields and re-posts summary
- Testing section and checkpoint text updated in cursorrules
- Order flow switched to modals (Fill order form → Part 1 → Part 2 → budget → summary)
- STEP 4: Quote channel 60s after summary; Not Interested implemented; Submit Quote / Send Message stubs
- STEP 5: Client quote buttons (Принять, Связаться, Отказать x3); STEP 6: Send Message + Reply relay
- STEP 8: Confirm Payment (manager), notify client + freelancer DM, Mark as Complete button
- STEP 9: Deadline cron (daily 09:00), Extend Deadline button + modal
- STEP 10: Mark as Complete, Leave Review modal, review embed in CHANNEL_REVIEWS, freelancer channel archived

### v1.1.0 (fixes after testing)
- **Contact freelancer:** Create **private thread** in client channel (not new channel); add freelancer to thread; button «Закрыть дискуссию» archives thread (close_discussion handler).
- **Relay replies:** Store last relay message IDs per ticket (relayMessageStore); replies sent with `reply: { messageReference }` so they appear under the original message in both channels.
- **Order form:** When step >= 8, «Fill order form» / «Continue» reply «Order form is already complete.»; handleOrderChannelMessage does not reply to random messages when form complete (no «Order form is complete» spam).
- **Select freelancer:** After accept, add freelancer to client (order) channel (permissionOverwrites); payment message posted to client channel + freelancer channel + freelancer DM.
- **Decline quote:** After decline, send message to freelancer (quote) channel with who was declined, why, and quote details (price, deadline, message, freelancer name).
- **/invite @user:** Slash command (manager only) to invite a user to the current ticket channel; registerCommandHandler + inviteCommand.js; GUILD_ID required for command registration.
