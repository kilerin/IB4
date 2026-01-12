#!/bin/bash
# deploy.sh - Скрипт быстрого деплоя на сервере
# Разместите этот файл на сервере в директории проекта

set -e  # Остановка при ошибке

PROJECT_DIR="/home/cryptoapp/IB4DECK"
cd "$PROJECT_DIR"

echo "🔄 Обновление кода из Git..."
git fetch origin
git pull origin main || {
    echo "⚠️  Предупреждение: не удалось обновить код (возможно, нет изменений)"
}

echo "📦 Обновление зависимостей Python..."
docker compose exec -T web pip install -q -r requirements.txt 2>/dev/null || {
    echo "⚠️  Предупреждение: не удалось обновить зависимости (возможно, контейнер не запущен)"
}

echo "🔄 Перезапуск веб-сервиса..."
docker compose restart web || {
    echo "⚠️  Предупреждение: не удалось перезапустить сервис"
}

echo "⏳ Ожидание запуска (3 сек)..."
sleep 3

echo "🔍 Проверка статуса контейнеров..."
docker compose ps

echo ""
echo "✅ Деплой завершен!"
echo "🌐 Приложение доступно по адресу: http://178.130.42.24"
