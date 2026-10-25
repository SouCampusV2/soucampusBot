# Деплой — BoCampus на VPS

Как бот живёт 24/7. План и бюджет памяти — `ROADMAP.md` → фаза 5.

## Где

| | |
|---|---|
| Сервер | Hostinger KVM 1, Ubuntu 24.04, 4 ГБ, 1 ядро — IP `76.13.156.182` |
| Соседи | n8n + traefik, nginx сайта (`soucampus-web`), позже `souc-scanner` |
| Пользователь | `deploy` (группа `docker`), ключ `~/.ssh/bocampus_vps` на ПК владельца |
| Папка | `/home/deploy/bocampus` — клон репозитория |
| Данные | `/home/deploy/bocampus/data/bot.db` + `data/backups/` (в git не попадает) |
| Секреты | `/home/deploy/bocampus/.env`, права `600`, только на сервере |

Бот только сам ходит к Discord — портов не открывает, traefik не трогает.

## Как устроено

- `Dockerfile` — `node:22-bookworm-slim` (не Alpine: у `better-sqlite3` готовые
  бинарники под glibc), `npm ci --omit=dev`, процесс не от root.
- `docker-compose.yml` — `restart: unless-stopped`, `mem_limit: 256m` +
  `--max-old-space-size=192`, ротация логов 3×10 МБ, том `./data`.
- В `.env` на сервере сверх обычного: `BOT_UID=1001`, `BOT_GID=1001`
  (контейнер пишет в `./data` от имени `deploy`).
- Бэкап базы делает сам бот: 04:00 по `BOT_TIMEZONE`, `data/backups/`,
  хранит 14 последних (`src/jobs/backupJob.js`).

## Обновить бота

С ПК (Claude делает так же):

```bash
ssh -i ~/.ssh/bocampus_vps deploy@76.13.156.182 \
  'cd bocampus && git pull --ff-only && docker compose up -d --build && docker compose logs --tail=20'
```

Ветка на сервере — та, что проверяется (`dev` до прохода `TEMP.md`, потом
`master`): `git -C bocampus branch --show-current`.

## Посмотреть

```bash
docker compose logs -f --tail=50     # логи
docker stats --no-stream bocampus    # память
docker compose restart               # перезапуск
docker compose down                  # остановить
```

## ⚠️ Один токен — один запуск

Пока бот работает на VPS, **не запускать `npm start` локально с тем же
токеном**: оба процесса будут отвечать на одни и те же кнопки, и каждое
действие выполнится дважды (или второе упадёт). Для локальной разработки —
отдельное тестовое приложение с другим токеном, или сначала
`docker compose stop` на сервере.

## Восстановить из бэкапа

```bash
cd bocampus && docker compose stop
cp data/backups/bot-ГГГГ-ММ-ДД.db data/bot.db && rm -f data/bot.db-wal data/bot.db-shm
docker compose start
```
