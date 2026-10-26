# Промпт для сессии по сайту (SouCampus Web)

Скопировать целиком в новый чат Claude Code, открытый в репозитории сайта
(`Claude/FirstTry`). Собран 2026-10-27; если пакет `docs/phase4/site/` менялся
позже — сверить с его README.

**Для облачной сессии** (claude.ai/code): облако не видит этот компьютер.
Сначала скопировать папку `docs/phase4/site/` бота и `docs/PHASE4.md` в
репозиторий сайта (например в `docs/discord-bot-package/`), запушить, и в
промпте ниже заменить пути `C:\…\botds\…` на пути внутри репозитория сайта.

---

```
Задача: подключить на сайте связку с Discord-ботом BoCampus. Сторона бота готова и работает на VPS;
для сайта готов пакет файлов. Три части:
А. Discord → сайт: бот с согласия клиента присылает черновики работ и отзывы; сайт кладёт их
   в очередь discord_inbox, владелец публикует из админки.
Б. Сайт → Discord (витрина): владелец собирает пост о работе в админке — черновик, превью «как в
   Discord», Publish / Update / Remove. Сайт шлёт пост сам в вебхук канала витрины. Стиль поста —
   «сообщение»: «# Название ——», текст с эмодзи и пингом роли, список ссылок
   «- [текст](url) - **подпись**», до 4 больших картинок, своё имя/аватар автора. Реакции ставит бот.
В. Страницы условий: /terms/discord и раздел /privacy#discord.

Сначала прочитай:
- docs/RULES.md, docs/DESIGN.md и CLAUDE.md этого репозитория — правила обязательны (ветка dev,
  миграция → код, миграции сначала на preview, коммиты без соавторства ИИ, любая запись в базу
  только через свой обработчик /api/*).
- Дизайн связки: C:\Users\super\OneDrive\Рабочий стол\Programming\test\botds\docs\PHASE4.md
- Инструкция к пакету — ГЛАВНЫЙ документ задачи (порядок, правки в существующих файлах,
  спецификация админки): C:\Users\super\OneDrive\Рабочий стол\Programming\test\botds\docs\phase4\site\README.md

Пакет: C:\Users\super\OneDrive\Рабочий стол\Programming\test\botds\docs\phase4\site\
(пути внутри повторяют этот репозиторий):
  А: supabase/migrations/20261027120000_discord_inbox.sql, src/lib/discord-bridge.ts (+ .test.ts),
     src/app/api/discord/bridge/route.ts
  Б: supabase/migrations/20261027130000_discord_posts.sql, src/lib/discord-showcase.ts (+ .test.ts),
     src/app/api/admin/discord/showcase/route.ts, src/components/DiscordPreview.tsx
  В: content/discord-terms-and-privacy.md — текст страниц (английский, черновик)

Файлы в этом репозитории НЕ запускались. Логика библиотек проверена отдельно (Node с отбрасыванием
типов), формат поста витрины — на настоящем Discord (временный вебхук: публикация/правка/удаление
прошли). Если имена функций сайта не сходятся (upload-limits, notifications, rate-limit,
supabase-admin, admin) — правь под сайт. НЕ меняй:
- формат подписи части А: HMAC-SHA256 hex от "<timestamp>.<сырое тело>", заголовки
  x-bocampus-timestamp / x-bocampus-signature, окно 5 минут — его держит общий с ботом тестовый вектор;
- форму сообщения части Б (Components V2: flags 32768, блоки текста + галерея, запросы с
  ?wait=true&with_components=true) — она проверена на живом Discord.

Что сделать:
0. Страницы условий (В): /terms/discord — новая страница «Ordering through Discord» в стиле /terms;
   в /privacy — раздел id="discord" «Our Discord bot». Текст — из content/discord-terms-and-privacy.md.
   Места в «[…]» НЕ выдумывай — оставь пометку и вынеси вопросом владельцу в отчёт. Новая страница —
   в sitemap и ссылкой из /terms.
1. Перенести все файлы пакета.
2. rate-limit.ts: "discord-bridge": { limit: 60, windowSeconds: HOUR }.
   notification-shape.ts: в NotificationKind добавить "discord_inbox" (+ иконка/текст, если
   колокол рисует их по kind).
3. Админка /admin/discord, две вкладки — точная спецификация в README пакета:
   - Showcase: список постов; «New post from a work» (draftFromProject); редактор слева +
     DiscordPreview справа с живым обновлением (заголовок + черта, текст, ссылки списком,
     картинки до 4, пинг none/here/everyone/роль по ID, имя и аватар автора, кнопки по желанию);
     Save draft / Publish / Update in Discord / Remove from Discord / Delete; ошибки checkPost под
     формой; без DISCORD_SHOWCASE_WEBHOOK_URL — подсказка «/setup showcase_channel в Discord» и
     неактивные кнопки. На странице работы в /admin/portfolio — кнопка «Post to Discord».
   - Inbox: pending из discord_inbox; черновик работы → «Open as new work» (форма /admin/portfolio
     с предзаполнением); отзыв → «Add to reviews»; «Dismiss».
   Записи Inbox — через новый /api/admin/discord; Showcase — через /api/admin/discord/showcase из
   пакета. За getAdminUser, постороннему 404. Ссылка в навигации админки.
   DiscordPreview — осознанное отступление от DESIGN.md (цвета Discord), это записано в комментарии
   файла; остальной UI страницы — по DESIGN.md.
4. Тесты (vitest) по образцу соседних; пакетные тесты — перенести и прогнать.
5. npm test, npx tsc --noEmit, npm run lint, npm run build. Упавшее не заметать.
6. Документы: ARCHITECTURE.md (новые пути записи + карта безопасности: вход от бота по подписи,
   вебхук как ограниченное право), STRUCTURE.md (discord_inbox, discord_posts), CHANGELOG.md,
   CLAUDE.md, OWNER-TASKS.md.
7. Коммит в dev, пуш. В master НЕ мёржить, миграции на прод НЕ прогонять — это владелец.

Шаги владельца — записать в OWNER-TASKS.md и вывести в конце:
a) Секрет моста: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
b) В Discord: /setup showcase_channel #канал → ссылка из ответа (видна только тебе);
   /setup showcase_reactions emojis:… — реакции под постами.
c) Vercel → Environment Variables (Preview и Production): DISCORD_BRIDGE_SECRET = секрет из (a),
   DISCORD_SHOWCASE_WEBHOOK_URL = ссылка из (b).
d) Обе миграции на preview → проверка на preview:
   - часть А из папки бота: SITE_BRIDGE_URL=<preview>/api/discord/bridge SITE_BRIDGE_SECRET=<секрет>
     node scripts/bridge-ping.js → 200 и строка review:pingtest01 в Inbox (потом удалить);
   - часть Б: собрать пост из любой работы → Publish → пост в Discord (бот ставит реакции) →
     Update → Remove. Для проверки можно временно указать тестовый канал в /setup showcase_channel.
   Потом миграции на прод.
e) Мёрж dev → master.
f) На VPS бота в /home/deploy/bocampus/.env: SITE_BRIDGE_URL=https://soucampus.online/api/discord/bridge
   и SITE_BRIDGE_SECRET=<секрет>, затем docker compose up -d. Накопленные заявки уйдут сами.
g) В Discord: /setup links terms:https://soucampus.online/terms/discord
   privacy:https://soucampus.online/privacy#discord → /setup panel.

Если что-то требует правки на стороне бота — не правь бота отсюда, запиши в отчёт для владельца.
```

