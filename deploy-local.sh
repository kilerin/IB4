#!/bin/bash
# deploy-local.sh - Скрипт для локального деплоя
# Использование: ./deploy-local.sh [commit message]

set -e

# Параметры подключения к серверу
SERVER_USER="cryptoapp"
SERVER_HOST="178.130.42.24"
SERVER_PATH="/home/cryptoapp/IB4DECK"

# Сообщение коммита
COMMIT_MSG="${1:-Update $(date +'%Y-%m-%d %H:%M:%S')}"

echo "📝 Добавление изменений в Git..."
git add .

echo "💾 Создание коммита..."
git commit -m "$COMMIT_MSG" || {
    echo "⚠️  Нет изменений для коммита"
}

echo "📤 Отправка изменений на GitHub..."
git push origin main || {
    echo "❌ Ошибка: не удалось отправить изменения на GitHub"
    echo "💡 Убедитесь, что удаленный репозиторий настроен:"
    echo "   git remote add origin <your-repo-url>"
    exit 1
}

echo "🚀 Запуск деплоя на сервере..."
ssh ${SERVER_USER}@${SERVER_HOST} "cd ${SERVER_PATH} && ./deploy.sh" || {
    echo "❌ Ошибка: не удалось подключиться к серверу или выполнить деплой"
    echo "💡 Убедитесь, что:"
    echo "   1. SSH ключ настроен для подключения к серверу"
    echo "   2. Файл deploy.sh существует на сервере в ${SERVER_PATH}"
    echo "   3. Файл deploy.sh имеет права на выполнение: chmod +x deploy.sh"
    exit 1
}

echo ""
echo "✅ Деплой успешно завершен!"
