# Архитектура — как устроен BoCampus

Как код и данные ходят по системе. Что бот должен делать — `SPEC.md`.
Открывать перед новой кнопкой, командой, колонкой или таймером.

## Стек

- Node.js 22+ (ES-модули, `"type": "module"`)
- discord.js v14 — кнопки, модалки, меню, слэш-команды
- SQLite через `better-sqlite3` (синхронный API — это важно, см. «Гонки»)
- `node-cron` — ежедневные напоминания, `winston` — логи, `dotenv` — секреты

## Слои

```
src/index.js                 старт: база → клиент → роутер → модуль → login
src/core/
  Bot.js                     Discord-клиент (синглтон), интенты
  Database.js                открыть базу, schema.sql, runMigrations, query/get/run
  GuildConfig.js             настройки сервера: guild_config → .env → null (кэш в памяти)
  InteractionRouter.js       interactionCreate → обработчик по префиксу customId
src/modules/tickets/
  TicketModule.js            регистрирует ВСЕ обработчики и команды; задачи на ready
  TicketRepository.js        SQL по tickets / ticket_fields
  TicketStatus.js            СТАДИЯ ТИКЕТА: STATUS, таблица переходов, transitionTicket, closeRefusal
  events.js                  шина событий: created / status / review
  OrderCard.js               живая карточка заказа (слушает status)
  StaffLog.js                лог-канал менеджеров (слушает все события)
  closing.js                 beginClose (синхронный шлюз) + archiveClosed (медленное)
  Reports.js                 запросы для /orders и /stats
  flows/OrderFlow.js         форма заказа, таймер канала квот и его восстановление
  flows/ApplicationFlow.js   заявка в команду: форма, Accept/Reject (обработчики регистрируются прямо отсюда)
src/modules/proposals/ProposalRepository.js SQL по proposals + quoteRefusal (можно ли квотировать)
src/modules/reviews/ReviewRepository.js     SQL по reviews (один отзыв на тикет) + репутация фрилансера
src/modules/site/SiteBridge.js              мост на сайт: подпись, очередь site_outbox, ретраи, черновик работы
src/modules/site/consent.js                 кнопки согласия клиента (работа / отзыв на сайте)
src/modules/tickets/Transcript.js           транскрипт переписки при закрытии (слушает status)
src/interactions/handlers/   один файл = один префикс customId
src/commands/                /setup, /invite (данные команды + обработчик)
src/embeds/templates.js      все эмбеды, кнопки, модалки
src/jobs/deadlineJob.js      cron 09:00 BOT_TIMEZONE: напоминания о дедлайне
src/jobs/cleanupJob.js       раз в 10 минут: удалить каналы закрытых тикетов + гигиена брошенных форм
src/jobs/backupJob.js        04:00: бэкап базы (только если задан BACKUP_DIR — на VPS)
src/utils/permissions.js     isManagerOrAdmin, ensureTicketClient — ВСЕ проверки «кто ты»
src/utils/replies.js         replyError — ответ об ошибке в любом состоянии interaction
src/utils/panel.js           ensurePanel — панель без дублей
src/utils/channels.js        archiveChannel / archiveQuoteChannel — в архив и только чтение
src/utils/dates.js           parseDeadline — текст человека → 'YYYY-MM-DD'
src/utils/pricing.js         parseSize, estimateOrder — формула цены сайта
src/utils/                   channelNaming, rateLimit, logger
src/modules/conversations/   переписка билдер ↔ клиент (Send Message): репозиторий + карточки
database/schema.sql          таблицы для свежей базы
tests/                       node --test; helpers/fakes.js (фейки Discord), helpers/db.js (база в памяти)
scripts/check-syntax.js      npm run check
```

Пустые заглушки из исходной структуры (`PaymentModule`, `ReviewModule`,
`ProposalModule`, `DeadlineChecker`, `HelpFlow`, `validator.js`) удалены
2026-10-26: логика живёт в обработчиках и репозиториях.

## События

```
transitionTicket / createTicket / отзыв ──emit──▶ ticketEvents
                                                   ├─▶ OrderCard (status: перерисовать карточку)
                                                   ├─▶ StaffLog  (всё: строка в лог-канал)
                                                   └─▶ Transcript (status → closed: файл переписки)
```

Подписки — в `TicketModule.registerTicketModule`. Слушатели не бросают
исключений (асинхронные ловят свои ошибки): событие испускается внутри
`transitionTicket`, и упавший слушатель не должен ломать переход.

