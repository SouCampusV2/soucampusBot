# Ручной чек-лист — прогон в Discord

Живой чек-лист владельца: то, что проверяется только руками на тестовом
сервере. **Правит владелец**; Claude без просьбы отметки не трогает, а если
правка кода делает пункт неверным — говорит об этом и предлагает пересобрать.

Написан по коду ветки `dev` 2026-10-26 (подписи — из `src/embeds/templates.js`).

**Пересборки (до первого прохода, отметок не было):**
- 25.10 — русские подписи кнопок заменены английскими вслед за кодом.
- 26.10 — добавлены разделы 5–7 (закрытие, заявки, дедлайны) под
  фазу 2; в § 2 добавлена проверка «правка после выбора исполнителя
  запрещена»; из § 5 убран пункт «Help закрыть пока нельзя» — теперь можно.
  Ничего живого не выброшено.
- 26.10 (позже) — § 8 под фазу 3 (карточка, оценка, /orders, /stats, лог). Пункт
  про отдельное сообщение-счётчик в § 3 переписаны: счётчик теперь строка в
  карточке заказа. Прежний § 8 «Прочее» стал § 9.
- 27.10 — § 9 «Транскрипт и сайт»; «Прочее» стало § 10.
- 27.10 (позже) — § 3: пункты про «канал через 60 с» и «перезапуск в эти 60 с»
  заменены проверками **Submit order** (таймер снят решением владельца).

Пункты ⚠️ — баги, починенные в `dev` и покрытые тестами: подтвердить вживую.

Нужно: тестовый сервер, бот с правом Administrator и ролью **выше** роли
Freelancer (иначе он не сможет её выдавать), **два аккаунта** — А (ты:
админ) и Б (клиент/заявитель; для фрилансера ему же выдать роль Freelancer
или третий аккаунт). Перед прогоном: `git checkout dev`, `npm start`, в
консоли «Bot ready».

## 1. Настройка

- [ ] `/setup active_orders`, `quotes`, `archived` — три категории; `/setup reviews` — канал.
- [ ] `/setup manager_role` (роль с именем НЕ «Manager», например «Staff») и `freelancer_role`. `/setup view` показывает всё.
- [ ] `/setup panel` — в канале эмбед «Create a ticket» с кнопкой **Create Ticket**.
- [ ] Перезапустить бота → панель **не** появилась второй раз. ⚠️
- [ ] Аккаунт Б: команды `/setup` не видно.

## 2. Тикет заказа (аккаунт Б)

- [ ] **Create Ticket** → Order → **Confirm — Order** → канал `order-<ник>`, без «This interaction failed». ⚠️
- [ ] В приветствии есть **Close ticket**.
- [ ] Канал видят Б и роль менеджера; посторонний — нет.
- [ ] Второй тикет сразу → «only one ticket per 60 seconds».
- [ ] **Fill order form** → Part 1 → **Continue — version & details** → Part 2 → меню бюджета в **€** → «Order summary». ⚠️
- [ ] Ещё раз **Fill order form** → «Order form is already complete.»
- [ ] **Edit Order** → поля заполнены → сохранить → новое summary.
- [ ] **Edit Order** / **Fill order form** нажимает аккаунт А → «Only the client who opened this order can do that.» ⚠️
- [ ] После **Accept** квоты (§ 3) **Edit Order** → «can no longer be edited».

## 3. Квоты (фрилансер)

- [ ] После бюджета — summary с **Edit Order** и **Submit order**; канала квот ещё нет.
- [ ] **Submit order** при пустом обязательном поле → список, чего не хватает. Всё заполнено → «Order submitted», сразу канал `quote-<ник>-building`, в карточке у фрилансеров «Client: @ник».
- [ ] Второй **Submit order** → «already submitted», второго канала нет.
- [ ] **Edit Order** клиентом → в канале квот «The client updated the order» с новыми данными, без имени клиента.
- [ ] **Submit Quote** → квота в канале квот и у клиента с кнопками **Accept**, **Contact freelancer**, **Decline: price / portfolio / deadline**.
- [ ] В карточке заказа у клиента: Quotes «1 received · 0 not interested».
- [ ] Вторая **Submit Quote** тем же фрилансером → «You already sent a quote…». ⚠️
- [ ] Кнопки квоты жмёт не клиент → «Only the order creator…».
- [ ] **Contact freelancer** → приватный тред; **Close discussion** архивирует.
- [ ] **Decline: price** → в канале квот эмбед «Quote declined by the client» с причиной и деталями.
- [ ] **Send Message** → сообщение в обоих каналах; **Reply** клиента → реплаем под ним.
- [ ] **Not Interested** (другой фрилансер) → теряет канал, в ЛС «declined the order from <ник клиента>»; в карточке клиента «… · 1 not interested» (та же карточка, не новое сообщение). ⚠️
- [ ] **Accept** → фрилансер появился в канале клиента; в канале квот — **Confirm Payment Received**.
- [ ] После **Accept** новая **Submit Quote** → «quotes are closed». ⚠️

## 4. Оплата и сдача (аккаунт А)