---

## Дополнение 2026-10-27: анонсы с оранжевой плашкой

Отдельный короткий промпт — можно дать в той же сессии по сайту или в своей.

```
Задача: объявления из /admin/announce должны приходить в Discord с цветной плашкой слева
(оранжевый сайта #F97316), а не обычным текстом.

Сейчас src/lib/discord-announce.ts шлёт { content: "## title\ntext\nlink\n@ping" }. Сделать:
- announcementPayload → { content: пинг или undefined, embeds: [{ title, description: text,
  url: полная ссылка (если есть), color: 0xF97316 }], allowed_mentions как сейчас, username,
  avatar_url }. Пинг остаётся в content: внутри эмбеда @everyone не срабатывает.
- Пределы Discord: title ≤ 256, description ≤ 4096 (сейчас MAX_BODY 1000 — оставить).
- Обновить src/lib/discord-announce.test.ts (формат проверяется без сети) и превью в
  AnnounceForm, если оно рисует сообщение.
- Вебхук теперь выдаёт бот: /setup announcements_channel #канал → ссылка в Vercel как
  DISCORD_ANNOUNCE_WEBHOOK_URL. Он создан приложением, поэтому getDiscordBotIdentity может
  брать подпись прямо из него (а не из вебхука витрины).
Правила репозитория (docs/RULES.md, ветка dev, коммиты без соавторства ИИ) — как обычно.
```
