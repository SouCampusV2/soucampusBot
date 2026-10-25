# Задачи владельца — то, что кодом не закрывается

Ждут твоих рук или третьей стороны. Закрытое — вниз в «Закрытые», с датой.

## 🔴 Открытые

1. **Тестовый сервер.** Отдельный пустой сервер для прогонов, чтобы не
   трогать настоящий SouCampus. Пригласить туда бота с правом Administrator
   (Developer Portal → OAuth2 → URL Generator → `bot` + `applications.commands`).
   ID сервера → `GUILD_ID` в `.env` **на VPS** (`/home/deploy/bocampus/.env`),
   потом `docker compose up -d` — команды появятся мгновенно.
2. **Второй аккаунт Discord** для роли клиента/фрилансера — без него
   половину `TEMP.md` не проверить.
3. **Developer Portal → Bot → Privileged Gateway Intents:** **Message
   Content — оставить ВКЛЮЧЁННЫМ** (с 26.10 на нём держатся транскрипты; если
   выключить, бот не сможет войти). **Server Members** и **Presence** можно
   выключить — код их не просит (необязательно).
4. **Swap 2 ГБ на VPS** (нужен root, `deploy` не может). Подушка на минуту,
   когда ClamAV сканера при обновлении сигнатур удваивает память
   (`docs/ROADMAP.md` → фаза 5). Сейчас swap нет совсем. В hPanel →
   Browser terminal:
   ```bash
   fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
   echo '/swapfile none swap sw 0 0' >> /etc/fstab
   swapon --show
   ```
   До запуска сканера не горит: сейчас занято ~0.9 ГБ из 4.
5. **Фаза 4 — включить мост на сайт** (когда будет сессия по сайту):
   `docs/phase4/site/README.md` → «Порядок». Коротко: секрет → Vercel и
   `.env` на VPS (`SITE_BRIDGE_URL`, `SITE_BRIDGE_SECRET`); миграция preview →
   прод; файлы в сайт. До этого согласия клиентов копятся в очереди бота —
   ничего не теряется.
6. ⚠️ **Не запускать бота локально (`npm start`)**, пока он работает на VPS:
   один токен — один процесс, иначе каждое нажатие выполнится дважды
   (`docs/DEPLOY.md`).

## 🟢 Закрытые

- 2026-10-26 — **SSH-доступ к VPS** для деплоя: пользователь `deploy` (группа
  `docker`), ключ `~/.ssh/bocampus_vps` на этом ПК. Отозвать: удалить строку
  из `/home/deploy/.ssh/authorized_keys` или `deluser deploy`.
- 2026-10-26 — **Deploy key** «VPS 76.13.156.182 (read-only)» в репозитории
  на GitHub: сервер может только читать этот один репозиторий (решение
  владельца — вместо отправки кода с ПК). Отозвать: GitHub → репозиторий →
  Settings → Deploy keys.
- 2026-10-25 — ответы на вопросы по бюджету, Team Application и хостингу
  (`docs/ROADMAP.md` → «Решения владельца»).
