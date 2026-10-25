# Пакет для сайта — приём из Discord-бота

Файлы этой папки повторяют пути в репозитории сайта (`Claude/FirstTry`).
**Написаны, но в репозитории сайта не запускались** — их нужно перенести и
прогнать проверки сайта. В сайт не коммитил намеренно: у него свои правила
(ветка `dev`, миграции на проде прогоняет владелец, деплой Vercel).

Зачем и как устроено — `../../PHASE4.md`.

## Что перенести

| Файл здесь | Куда в сайте | Что это |
|---|---|---|
| `supabase/migrations/20261027120000_discord_inbox.sql` | то же | таблица очереди + вид уведомления `discord_inbox` |
| `src/lib/discord-bridge.ts` | то же | подпись, проверка тела, скачивание фото с защитой от SSRF |
| `src/lib/discord-bridge.test.ts` | то же | общий с ботом тестовый вектор подписи |
| `src/app/api/discord/bridge/route.ts` | то же | вход для бота |

## Правки в существующих файлах сайта

1. `src/lib/rate-limit.ts` → `RATE_LIMITS`:
   ```ts
   /**
    * Вход от Discord-бота. Отправитель один (бот), события редкие —
    * десятки в час уже значат, что ключ утёк или бот зациклился.
    */
   "discord-bridge": { limit: 60, windowSeconds: HOUR },
   ```
2. `src/lib/notification-shape.ts` → `NotificationKind`: добавить
   `| "discord_inbox"` (миграция уже разрешает его в базе).
3. Иконка/текст уведомления, если колокол рисует их по `kind`.

## Порядок (правила сайта: миграция → код)

1. Сгенерировать секрет: `openssl rand -hex 32` (или
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
2. Vercel → Environment Variables: `DISCORD_BRIDGE_SECRET` для Preview и
   Production (разные значения можно, но тогда и у бота два).
3. Миграция на **preview** → `npm test`, `npx tsc --noEmit`, `npm run lint`,
   `npm run build` → пуш в `dev` → проверка на preview (ниже).
4. Миграция на **проде** → мёрж в `master`.
5. На VPS бота в `/home/deploy/bocampus/.env`:
   ```
   SITE_BRIDGE_URL=https://soucampus.online/api/discord/bridge
   SITE_BRIDGE_SECRET=<тот же секрет>
   ```
   и `docker compose up -d`. Всё, что накопилось в очереди бота, уйдёт само
   при следующем обходе (раз в 10 минут).

## Проверка на preview

- Без подписи: `curl -i -X POST <url>/api/discord/bridge -d '{}'` → 404.
- С подписью — скрипт у бота: `SITE_BRIDGE_URL=<preview url> SITE_BRIDGE_SECRET=<…> node scripts/bridge-ping.js`
  отправляет тестовый отзыв `review:pingtest01` → в `discord_inbox` строка
  pending и уведомление админу. Удалить её руками после проверки.

## Админка `/admin/discord` (сделать в сессии сайта)

Нужна, чтобы очередь не копилась невидимой. Минимум:

- Список `discord_inbox where status = 'pending'`, свежие сверху. Читает
  серверный компонент служебным ключом (за `getAdminUser`, как остальная
  админка; постороннему 404).
- **Черновик работы:** фото (`image_urls`), размер, тема, версия, цена,
  срок. Кнопка **«Open as new work»** → форма `/admin/portfolio` с
  предзаполнением: `sizeLabel/sizeX/sizeZ`, `priceLabel/priceAmount`,
  `deadlineLabel` из `deadlineDays` («~2 weeks»), `tag: "Order"`, галерея из
  `image_urls`, первое фото — обложка. Заголовок, summary и описание пишет
  владелец — бот даёт факты, не тексты.
- **Отзыв:** рейтинг, текст, имя. Кнопка **«Add to reviews»** → строка в
  `reviews` (`name` — из присланного, `role` и `flag` владелец выбирает,
  `review_text` — комментарий; slug из имени). Отзыв без текста — только
  рейтинг — на сайт не годится: показать, но кнопку не давать.
- **«Dismiss»** у обоих → `status = 'dismissed'`.
- Публикация → `status = 'published'`, `decided_at`, `decided_by`.
- Все записи — через `/api/admin/discord` (правило шлюза записи сайта).