## Поток одного нажатия

```
пользователь жмёт кнопку  customId = "confirm_payment:3f9a1c2b7d4e"
        │
InteractionRouter         prefix = "confirm_payment", parts = ["confirm_payment", "3f9a1c2b7d4e"]
        │                 handlers.get(prefix)
handler(interaction, parts)
        ├─ проверка: кто нажал (isManagerOrAdmin / ticket.client_id)
        ├─ чтение/запись в базу (синхронно)
        ├─ interaction.update / reply   ← в пределах 3 секунд
        └─ сообщения в каналы (await)   ← медленное — после ответа
        │
ошибка → роутер ловит, логирует, replyError → «Something went wrong.»
```

**Соглашение `customId`:** `префикс:ticketId[:доп]`, ≤ 100 символов.
Примеры: `select_freelancer:<ticketId>:<userId>`,
`decline_quote:<ticketId>:<proposalId>:price`. Все префиксы — `PREFIX` в
`src/constants.js`.

**Добавить кнопку:** префикс в `PREFIX` → билдер в `templates.js` → файл в
`handlers/` → `registerHandler` в `TicketModule.js`. Больше нигде.

**Добавить слэш-команду:** файл в `src/commands/` (данные + обработчик) →
`registerCommandHandler` и массив `commands` в `TicketModule.js`. Команды
регистрируются на `ready`: с `GUILD_ID` — мгновенно на один сервер, без него —
глобально (до часа).

## Данные

