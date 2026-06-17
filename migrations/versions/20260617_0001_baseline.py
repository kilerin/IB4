"""baseline existing ib4deck schema

Revision ID: 20260617_0001
Revises:
Create Date: 2026-06-17
"""

from alembic import op
import sqlalchemy as sa

revision = "20260617_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "wallet",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("address", sa.String(length=200), nullable=False),
        sa.Column("balance_usdt", sa.Float(), nullable=True),
        sa.Column("balance_trx", sa.Float(), nullable=True),
        sa.Column("aml_status", sa.String(length=50), nullable=True),
        sa.Column("aml_checked_at", sa.DateTime(), nullable=True),
        sa.Column("aml_score", sa.Float(), nullable=True),
        sa.Column("aml_risk_level", sa.String(length=20), nullable=True),
        sa.Column("aml_checking", sa.Boolean(), nullable=True),
        sa.Column("balance_changed", sa.Boolean(), nullable=True),
        sa.Column("is_hidden", sa.Boolean(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=True),
        sa.Column("color", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("address"),
    )
    op.create_table(
        "reserve",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("comment", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "address_book",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("customer", sa.String(length=200), nullable=False),
        sa.Column("address", sa.String(length=200), nullable=False),
        sa.Column("aml_status", sa.String(length=50), nullable=True),
        sa.Column("manager", sa.String(length=100), nullable=True),
        sa.Column("date_added", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "aml_check",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("address", sa.String(length=200), nullable=False),
        sa.Column("risk_level", sa.String(length=50), nullable=True),
        sa.Column("risk_score", sa.Float(), nullable=True),
        sa.Column("customer", sa.String(length=200), nullable=True),
        sa.Column("manager", sa.String(length=100), nullable=True),
        sa.Column("balance_usdt", sa.Float(), nullable=True),
        sa.Column("balance_trx", sa.Float(), nullable=True),
        sa.Column("checked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "transaction",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("wallet_id", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("type", sa.String(length=50), nullable=True),
        sa.Column("from_address", sa.String(length=200), nullable=True),
        sa.Column("to_address", sa.String(length=200), nullable=True),
        sa.Column("counterparty_name", sa.String(length=100), nullable=True),
        sa.Column("aml_status", sa.String(length=50), nullable=True),
        sa.Column("tx_hash", sa.String(length=200), nullable=True),
        sa.Column("comment", sa.String(length=500), nullable=True),
        sa.Column("transaction_type", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["wallet_id"], ["wallet.id"], ondelete="CASCADE"),
    )


def downgrade():
    op.drop_table("transaction")
    op.drop_table("aml_check")
    op.drop_table("address_book")
    op.drop_table("reserve")
    op.drop_table("wallet")
