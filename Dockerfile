FROM python:3.11-slim

WORKDIR /app

# psycopg2-binary ставится из wheel — gcc и postgresql-client не нужны
# (раньше apt тянул ~70+ MB и часто падал при нехватке места на диске)

# Копирование requirements и установка зависимостей
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копирование приложения
COPY . .

# Создание директории для instance (база данных SQLite будет здесь, если нужна для миграции)
RUN mkdir -p instance

# Переменные окружения по умолчанию
ENV FLASK_APP=app.py
ENV PYTHONUNBUFFERED=1

# Открытие порта
EXPOSE 5001

# Запуск через Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--workers", "3", "--timeout", "120", "--access-logfile", "-", "--error-logfile", "-", "app:app"]
