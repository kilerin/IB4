"""add indexes for shared web and mini app workloads

Revision ID: 20260617_0002
Revises: 20260617_0001
Create Date: 2026-06-17
"""

from alembic import op
from sqlalchemy import inspect

revision = "20260617_0002"
down_revision = "20260617_0001"
branch_labels = None
depends_on = None


INDEXES = [
    ("transaction", "ix_transaction_wallet_id", ["wallet_id"]),
    ("transaction", "ix_transaction_currency", ["currency"]),
    ("transaction", "ix_transaction_tx_hash", ["tx_hash"]),
    ("transaction", "ix_transaction_transaction_type", ["transaction_type"]),
    ("transaction", "ix_transaction_created_at", ["created_at"]),
    ("address_book", "ix_address_book_address", ["address"]),
]


def index_exists(table_name, index_name):
    inspector = inspect(op.get_bind())
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade():
    for table_name, index_name, columns in INDEXES:
        if not index_exists(table_name, index_name):
            op.create_index(index_name, table_name, columns)


def downgrade():
    for table_name, index_name, _columns in reversed(INDEXES):
        if index_exists(table_name, index_name):
            op.drop_index(index_name, table_name=table_name)