- [ ] **Confirm Payment Received** жмёт фрилансер → отказ.
- [ ] Менеджер с ролью «Staff» (из `/setup`) жмёт → работает. ⚠️
- [ ] Двойной быстрый клик по **Confirm Payment Received** → одно подтверждение, второй — «already confirmed».
- [ ] Подтвердил → сообщения в оба канала, ЛС фрилансеру, кнопка **Mark as Complete**.
- [ ] **Mark as Complete** → у клиента «Your order is complete!» + **Leave Review** + **Close ticket**.
- [ ] Канал квот ушёл в archived, фрилансер **не может** писать. ⚠️
- [ ] **Leave Review** (рейтинг 1–5) → эмбед в канале отзывов.
- [ ] Второй раз **Leave Review** → «You have already reviewed this order». ⚠️

## 5. Закрытие тикетов

- [ ] Новый заказ, до выбора исполнителя: Б жмёт **Close ticket** → канал в archived, Б не может писать, сообщение «deleted in 2 days» с **Keep archived**.
- [ ] Заказ после **Accept**, до сдачи: Б жмёт **Close ticket** → «ask a manager». А — закрывает.
- [ ] **Keep archived** жмёт Б → отказ; жмёт А → «will not be deleted».
- [ ] Заказ, отменённый до сдачи, закрыл и свой канал квот («This order was closed»).
- [ ] Help-тикет: канал `help-<ник>`, Б закрывает сам.
- [ ] (Можно проверить быстро: в базе `UPDATE tickets SET channel_delete_at = 1 WHERE id = '<id>'` → в течение 10 минут или на перезапуске канал удалён.)

## 6. Заявка в команду (аккаунт Б — заявитель)

- [ ] **Create Ticket** → Team Application → канал `apply-<ник>`, видят Б и менеджеры.
- [ ] **Fill application** → 5 полей → «Application sent!»; в канале summary с **Edit application**, **Accept**, **Reject**.
- [ ] **Accept** жмёт Б → отказ.
- [ ] **Edit application** → поля заполнены → новое summary.
- [ ] А жмёт **Accept** → Б получил роль Freelancer, «welcome to the build team», ЛС.
- [ ] Повторный **Accept** / **Reject** → «already decided».
- [ ] Новая заявка: А жмёт **Reject** → модалка причины → причина в канале и в ЛС Б, роли нет.
- [ ] Роль бота **ниже** Freelancer → **Accept** честно пишет «Could not give the Freelancer role».

## 7. Дедлайны

- [ ] В форме дедлайн `25.12.2026` / `in 2 weeks` → без предупреждения.
- [ ] В форме дедлайн `asap` → «Part 1 saved» + предупреждение «no deadline reminders».
- [ ] **Extend Deadline** (из напоминания, менеджер): `soon` → «Could not read»; `2001-01-01` → «in the past»; `31.12.2026` → «Deadline updated to 2026-12-31» в оба канала.
- [ ] Дедлайн завтра → в 09:00 по Таллину напоминание «is tomorrow» в оба канала.

## 8. Карточка заказа и инструменты менеджера (фаза 3)

- [ ] Заказ с размером `150x150`: в summary и у фрилансеров поле «Estimate (guide)» с ~€225 · ~1 week.
- [ ] После бюджета в канале клиента появилась **карточка** «Order · <id>», закреплённая (если у бота есть Manage Messages).
- [ ] Новая квота / Not Interested → цифры в карточке меняются, новое сообщение не появляется.
- [ ] **Accept** → в карточке исполнитель и цена; **Confirm Payment** → «In progress»; **Mark as Complete** → «Delivered».
- [ ] Квота от фрилансера без истории → «🆕 New on this server»; после сданного заказа с отзывом → ⭐ и число заказов.
- [ ] `/setup log_channel` → в лог-канале строка на новый тикет, каждый переход и отзыв; упоминания не пингуют.
- [ ] `/orders` (менеджер) → список открытых тикетов; у заказа с прошедшим дедлайном — ⚠️ OVERDUE сверху. Не-менеджер → отказ.
- [ ] `/stats` (менеджер) → заказы, оплачено (%), сдано, средняя цена, отзывы, заявки.
- [ ] Тикет `71713f1e5f3e` (брошенная форма с февраля) получил напоминание 26.10 и закроется сам через 24 ч.

## 9. Транскрипт и сайт (фаза 3–4)

- [ ] Закрыть любой тикет → в лог-канале файл `transcript-<id>.txt`; клиенту в ЛС тот же файл; в файле видны сообщения людей с текстом.
- [ ] **Mark as Complete** → у клиента вопрос «May we show this build in the SouCampus portfolio?» с **Yes, show it** / **No, keep it private**.
- [ ] Кнопку жмёт не клиент → отказ. Клиент жмёт **Yes** → «The SouCampus team will review it…», повторное нажатие → «already answered».
- [ ] После **Leave Review** → вопрос «May we show your review on soucampus.online?».
- [ ] Пока мост к сайту не настроен, «Yes» ничего не ломает: заявка ждёт в очереди бота, в логах нет «Website delivery failed».

- [ ] `/setup showcase_channel #канал` → ответ видишь только ты, в нём скрытая ссылка вебхука; повтор — та же ссылка; `new_link: true` — новая, в настройках канала → Интеграции → Вебхуки остался один «SouCampus Showcase».

## 10. Прочее

- [ ] `/invite @user` в канале тикета (менеджер) → пользователь видит канал.
- [ ] Developer Portal: выключить **Server Members Intent** → бот стартует и всё выше работает.
