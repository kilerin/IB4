# Инструкция по деплою IB4DECK

## Требования

- Ubuntu сервер с Docker и Docker Compose
- Минимум 2GB RAM
- 10GB свободного места на диске

## Быстрый старт

### 1. Установка Docker на Ubuntu

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
sudo apt install -y docker.io docker-compose-plugin

# Запуск Docker
sudo systemctl enable docker
sudo systemctl start docker

# Добавление пользователя в группу docker (чтобы не использовать sudo)
sudo usermod -aG docker $USER
# Выйдите и войдите снова для применения группы
```

### 2. Подготовка проекта на сервере

```bash
# Переход в домашнюю директорию
cd /home

# Клонирование проекта (или загрузка через scp/sftp)
git clone <your-repo-url> IB4DECK
cd IB4DECK

# Или загрузка архива:
# scp ib4deck.tar.gz user@server:/home/
# tar -xzf ib4deck.tar.gz
# cd IB4DECK
```

### 3. Настройка переменных окружения

```bash
# Создание .env файла из примера
cp .env.example .env

# Редактирование .env файла
nano .env
```

**Важно:** Измените пароли в `.env` файле:
- `POSTGRES_PASSWORD` - надежный пароль для PostgreSQL
- `SECRET_KEY` - случайная строка для Flask (можно сгенерировать: `python -c "import secrets; print(secrets.token_hex(32))"`)
- `APP_PASSWORD` - пароль для входа в приложение (по умолчанию: `admin123`)

Пример `.env` файла:
```env
POSTGRES_DB=crypto_deck
POSTGRES_USER=crypto_user
POSTGRES_PASSWORD=your_secure_db_password
SECRET_KEY=your_secret_key_here
APP_PASSWORD=your_app_password_here
```

### 4. Запуск приложения

```bash
# Запуск всех сервисов (PostgreSQL, Web, Nginx)
docker compose up -d --build

# Проверка статуса
docker compose ps

# Просмотр логов
docker compose logs -f web
```

Приложение будет доступно по адресу: `http://your-server-ip`

### 5. Миграция данных из SQLite (если есть существующая база)

Если у вас есть существующая SQLite база данных в `instance/crypto_deck.db`:

```bash
# Убедитесь, что .env файл настроен с правильным DATABASE_URL
# Запустите скрипт миграции
docker compose exec web python migrate_to_postgresql.py
```

## Управление приложением

### Просмотр логов

```bash
# Все сервисы
docker compose logs -f

# Только веб-приложение
docker compose logs -f web

# Только база данных
docker compose logs -f db

# Только Nginx
docker compose logs -f nginx
```

### Остановка/Запуск/Перезапуск

```bash
# Остановка
docker compose stop

# Запуск
docker compose start

# Перезапуск
docker compose restart

# Полная остановка и удаление контейнеров
docker compose down

# Остановка и удаление контейнеров + volumes (ОСТОРОЖНО: удалит данные!)
docker compose down -v
```

### Обновление приложения

```bash
# Получить последние изменения
git pull

# Пересобрать и перезапустить
docker compose up -d --build

# Применить миграции БД (если нужно)
docker compose exec web python -c "from app import db, app; app.app_context().push(); db.create_all()"
```

## Резервное копирование

### Создание бэкапа PostgreSQL

```bash
# Создать директорию для бэкапов
mkdir -p backups

# Создать бэкап
docker compose exec db pg_dump -U crypto_user crypto_deck > backups/backup_$(date +%Y%m%d_%H%M%S).sql

# Или с использованием переменных из .env
docker compose exec -T db pg_dump -U ${POSTGRES_USER} ${POSTGRES_DB} > backups/backup_$(date +%Y%m%d_%H%M%S).sql
```

### Восстановление из бэкапа

```bash
# Восстановить из бэкапа
docker compose exec -T db psql -U crypto_user crypto_deck < backups/backup_20240101_120000.sql
```

### Автоматическое резервное копирование (cron)

Создайте скрипт `/home/IB4DECK/backup.sh`:

```bash
#!/bin/bash
cd /home/IB4DECK
docker compose exec -T db pg_dump -U crypto_user crypto_deck > backups/backup_$(date +%Y%m%d_%H%M%S).sql
# Удалить бэкапы старше 30 дней
find backups/ -name "backup_*.sql" -mtime +30 -delete
```

Сделайте его исполняемым и добавьте в crontab:

```bash
chmod +x backup.sh
crontab -e
# Добавьте строку для ежедневного бэкапа в 2:00 ночи:
0 2 * * * /home/IB4DECK/backup.sh
```

## Настройка SSL (HTTPS)

### Использование Let's Encrypt (Certbot)

```bash
# Установка Certbot
sudo apt install certbot python3-certbot-nginx -y

# Остановка Nginx контейнера (временно)
docker compose stop nginx

# Получение сертификата
sudo certbot certonly --standalone -d your-domain.com

# Копирование сертификатов в директорию проекта
sudo mkdir -p ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ssl/
sudo chown -R $USER:$USER ssl/

# Раскомментируйте секцию HTTPS в nginx.conf
nano nginx.conf

# Запуск Nginx обратно
docker compose start nginx
```

## Мониторинг

### Проверка использования ресурсов

```bash
# Использование ресурсов контейнерами
docker stats

# Использование диска
docker system df
```

### Проверка подключения к базе данных

```bash
# Подключение к PostgreSQL
docker compose exec db psql -U crypto_user -d crypto_deck

# Выполнение SQL запросов
docker compose exec db psql -U crypto_user -d crypto_deck -c "SELECT COUNT(*) FROM wallet;"
```

## Устранение проблем

### Приложение не запускается

```bash
# Проверьте логи
docker compose logs web

# Проверьте статус контейнеров
docker compose ps

# Проверьте подключение к базе данных
docker compose exec web python -c "from app import db; print(db.engine.url)"
```

### База данных не подключается

```bash
# Проверьте переменные окружения
docker compose exec web env | grep DATABASE

# Проверьте доступность базы данных
docker compose exec web ping db
```

### Проблемы с правами доступа

```bash
# Проверьте права на файлы
ls -la

# Исправьте права (если нужно)
chmod -R 755 .
chown -R $USER:$USER .
```

## Масштабирование

Для увеличения производительности можно:

1. Увеличить количество воркеров Gunicorn в `Dockerfile`:
   ```dockerfile
   CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "5", ...]
   ```

2. Добавить больше контейнеров веб-приложения в `docker-compose.yml`:
   ```yaml
   web2:
     # ... копия конфигурации web
   ```

3. Использовать балансировщик нагрузки (например, добавить больше upstream серверов в nginx.conf)