| Таблица | Что | Ключевые поля |
|---|---|---|
| `tickets` | тикет любого типа | `type`, `guild_id`, `client_id`, `client_channel_id`, `freelancer_channel_id`, `assigned_freelancer_id`, `deadline`, `payment_confirmed`, `completed`, `quote_channel_due_at`, `number` (номер на сервере: #1, #2…) |
| `conversations` | переписка билдера с клиентом по заказу | `ticket_id`, `freelancer_id` (уникальная пара), `client_msg_id`, `quote_msg_id`, `thread_id` |
| `conversation_messages` | её сообщения | `author_role`: builder / client / team, `content`, `created_at` |
| `ticket_fields` | ответы формы | `ticket_id`, `field_name`, `field_value` (ключ-значение) |
| `proposals` | квоты | `status`: pending / accepted / declined |
| `reviews` | отзывы | `rating`, `comment` |
| `action_log` | журнал действий | `actor_id`, `action`, `detail` |
| `guild_config` | настройки `/setup` | по колонке на настройку |

**Стадия тикета — одна колонка `status`** (с 2026-10-26), переходы — таблица
`TRANSITIONS` в `TicketStatus.js`. Переход — один условный
`UPDATE ... WHERE status IN (разрешённые)`: проверка и запись неделимы, так
что двойной клик физически не проводит заказ дважды. Тот же урок, что
`products.state` в SouCampus builds. `payment_confirmed`/`completed` —
наследие: пишутся вместе со статусом (чтобы старый код мог открыть ту же
базу), но не читаются. `assigned_freelancer_id` — данные (кто), не стадия.

`tickets.deadline` — только `YYYY-MM-DD` или NULL; что ввёл клиент — в
`ticket_fields`. `channel_delete_at` — когда удалить канал закрытого тикета
(NULL = хранить). `quote_counter_msg_id` — сообщение-счётчик у клиента.

**Миграции** (`runMigrations`, на каждом старте, идемпотентно): колонки →
`normalizeDeadlines` (старый текст → дата, относительный — от дня создания)
→ `backfillStatus` (статус из старых флагов) → индексы. Обе проверены на копии
живой базы.

## Настройки сервера

`getSetting(guildId, key)`: значение из `guild_config` → переменная `.env` из
`SETTINGS` → `null`. Кэш в памяти сбрасывается при `setSetting`.

## Таймеры и фоновые задачи

| Что | Где | Переживает перезапуск |
|---|---|---|
| Канал квот через 60 с | `scheduleQuoteChannelCreation` | 🟢 да: `quote_channel_due_at` + `recoverPendingQuoteChannels` на `ready` |
| Напоминание о дедлайне | `deadlineJob.js`, cron `0 9 * * *` в `BOT_TIMEZONE` | 🟢 cron перезапускается сам |
| Удаление каналов закрытых тикетов | `cleanupJob.js`, обход базы раз в 10 минут + на старте | 🟢 время в `channel_delete_at`; упавшее удаление повторится |
| Лимит тикетов 60 с | `rateLimit.js`, `Map` в памяти | 🔴 нет (и не страшно) |

## Гонки

`better-sqlite3` синхронный, Node однопоточный. Пока между «проверил» и
«записал» нет `await`, двойное нажатие не пролезет: второй обработчик
увидит уже записанное. Шаблон — `selectFreelancer.js`: все проверки и
`acceptProposal` до первого `await`.

## Безопасность — карта дверей

| Действие | Кто может | Где проверка | Статус |
|---|---|---|---|
| Принять / отклонить квоту, тред | клиент | `ticket.client_id` | 🟢 |
| Отзыв | клиент, заказ завершён, один раз | `submitReview(Modal).js` + `getReviewByTicketId` | 🟡 тест есть, Discord — нет |
| Закрыть тикет | менеджер всегда; владелец — по стадии | `closeRefusal` + `transitionTicket(CLOSED)` | 🟡 тест есть |
| Keep archived | менеджер | `isManagerOrAdmin` | 🟡 тест есть |
| Заявка: заполнить/править | заявитель, пока не решено | `ensureTicketClient` + статус `open` | 🟡 тест есть |
| Заявка: Accept / Reject (кнопка И модалка) | менеджер, один раз | `isManagerOrAdmin` + переход | 🟡 тест есть |
| Форма заказа, правка | клиент | `ensureTicketClient` во всех 7 обработчиках | 🟡 тест есть |
| Квота | фрилансер, пока нет исполнителя, одна ожидающая | `quoteRefusal` (кнопка И модалка) | 🟡 тест есть |
| Send Message (кнопка И модалка) | билдер (роль Freelancer) или менеджер, заказ `open`, не сам клиент | `startRefusal` | 🟡 тест есть |
| Reply в переписке (кнопка И модалка) | клиент, этот билдер, менеджер | `speakerRole` | 🟡 тест есть |
| Оплата, завершение, дедлайн (кнопка И модалка), `/invite` | менеджер | `isManagerOrAdmin`: Administrator или роль из `/setup` | 🟡 тест есть |
| `/setup` | админ | `setDefaultMemberPermissions(Administrator)` | 🟢 |

**Менеджер по имени роли.** Роль «Manager»/«Admin» по имени работает, только
пока роль менеджера не задана через `/setup`. Как только задана — двойник с
тем же именем ничего не даёт (тест `permissions.test.js`).

## Задача → файлы

| Задача | Файлы |
|---|---|
| Текст или вид сообщения | `src/embeds/templates.js` |
| Права менеджера/ролей | `src/utils/permissions.js` |
| Новая настройка `/setup` | `GuildConfig.js` (`SETTINGS`), `setupCommand.js`, колонка в `schema.sql` + `runMigrations` |
| Форма заказа | `OrderFlow.js`, `templates.js` (`buildOrderModal`, `buildOrderFinishModal`, `getOrderSummaryPayload`), `constants.js` (`ORDER_FIELDS`, `REQUIRED_ORDER_FIELDS`, `MINECRAFT_VERSIONS`) |
| Создание тикета (канал, приветствие) | `modules/tickets/openTicket.js`, карточка — `templates.js` → `ticketWelcomePayload` |
| Канал квот | `OrderFlow.js` → `createQuoteChannelForTicket` |
| Новая колонка | `schema.sql` + `Database.js` → `runMigrations` |
| Что делает бот на старте | `TicketModule.js` → `ClientReady` |
| Ошибки процесса и шлюза | `index.js` (`unhandledRejection`), `Bot.js` (`Events.Error`) |
| Тест на обработчик | `tests/*.test.js`, фейки — `tests/helpers/fakes.js` |
| Новая стадия / переход тикета | `TicketStatus.js` → `TRANSITIONS` (+ `SIDE_EFFECTS`, `CLIENT_CLOSABLE`) |
| Формат дедлайна | `utils/dates.js` → `parseDeadline` + `tests/dates.test.js` |
| Заявка в команду | `flows/ApplicationFlow.js`, поля — `APPLICATION_FIELDS` в `constants.js` |
| Что показывает карточка заказа | `templates.js` → `orderCardEmbed`; когда обновляется — `OrderCard.js` |
| Новая реакция на событие тикета | слушатель на `ticketEvents` + подписка в `TicketModule` |
| Что уходит на сайт и как | `docs/PHASE4.md`, `src/modules/site/*`; формат подписи держит тест-вектор |
| Новая слэш-команда для менеджеров | `src/commands/*`, запрос — `Reports.js` |
