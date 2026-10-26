# Задачи владельца — то, что кодом не закрывается

Ждут твоих рук или третьей стороны. Закрытое — вниз в «Закрытые», с датой.

## 🔴 Открытые

1. **Настройки сервера перед тестами** (найдено при чистке 27.10; проверить —
   `/setup view`):
   - `/setup reviews #канал-отзывов` — сейчас из `.env` берётся ID **категории**
     «Orders Public», в категорию писать нельзя → отзывы никуда не попадут;
   - `/setup log_channel #log-channel` — без него нет лога событий и транскриптов
     в канале команды (клиенту транскрипт всё равно уходит в ЛС);
   - `/setup quotes` — сейчас категория «ticket-order» (от старого бота):
     переименовать в Discord или выбрать другую;
   - `/setup showcase_channel #🌸showcase` (ссылку — в Vercel, п. 7) и
     `/setup showcase_reactions emojis:…`;
   - по желанию `/setup links banner:https://…` → `/setup panel`.
2. **Тестовый сервер.** Отдельный пустой сервер для прогонов, чтобы не
   трогать настоящий SouCampus. Пригласить туда бота с правом Administrator
   (Developer Portal → OAuth2 → URL Generator → `bot` + `applications.commands`).
   ID сервера → `GUILD_ID` в `.env` **на VPS** (`/home/deploy/bocampus/.env`),
   потом `docker compose up -d` — команды появятся мгновенно.
3. **Второй аккаунт Discord** для роли клиента/фрилансера — без него
   половину `TEMP.md` не проверить.
4. **Developer Portal → Bot → Privileged Gateway Intents:** **Message
   Content — оставить ВКЛЮЧЁННЫМ** (с 26.10 на нём держатся транскрипты; если
   выключить, бот не сможет войти). **Server Members** и **Presence** можно
   выключить — код их не просит (необязательно).
5. **Swap 2 ГБ на VPS** (нужен root, `deploy` не может). Подушка на минуту,
   когда ClamAV сканера при обновлении сигнатур удваивает память
   (`docs/ROADMAP.md` → фаза 5). Сейчас swap нет совсем. В hPanel →
   Browser terminal:
   ```bash
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   swapon --show
   ```
   До запуска сканера не горит: сейчас занято ~0.9 ГБ из 4.
6. **Страница условий для Discord на сайте** — в той же сессии по сайту
   (текст: `docs/phase4/site/content/discord-terms-and-privacy.md`, вычитать
   места в «[…]»). После деплоя в Discord:
   `/setup links terms:https://soucampus.online/terms/discord privacy:https://soucampus.online/privacy#discord`
   и `/setup panel`. До этого панель ведёт на общие `/terms` и `/privacy`.
7. **Витрина:** в Discord `/setup showcase_channel #канал` → ссылку из ответа в
   Vercel как `DISCORD_SHOWCASE_WEBHOOK_URL` (вместе с остальным по
   `docs/phase4/site/README.md`).
8. **Фаза 4 — включить мост на сайт** (когда будет сессия по сайту):
   `docs/phase4/site/README.md` → «Порядок». Коротко: секрет → Vercel и
   `.env` на VPS (`SITE_BRIDGE_URL`, `SITE_BRIDGE_SECRET`); миграция preview →
   прод; файлы в сайт. До этого согласия клиентов копятся в очереди бота —
   ничего не теряется.
9. **Правила и анонсы** (код в `dev` с 27.10, на VPS — после деплоя):
   - `/setup color #F97316` — оранжевый сайта для всех карточек бота;
   - `/setup rules channel:#🌸rules image:https://…` — карточка правил
     (старое сообщение-эмбед в #rules удалить руками);
   - `/setup site_channel` четыре раза — kind Portfolio → #🌸portfolio,
     Premade builds → #🌸premade-builds, Free builds → #🌸free-builds,
     Announcements → #🌸announcements. Каждая ссылка из ответа → Vercel
     (`DISCORD_SHOWCASE_/PREMADE_/FREE_/ANNOUNCE_WEBHOOK_URL`) → Redeploy.
     Кнопки на сайте под премейд и фри — после сессии по сайту
     (`SITE-PROMPT.md`, дополнение 27.10 вечер);
   - вебхуки Captain Porto / Primo / Freebo удалить (их ссылки были в чате);
   - картинки закреплённых постов — ссылки Claude, или самому по
     `docs/CHANNEL-POSTS.md`.
10. ⚠️ **Не запускать бота локально (`npm start`)**, пока он работает на VPS:
   один токен — один процесс, иначе каждое нажатие выполнится дважды
   (`docs/DEPLOY.md`).

## 🟢 Закрытые

- 2026-10-27 — **Чистка тестовых каналов**: удалено 20 (`order-/quote-soucampus`,
  `discussion-…`, 5 `ticket-*` старого Python-бота — по подтверждению). Тикеты
  закрыты в базе; копия базы до чистки — `data/backups/pre-cleanup-2026-10-26.db`.
- 2026-10-27 — категории Help → «ticket-help», Application → «TICKET-APPLY».
- 2026-10-26 — **SSH-доступ к VPS** для деплоя: пользователь `deploy` (группа
  `docker`), ключ `~/.ssh/bocampus_vps` на этом ПК. Отозвать: удалить строку
  из `/home/deploy/.ssh/authorized_keys` или `deluser deploy`.
- 2026-10-26 — **Deploy key** «VPS 76.13.156.182 (read-only)» в репозитории
  на GitHub: сервер может только читать этот один репозиторий (решение
  владельца — вместо отправки кода с ПК). Отозвать: GitHub → репозиторий →
  Settings → Deploy keys.
- 2026-10-25 — ответы на вопросы по бюджету, Team Application и хостингу
  (`docs/ROADMAP.md` → «Решения владельца»).
