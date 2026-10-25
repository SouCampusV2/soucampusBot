# Ручной чек-лист — прогон в Discord

Живой чек-лист владельца: то, что проверяется только руками на тестовом
сервере. **Правит владелец**; Claude без просьбы отметки не трогает, а если
правка кода делает пункт неверным — говорит об этом и предлагает пересобрать.

Написан по коду ветки `dev` 2026-10-25 (подписи кнопок — из
`src/embeds/templates.js`). **Пересборка 25.10 (до первого прохода, отметок
не было):** русские подписи кнопок заменены английскими вслед за кодом;
пункты ⚠️ — баги, починенные в `dev` и покрытые тестами, — здесь их надо
подтвердить вживую. Ничего не выброшено.

Нужно: тестовый сервер, бот с правом Administrator, **два аккаунта** —
А (ты: админ) и Б (клиент; для фрилансера ему же выдать роль Freelancer или
третий аккаунт). Перед прогоном: `git checkout dev`, `npm start`, в консоли
«Bot ready».

## 1. Настройка

- [ ] `/setup active_orders`, `quotes`, `archived` — три категории; `/setup reviews` — канал.
- [ ] `/setup manager_role` (роль с именем НЕ «Manager», например «Staff») и `freelancer_role`. `/setup view` показывает всё.
- [ ] `/setup panel` — в канале эмбед «Create a ticket» с кнопкой **Create Ticket**.
- [ ] Перезапустить бота → панель **не** появилась второй раз. ⚠️
- [ ] Аккаунт Б: команды `/setup` не видно.

## 2. Тикет заказа (аккаунт Б)

- [ ] **Create Ticket** → меню → Order → **Confirm — Order** → канал `order-<ник>`, без «This interaction failed». ⚠️
- [ ] Канал видят Б и роль менеджера; посторонний — нет.
- [ ] Второй тикет сразу → «only one ticket per 60 seconds».
- [ ] **Fill order form** → Part 1 → **Continue — version & details** → Part 2 → меню бюджета в **€** → «Order summary». ⚠️
- [ ] Ещё раз **Fill order form** → «Order form is already complete.»
- [ ] **Edit Order** → поля заполнены → сохранить → новое summary.
- [ ] **Edit Order** / **Fill order form** нажимает аккаунт А → «Only the client who opened this order can do that.» ⚠️

## 3. Квоты (фрилансер)

- [ ] Через ~60 с после summary — канал `quote-…-building`, без имени клиента.
- [ ] Остановить бота сразу после summary, запустить через 2 мин → канал квот всё равно создан.
- [ ] **Submit Quote** → квота в канале квот и у клиента с кнопками **Accept**, **Contact freelancer**, **Decline: price / portfolio / deadline**.
- [ ] Вторая **Submit Quote** тем же фрилансером → «You already sent a quote…». ⚠️
- [ ] Кнопки квоты жмёт не клиент → «Only the order creator…».
- [ ] **Contact freelancer** → приватный тред; **Close discussion** архивирует.
- [ ] **Decline: price** → в канале квот эмбед «Quote declined by the client» с причиной и деталями.
- [ ] **Send Message** → сообщение в обоих каналах; **Reply** клиента → реплаем под ним.
- [ ] **Not Interested** → фрилансер теряет канал, в ЛС «declined the order from <ник клиента>». ⚠️
- [ ] **Accept** → фрилансер появился в канале клиента; в канале квот — **Confirm Payment Received**.
- [ ] После **Accept** новая **Submit Quote** → «quotes are closed». ⚠️

## 4. Оплата и сдача (аккаунт А)

- [ ] **Confirm Payment Received** жмёт фрилансер → отказ.
- [ ] Менеджер с ролью «Staff» (из `/setup`) жмёт → работает. ⚠️
- [ ] Подтвердил → сообщения в оба канала, ЛС фрилансеру, кнопка **Mark as Complete**.
- [ ] **Mark as Complete** → у клиента «Your order is complete!» + **Leave Review**.
- [ ] Канал квот ушёл в archived, фрилансер **не может** писать. ⚠️
- [ ] **Leave Review** (рейтинг 1–5) → эмбед в канале отзывов.
- [ ] Второй раз **Leave Review** → «You have already reviewed this order». ⚠️

## 5. Прочее

- [ ] `/invite @user` в канале тикета (менеджер) → пользователь видит канал.
- [ ] Developer Portal: выключить **Server Members Intent** → бот стартует и всё выше работает (интент больше не нужен).
- [ ] Help-тикет: канал создан. Закрыть пока нельзя — фаза 2, не баг прогона.
- [ ] Дедлайн `2026-10-26` (завтра) → в 09:00 напоминание с **Extend Deadline**.
- [ ] Дедлайн «через неделю» → напоминания не будет (известно, фаза 2).
