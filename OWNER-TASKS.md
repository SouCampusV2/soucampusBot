# Задачи владельца — то, что кодом не закрывается

Ждут твоих рук или третьей стороны. Закрытое — вниз в «Закрытые», с датой.

## 🔴 Открытые

1. **Тестовый сервер.** Отдельный пустой сервер для прогонов, чтобы не
   трогать настоящий SouCampus. Пригласить туда бота с правом Administrator
   (Developer Portal → OAuth2 → URL Generator → `bot` + `applications.commands`).
   ID сервера → `GUILD_ID` в `.env` (команды появятся мгновенно).
2. **Второй аккаунт Discord** для роли клиента/фрилансера — без него
   половину `TEMP.md` не проверить.
3. **Developer Portal → Bot → Privileged Gateway Intents** — выключить
   **Server Members** и **Message Content** (необязательно, но правильно).
   Зачем: это «расширенные права» бота — видеть весь список участников и
   читать текст всех сообщений. С 25.10 код их не просит, а включённые
   галочки — доступ, которым никто не пользуется: меньше прав — меньше вреда,
   если токен когда-нибудь утечёт. И второе: когда бот будет больше чем на
   100 серверах, Discord заставит обосновывать каждую включённую галочку.
   Проверить, что после выключения всё работает, — `TEMP.md` § 5.
4. **Фаза 5: SSH-доступ к VPS для Claude.** Ключ уже создан на этом
   компьютере 2026-10-26: `~/.ssh/bocampus_vps` (приватный — никуда не
   отправлять), публичный:
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHG/w6LJu8DUL2yhHky5tzZVNmQosg99iUP05ukuDqgG bocampus-deploy@SouCampus
   ```
   Отдельный пользователь `deploy`, не root: так видно, что делал бот-деплой,
   и доступ отзывается одной строкой. В hPanel → VPS → **Browser terminal**
   (или своим SSH под root):
   ```bash
   adduser --disabled-password --gecos "" deploy
   mkdir -p /home/deploy/.ssh
   echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHG/w6LJu8DUL2yhHky5tzZVNmQosg99iUP05ukuDqgG bocampus-deploy@SouCampus" >> /home/deploy/.ssh/authorized_keys
   chown -R deploy:deploy /home/deploy/.ssh
   chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
   # если Docker уже стоит (n8n в нём?) — дать deploy запускать контейнеры:
   getent group docker && usermod -aG docker deploy
   ```
   Потом прислать **IP сервера** — больше ничего: ни пароля, ни ключей.
   ⚠️ Группа `docker` по силе почти равна root — это цена того, что бот
   деплоится без пароля. Отозвать доступ: удалить строку из
   `/home/deploy/.ssh/authorized_keys` (или `deluser deploy`).
   Если Docker не установлен — сказать, установка один раз нужна под root.

## 🟢 Закрытые

- 2026-10-25 — ответы на вопросы по бюджету, Team Application и хостингу
  (`docs/ROADMAP.md` → «Решения владельца»).
