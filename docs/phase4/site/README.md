# Пакет для сайта — связка с Discord-ботом

Файлы этой папки повторяют пути в репозитории сайта (`Claude/FirstTry`).
**Написаны, но в репозитории сайта не запускались** — их нужно перенести и
прогнать проверки сайта. В сайт не коммитил намеренно: у него свои правила
(ветка `dev`, миграции на проде прогоняет владелец, деплой Vercel).

Зачем и как устроено — `../../PHASE4.md`. Две независимые части:

- **А. Discord → сайт:** черновики работ и отзывы от бота (с согласия клиента)
  в очередь `discord_inbox`, публикует владелец.
- **Б. Сайт → Discord (витрина):** владелец собирает пост о работе в админке —
  черновик, превью «как в Discord», публикация, правка, удаление. Сайт шлёт
  пост сам в вебхук канала витрины. Бот ничего не опрашивает.

## Что перенести

| Файл здесь | Куда в сайте | Что это |
|---|---|---|
| `supabase/migrations/20261027120000_discord_inbox.sql` | то же | таблица очереди + вид уведомления `discord_inbox` |
| `src/lib/discord-bridge.ts` | то же | подпись, проверка тела, скачивание фото с защитой от SSRF |
| `src/lib/discord-bridge.test.ts` | то же | общий с ботом тестовый вектор подписи |
| `src/app/api/discord/bridge/route.ts` | то же | вход для бота |
| `supabase/migrations/20261027130000_discord_posts.sql` | то же | **Б:** посты витрины (черновик / опубликован + id сообщения) |
| `src/lib/discord-showcase.ts` | то же | **Б:** пост из работы, проверка пределов Discord, публикация / правка / удаление через вебхук |
| `src/lib/discord-showcase.test.ts` | то же | **Б:** тесты |
| `src/app/api/admin/discord/showcase/route.ts` | то же | **Б:** save / publish / update / unpublish / delete |
| `src/components/DiscordPreview.tsx` | то же | **Б:** превью поста в стиле Discord |

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
2. Vercel → Environment Variables:
   - `DISCORD_BRIDGE_SECRET` (часть А) для Preview и Production;
   - `DISCORD_SHOWCASE_WEBHOOK_URL` (часть Б): в Discord выполнить
     `/setup showcase_channel #канал` — бот ответит ссылкой (видна только тебе).
     Для проверки на Preview укажи в `/setup showcase_channel` тестовый канал,
     потом верни боевой (ссылка у каждого канала своя).
3. Обе миграции (`…120000_discord_inbox`, `…130000_discord_posts`) на **preview** → `npm test`, `npx tsc --noEmit`, `npm run lint`,
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

## Страницы условий для Discord (сделать в сессии сайта)

Текст — `content/discord-terms-and-privacy.md` (английский, черновик; места
в «[…]» решает владелец — не выдумывать, спросить или оставить пометку).

- **`/terms/discord`** — новая страница «Ordering through Discord», в стиле
  `/terms` (секции с якорями, тот же каркас). Ссылка на неё из `/terms` и из
  футера/раздела Legal, если он есть.
- **`/privacy`** — новый раздел с `id="discord"` «Our Discord bot».
- В sitemap — новая страница.
- Бот ссылается на них с панели тикетов после `/setup links` (шаг владельца).

## Админка `/admin/discord` (сделать в сессии сайта)

Две вкладки: **Inbox** (часть А) и **Showcase** (часть Б).

### Showcase — посты в Discord

Стиль — **сообщение**, как у студий-примеров владельца (Coastline: «New York
City ——»), не эмбед в рамке. Формат проверен на настоящем Discord 27.10
(временный вебхук: публикация, правка, удаление — 200/200/204).

- Список постов (`discord_posts`, свежие сверху): черновики и опубликованные.
- **«New post from a work»**: выбрать работу → `draftFromProject` (заголовок с
  чертой, описание, мелкой строкой размер и срок, ссылки «See it on our
  website» / «Get this map» или «Download it free» / «Order your own build -
  **Let's create something together!**», обложка + галерея до 4 картинок).
- **Редактор слева, `DiscordPreview` справа**, превью обновляется при вводе:
  - заголовок + галочка «черта после заголовка»;
  - текст (Discord-markdown; подсказка: эмодзи сервера вставлять как
    `<:name:id>`, мелкий текст — строка с `-# `);
  - **ссылки списком**: текст, адрес, жирная подпись — добавить / убрать /
    поменять порядок;
  - картинки: выбрать из обложки и галереи работы или вставить https-ссылку,
    до 4, порядок;
  - пинг: none / @here / @everyone / **роль** (поле «Role ID» с подсказкой,
    как его скопировать; запомнить последний в localStorage);
  - **от чьего имени**: имя и аватар (по умолчанию «SouCampus» и логотип
    сайта, если есть в public/); имя без слова «Discord»;
  - кнопки-ссылки под постом — по желанию, свёрнуто;
  - ошибки `checkPost` под формой, Publish неактивна, пока есть ошибка.
- Реакции под постом ставит **бот** (`/setup showcase_reactions`). В превью
  их можно показать полем «Preview reactions» (только для вида).
- Кнопки: **Save draft**, **Publish**, **Update in Discord**, **Remove from
  Discord** (возвращает в черновики), **Delete** (только черновик). При Update
  имя и аватар не меняются — так работает Discord, предупредить в форме.
- На странице работы в `/admin/portfolio` — **«Post to Discord»** → новый
  черновик из этой работы.
- Нет `DISCORD_SHOWCASE_WEBHOOK_URL` — подсказка «/setup showcase_channel» и
  неактивные кнопки публикации.

### Inbox — пришло из Discord

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
