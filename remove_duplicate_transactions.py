#!/usr/bin/env python3
"""
Скрипт для удаления дублей транзакций из базы данных
Удаляет дубли по комбинации (tx_hash, wallet_id), оставляя самую старую запись
"""

import sys
sys.path.insert(0, '/home/cryptoapp/IB4DECK')

from app import app, db, Transaction
from collections import defaultdict

def remove_duplicates():
    """Удаляет дублирующиеся транзакции"""
    with app.app_context():
        print("=== Удаление дублей транзакций ===\n")
        
        # Найти дубли по комбинации (tx_hash, wallet_id)
        duplicates = defaultdict(list)
        
        all_transactions = Transaction.query.filter(
            Transaction.tx_hash.isnot(None),
            Transaction.tx_hash != ''
        ).all()
        
        print(f"Всего транзакций с tx_hash: {len(all_transactions)}")
        
        # Группируем по (tx_hash, wallet_id)
        for tx in all_transactions:
            key = (tx.tx_hash, tx.wallet_id)
            duplicates[key].append(tx)
        
        # Находим дубли (где больше одной транзакции с одинаковым ключом)
        duplicate_groups = {k: v for k, v in duplicates.items() if len(v) > 1}
        
        print(f"Найдено {len(duplicate_groups)} групп дублей\n")
        
        total_deleted = 0
        for (tx_hash, wallet_id), transactions in duplicate_groups.items():
            # Сортируем по id (самая старая первая)
            transactions.sort(key=lambda x: x.id)
            
            # Оставляем первую (самую старую), удаляем остальные
            to_delete = transactions[1:]
            print(f"tx_hash: {tx_hash[:20]}..., wallet_id: {wallet_id} - найдено {len(transactions)} дублей, удаляем {len(to_delete)}")
            
            for tx in to_delete:
                db.session.delete(tx)
                total_deleted += 1
        
        if total_deleted > 0:
            db.session.commit()
            print(f"\n✅ Удалено {total_deleted} дублей")
        else:
            print("\n✅ Дублей не найдено")
        
        # Показываем статистику
        total_transactions = Transaction.query.count()
        print(f"\n📊 Всего транзакций в базе: {total_transactions}")

if __name__ == '__main__':
    remove_duplicates()
