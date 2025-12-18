# IB4 CRYPTO DECK

Веб-сервис для управления криптокошельками, отслеживания транзакций и проверки по AML.

## Возможности

- **Dashboard** - Обзорная панель (в разработке)
- **Wallets** - Управление кошельками и просмотр транзакций
  - Добавление новых кошельков с проверкой адресов
  - Обновление балансов
  - Скрытие/показ кошельков
  - Сортировка кошельков перетаскиванием
  - Отображение общего баланса USDT/TRX
  - AML проверки кошельков
- **Address Book** - Адресная книга (в разработке)
- **AML Check** - Проверка по AML (в разработке)

## Требования

- Python 3.7+
- pip

## Установка и запуск

### macOS/Linux

```bash
./run.sh
```

### Windows

```bash
run.bat
```

Или вручную:

```bash
# Создать виртуальное окружение
python -m venv venv

# Активировать виртуальное окружение
# macOS/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# Установить зависимости
pip install -r requirements.txt

# Запустить приложение
python app.py
```

Приложение будет доступно по адресу: http://localhost:5000

## Структура проекта

```
IB4DECK/
├── app.py                 # Основное Flask приложение
├── requirements.txt        # Зависимости Python
├── run.sh                 # Скрипт запуска (macOS/Linux)
├── run.bat                # Скрипт запуска (Windows)
├── crypto_deck.db         # База данных SQLite (создается автоматически)
├── templates/             # HTML шаблоны
│   ├── base.html
│   ├── dashboard.html
│   ├── wallets.html
│   ├── address_book.html
│   └── aml_check.html
├── static/                 # Статические файлы
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── wallets.js
│   └── ico/               # Иконки валют
│       ├── USDT.svg
│       └── TRX.svg
└── aml/                   # Документация AML API
```

## API Endpoints

### Wallets

- `GET /api/wallets` - Получить список кошельков
- `POST /api/wallets` - Добавить новый кошелек
- `PUT /api/wallets/<id>` - Обновить кошелек
- `DELETE /api/wallets/<id>` - Удалить кошелек
- `POST /api/wallets/reorder` - Изменить порядок кошельков
- `POST /api/wallets/refresh-balances` - Обновить балансы
- `POST /api/wallets/<id>/aml-check` - Проверить AML

### Transactions

- `GET /api/transactions` - Получить список транзакций
- `POST /api/transactions/refresh` - Обновить транзакции

## Особенности

- Минималистичный дизайн в стиле Cursor IDE
- Drag-and-drop сортировка кошельков
- Фильтрация транзакций (скрытие малых сумм, TRX)
- Автоматическое форматирование сумм и адресов
- Копирование адресов в буфер обмена
- Валидация TRX адресов при добавлении

## Разработка

Приложение использует:
- Flask - веб-фреймворк
- SQLAlchemy - ORM для работы с БД
- SQLite - база данных
- SortableJS - для drag-and-drop функционала

## Лицензия

Внутренний проект IB4Tools


