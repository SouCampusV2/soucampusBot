# Архитектура — как устроен BoCampus

Как код и данные ходят по системе. Что бот должен делать — `SPEC.md`.
Открывать перед новой кнопкой, командой, колонкой или таймером.

## Стек

- Node.js 18+ (ES-модули, `"type": "module"`)
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
  flows/OrderFlow.js         форма заказа, таймер канала квот и его восстановление
  flows/HelpFlow.js, ApplicationFlow.js     🔴 заглушки
src/modules/proposals/ProposalRepository.js SQL по proposals + quoteRefusal (можно ли квотировать)
src/modules/reviews/ReviewRepository.js     SQL по reviews (один отзыв на тикет)
src/interactions/handlers/   один файл = один префикс customId
src/commands/                /setup, /invite (данные команды + обработчик)
src/embeds/templates.js      все эмбеды, кнопки, модалки
src/jobs/deadlineJob.js      cron 09:00
src/utils/permissions.js     isManagerOrAdmin, ensureTicketClient — ВСЕ проверки «кто ты»
src/utils/replies.js         replyError — ответ об ошибке в любом состоянии interaction
src/utils/panel.js           ensurePanel — панель без дублей
src/utils/                   channelNaming, rateLimit, logger, relayMessageStore
database/schema.sql          таблицы для свежей базы
tests/                       node --test; helpers/fakes.js (фейки Discord), helpers/db.js (база в памяти)
scripts/check-syntax.js      npm run check
```

Пустые заглушки `PaymentModule`, `ReviewModule`, `ProposalModule`,
`DeadlineChecker`, `validator.js` — остались от исходной структуры; логика
живёт в обработчиках. Решение в фазе 2: удалить или наполнить.

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
| `tickets` | тикет любого типа | `type`, `guild_id`, `client_id`, `client_channel_id`, `freelancer_channel_id`, `assigned_freelancer_id`, `deadline`, `payment_confirmed`, `completed`, `relay_*_msg_id`, `quote_channel_due_at` |
| `ticket_fields` | ответы формы | `ticket_id`, `field_name`, `field_value` (ключ-значение) |
| `proposals` | квоты | `status`: pending / accepted / declined |
| `reviews` | отзывы | `rating`, `comment` |
| `action_log` | журнал действий | `actor_id`, `action`, `detail` |
| `guild_config` | настройки `/setup` | по колонке на настройку |

**Состояние заказа сейчас размазано** по флагам (`assigned_freelancer_id`,
`payment_confirmed`, `completed`). Шаг формы считается числом строк в
`ticket_fields` (`getCurrentStep`) — хрупко. План фазы 2: одна колонка
`status` (`draft → open → assigned → paid → completed → closed`) с
разрешёнными переходами в одной функции — тот же урок, что `products.state`
в SouCampus builds.

## Настройки сервера

`getSetting(guildId, key)`: значение из `guild_config` → переменная `.env` из
`SETTINGS` → `null`. Кэш в памяти сбрасывается при `setSetting`.

## Таймеры и фоновые задачи

| Что | Где | Переживает перезапуск |
|---|---|---|
| Канал квот через 60 с | `scheduleQuoteChannelCreation` | 🟢 да: `quote_channel_due_at` + `recoverPendingQuoteChannels` на `ready` |
| Напоминание о дедлайне | `deadlineJob.js`, cron `0 9 * * *` | 🟢 cron перезапускается сам; 🔴 дедлайн-текст не читается |
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
| Форма заказа, правка | клиент | `ensureTicketClient` во всех 7 обработчиках | 🟡 тест есть |
| Квота | фрилансер, пока нет исполнителя, одна ожидающая | `quoteRefusal` (кнопка И модалка) | 🟡 тест есть |
| Сообщение relay | кто видит канал | — (канал видят только участники) | 🟡 |
| Оплата, завершение, дедлайн, `/invite` | менеджер | `isManagerOrAdmin`: Administrator или роль из `/setup` | 🟡 тест есть |
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
| Форма заказа | `OrderFlow.js`, `templates.js` (`EDIT_ORDER_MODAL_FIELDS`, `ORDER_FORM_2_FIELDS`), `constants.js` |
| Канал квот | `OrderFlow.js` → `createQuoteChannelForTicket` |
| Новая колонка | `schema.sql` + `Database.js` → `runMigrations` |
| Что делает бот на старте | `TicketModule.js` → `ClientReady` |
| Ошибки процесса и шлюза | `index.js` (`unhandledRejection`), `Bot.js` (`Events.Error`) |
| Тест на обработчик | `tests/*.test.js`, фейки — `tests/helpers/fakes.js` |
