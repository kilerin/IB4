# Инструкция по настройке Git-based деплоя

## Шаг 1: Настройка GitHub репозитория

### 1.1. Создайте репозиторий на GitHub (если еще не создан)

1. Перейдите на https://github.com
2. Создайте новый репозиторий (например, `IB4DECK`)
3. Скопируйте URL репозитория (например, `https://github.com/yourusername/IB4DECK.git`)

### 1.2. Настройте remote на локальной машине

```bash
cd /Users/n4/RLAB/IB4Tools/IB4DECK

# Добавьте remote (замените URL на ваш)
git remote add origin https://github.com/yourusername/IB4DECK.git

# Или если используете SSH:
# git remote add origin git@github.com:yourusername/IB4DECK.git

# Проверьте настройку
git remote -v
```

### 1.3. Отправьте код на GitHub

```bash
# Убедитесь, что все изменения закоммичены
git add .
git commit -m "Initial commit with deployment scripts"

# Отправьте на GitHub
git push -u origin main
```

---

## Шаг 2: Настройка на сервере

### 2.1. Подключитесь к серверу

```bash
ssh cryptoapp@178.130.42.24
```

### 2.2. Клонируйте репозиторий (если еще не клонирован)

```bash
cd /home/cryptoapp
git clone https://github.com/yourusername/IB4DECK.git
cd IB4DECK
```

**Или если репозиторий уже существует:**

```bash
cd /home/cryptoapp/IB4DECK
git remote add origin https://github.com/yourusername/IB4DECK.git
git pull origin main
```

### 2.3. Скопируйте скрипт деплоя на сервер

**Вариант A: Скопируйте файл `deploy.sh` на сервер:**

```bash
# На локальной машине
scp deploy.sh cryptoapp@178.130.42.24:/home/cryptoapp/IB4DECK/

# На сервере
ssh cryptoapp@178.130.42.24
cd /home/cryptoapp/IB4DECK
chmod +x deploy.sh
```

**Вариант B: Создайте файл напрямую на сервере:**

```bash
# На сервере
cat > /home/cryptoapp/IB4DECK/deploy.sh << 'EOF'
#!/bin/bash
set -e
PROJECT_DIR="/home/cryptoapp/IB4DECK"
cd "$PROJECT_DIR"
echo "🔄 Обновление кода из Git..."
git fetch origin
git pull origin main || echo "⚠️  Нет изменений"
echo "📦 Обновление зависимостей..."
docker compose exec -T web pip install -q -r requirements.txt 2>/dev/null || true
echo "🔄 Перезапуск веб-сервиса..."
docker compose restart web
sleep 3
echo "✅ Деплой завершен!"
docker compose ps
EOF

chmod +x /home/cryptoapp/IB4DECK/deploy.sh
```

### 2.4. Настройте .env файл на сервере (если еще не настроен)

```bash
# На сервере
cd /home/cryptoapp/IB4DECK
cp .env.example .env
nano .env  # Отредактируйте настройки
```

---

## Шаг 3: Настройка SSH ключей (для удобства)

### 3.1. Создайте SSH ключ на локальной машине (если еще нет)

```bash
# Проверьте, есть ли уже ключ
ls -la ~/.ssh/id_rsa.pub

# Если нет, создайте новый
ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
```

### 3.2. Скопируйте ключ на сервер

```bash
ssh-copy-id cryptoapp@178.130.42.24
```

Теперь вы сможете подключаться к серверу без ввода пароля.

---

## Шаг 4: Использование

### Быстрый деплой (рекомендуется)

На локальной машине:

```bash
cd /Users/n4/RLAB/IB4Tools/IB4DECK
./deploy-local.sh "Описание изменений"
```

Или просто:

```bash
./deploy-local.sh
```

### Ручной деплой

1. **На локальной машине:**
```bash
git add .
git commit -m "Описание изменений"
git push origin main
```

2. **На сервере:**
```bash
ssh cryptoapp@178.130.42.24
cd /home/cryptoapp/IB4DECK
./deploy.sh
```

---

## Устранение проблем

### Ошибка: "remote origin already exists"

```bash
git remote remove origin
git remote add origin <your-repo-url>
```

### Ошибка: "Permission denied (publickey)"

Настройте SSH ключи (см. Шаг 3).

### Ошибка: "Could not resolve hostname github.com"

Проверьте интернет-соединение на сервере.

### Ошибка: "docker compose: command not found"

```bash
# На сервере
sudo apt update
sudo apt install docker-compose-plugin
```

### Ошибка: "git pull failed"

Убедитесь, что на сервере нет локальных изменений:

```bash
# На сервере
cd /home/cryptoapp/IB4DECK
git status
git stash  # Сохранить локальные изменения
git pull origin main
```

---

## Дополнительные возможности

### Автоматический деплой при push (GitHub Actions)

Можно настроить автоматический деплой через GitHub Actions, но это требует дополнительной настройки.

### Алиас для быстрого деплоя

Добавьте в `~/.zshrc` или `~/.bashrc`:

```bash
alias deploy='cd /Users/n4/RLAB/IB4Tools/IB4DECK && ./deploy-local.sh'
```

Теперь можно просто выполнять `deploy` из любой директории.
