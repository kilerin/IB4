"""add fixed cabinet columns

Revision ID: 20260617_0003
Revises: 20260617_0002
Create Date: 2026-06-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "20260617_0003"
down_revision = "20260617_0002"
branch_labels = None
depends_on = None


TABLES = ("wallet", "transaction", "reserve")


def column_exists(table_name, column_name):
    inspector = inspect(op.get_bind())
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def index_exists(table_name, index_name):
    inspector = inspect(op.get_bind())
    return any(index["name"] == index_name for index in inspector.get_indexes(table_name))


def upgrade():
    for table_name in TABLES:
        if not column_exists(table_name, "cabinet"):
            op.add_column(
                table_name,
                sa.Column(
                    "cabinet",
                    sa.String(length=50),
                    nullable=False,
                    server_default="main",
                ),
            )
        index_name = f"ix_{table_name}_cabinet"
        if not index_exists(table_name, index_name):
            op.create_index(index_name, table_name, ["cabinet"])


def downgrade():
    for table_name in reversed(TABLES):
        index_name = f"ix_{table_name}_cabinet"
        if index_exists(table_name, index_name):
            op.drop_index(index_name, table_name=table_name)
        if column_exists(table_name, "cabinet"):
            op.drop_column(table_name, "cabinet")
