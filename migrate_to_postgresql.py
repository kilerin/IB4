#!/usr/bin/env python3
"""
Скрипт для миграции данных из SQLite в PostgreSQL
Использование:
    python migrate_to_postgresql.py
"""

import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Загружаем переменные окружения
load_dotenv()

# Проверяем наличие SQLite базы
sqlite_path = 'instance/crypto_deck.db'
if not os.path.exists(sqlite_path):
    print(f"❌ SQLite база данных не найдена: {sqlite_path}")
    print("Убедитесь, что файл существует в директории instance/")
    sys.exit(1)

# SQLite источник
print("📂 Подключение к SQLite...")
sqlite_engine = create_engine(f'sqlite:///{sqlite_path}')
sqlite_session = sessionmaker(bind=sqlite_engine)()

# PostgreSQL назначение
pg_url = os.getenv('DATABASE_URL')
if not pg_url:
    print("❌ DATABASE_URL не установлена в .env файле")
    print("Пример: DATABASE_URL=postgresql://user:password@localhost:5432/dbname")
    sys.exit(1)

print("📂 Подключение к PostgreSQL...")
pg_engine = create_engine(pg_url)
pg_session = sessionmaker(bind=pg_engine)()

# Импорт моделей из app.py
print("📦 Импорт моделей...")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import db, Wallet, Transaction

# Создать таблицы в PostgreSQL
print("🔨 Создание таблиц в PostgreSQL...")
with pg_engine.connect() as conn:
    db.metadata.create_all(conn)

# Подсчет записей
print("\n📊 Подсчет записей в SQLite...")
wallet_count = sqlite_session.query(Wallet).count()
tx_count = sqlite_session.query(Transaction).count()
print(f"   Кошельков: {wallet_count}")
print(f"   Транзакций: {tx_count}")

if wallet_count == 0 and tx_count == 0:
    print("\n⚠️  База данных SQLite пуста. Миграция не требуется.")
    sys.exit(0)

# Подтверждение
response = input(f"\n⚠️  Вы уверены, что хотите мигрировать {wallet_count} кошельков и {tx_count} транзакций? (yes/no): ")
if response.lower() != 'yes':
    print("❌ Миграция отменена")
    sys.exit(0)

# Копирование кошельков
print("\n📤 Миграция кошельков...")
wallets = sqlite_session.query(Wallet).all()
migrated_wallets = 0
for wallet in wallets:
    try:
        pg_session.merge(wallet)
        migrated_wallets += 1
        if migrated_wallets % 10 == 0:
            print(f"   Мигрировано кошельков: {migrated_wallets}/{wallet_count}")
    except Exception as e:
        print(f"   ⚠️  Ошибка при миграции кошелька {wallet.id}: {e}")

pg_session.commit()
print(f"✅ Мигрировано кошельков: {migrated_wallets}/{wallet_count}")

# Копирование транзакций
print("\n📤 Миграция транзакций...")
transactions = sqlite_session.query(Transaction).all()
migrated_txs = 0
for tx in transactions:
    try:
        pg_session.merge(tx)
        migrated_txs += 1
        if migrated_txs % 100 == 0:
            print(f"   Мигрировано транзакций: {migrated_txs}/{tx_count}")
    except Exception as e:
        print(f"   ⚠️  Ошибка при миграции транзакции {tx.id}: {e}")

pg_session.commit()
print(f"✅ Мигрировано транзакций: {migrated_txs}/{tx_count}")

# Проверка
print("\n🔍 Проверка миграции...")
pg_wallet_count = pg_session.query(Wallet).count()
pg_tx_count = pg_session.query(Transaction).count()

print(f"\n📊 Результаты:")
print(f"   SQLite - Кошельков: {wallet_count}, Транзакций: {tx_count}")
print(f"   PostgreSQL - Кошельков: {pg_wallet_count}, Транзакций: {pg_tx_count}")

if wallet_count == pg_wallet_count and tx_count == pg_tx_count:
    print("\n✅ Миграция успешно завершена!")
else:
    print("\n⚠️  Внимание: количество записей не совпадает!")
    print("   Проверьте логи выше на наличие ошибок")

sqlite_session.close()
pg_session.close()

