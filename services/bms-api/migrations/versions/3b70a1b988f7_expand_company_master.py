"""expand company master

Revision ID: 3b70a1b988f7
Revises: 98a9fff180f8
Create Date: 2026-07-30 17:09:36.536734

"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


# Revision identifiers used by Alembic.
revision: str = "3b70a1b988f7"
down_revision: Union[str, Sequence[str], None] = "98a9fff180f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Expand the companies table into Company Master V1.0."""

    # ------------------------------------------------------------------
    # Step 1: Add new columns as nullable.
    #
    # Existing company rows do not yet have values for company_uuid,
    # listing_status, or updated_at. They therefore cannot initially be
    # created as NOT NULL columns.
    # ------------------------------------------------------------------

    with op.batch_alter_table("companies") as batch_op:
        batch_op.add_column(
            sa.Column("company_uuid", sa.String(length=36), nullable=True)
        )
        batch_op.add_column(
            sa.Column("isin", sa.String(length=12), nullable=True)
        )
        batch_op.add_column(
            sa.Column("nse_symbol", sa.String(length=50), nullable=True)
        )
        batch_op.add_column(
            sa.Column("bse_code", sa.String(length=20), nullable=True)
        )
        batch_op.add_column(
            sa.Column("bse_security_id", sa.String(length=50), nullable=True)
        )
        batch_op.add_column(
            sa.Column("website", sa.String(length=500), nullable=True)
        )
        batch_op.add_column(
            sa.Column("business_description", sa.Text(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("industry_group", sa.String(length=150), nullable=True)
        )
        batch_op.add_column(
            sa.Column("sub_industry", sa.String(length=150), nullable=True)
        )
        batch_op.add_column(
            sa.Column("headquarters_city", sa.String(length=150), nullable=True)
        )
        batch_op.add_column(
            sa.Column("headquarters_state", sa.String(length=150), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "headquarters_country",
                sa.String(length=100),
                nullable=True,
            )
        )
        batch_op.add_column(
            sa.Column("ownership_type", sa.String(length=80), nullable=True)
        )
        batch_op.add_column(
            sa.Column("business_group", sa.String(length=200), nullable=True)
        )
        batch_op.add_column(
            sa.Column("promoter_entity", sa.String(length=300), nullable=True)
        )
        batch_op.add_column(
            sa.Column("parent_company", sa.String(length=300), nullable=True)
        )
        batch_op.add_column(
            sa.Column("listing_status", sa.String(length=30), nullable=True)
        )
        batch_op.add_column(
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=True,
            )
        )

    connection = op.get_bind()

    # ------------------------------------------------------------------
    # Step 2: Generate one unique UUID for every existing company.
    # ------------------------------------------------------------------

    company_ids = connection.execute(
        sa.text("SELECT id FROM companies")
    ).scalars().all()

    for company_id in company_ids:
        connection.execute(
            sa.text(
                """
                UPDATE companies
                SET company_uuid = :company_uuid
                WHERE id = :company_id
                """
            ),
            {
                "company_uuid": str(uuid4()),
                "company_id": company_id,
            },
        )

    # ------------------------------------------------------------------
    # Step 3: Transfer legacy NSE symbols into the new nse_symbol field.
    #
    # Only records identified as NSE records are copied. The legacy
    # symbol and exchange fields remain in place during this transition.
    # ------------------------------------------------------------------

    connection.execute(
        sa.text(
            """
            UPDATE companies
            SET nse_symbol = symbol
            WHERE symbol IS NOT NULL
              AND UPPER(COALESCE(exchange, 'NSE')) = 'NSE'
              AND nse_symbol IS NULL
            """
        )
    )

    # ------------------------------------------------------------------
    # Step 4: Populate required defaults for existing records.
    # ------------------------------------------------------------------

    current_time = datetime.now(timezone.utc)

    connection.execute(
        sa.text(
            """
            UPDATE companies
            SET listing_status = 'active'
            WHERE listing_status IS NULL
            """
        )
    )

    connection.execute(
        sa.text(
            """
            UPDATE companies
            SET headquarters_country = 'India'
            WHERE headquarters_country IS NULL
            """
        )
    )

    connection.execute(
        sa.text(
            """
            UPDATE companies
            SET updated_at = COALESCE(created_at, :current_time)
            WHERE updated_at IS NULL
            """
        ),
        {"current_time": current_time},
    )

    # ------------------------------------------------------------------
    # Step 5: Make mandatory fields NOT NULL only after backfilling them.
    #
    # The legacy symbol length is also increased from 40 to 50.
    # SQLite performs these operations through Alembic batch mode.
    # ------------------------------------------------------------------

    with op.batch_alter_table("companies") as batch_op:
        batch_op.alter_column(
            "company_uuid",
            existing_type=sa.String(length=36),
            nullable=False,
        )
        batch_op.alter_column(
            "listing_status",
            existing_type=sa.String(length=30),
            nullable=False,
        )
        batch_op.alter_column(
            "updated_at",
            existing_type=sa.DateTime(timezone=True),
            nullable=False,
        )
        batch_op.alter_column(
            "symbol",
            existing_type=sa.String(length=40),
            type_=sa.String(length=50),
            existing_nullable=False,
        )

    # ------------------------------------------------------------------
    # Step 6: Create indexes and uniqueness rules.
    # ------------------------------------------------------------------

    op.create_index(
        "ix_companies_company_uuid",
        "companies",
        ["company_uuid"],
        unique=True,
    )
    op.create_index(
        "ix_companies_isin",
        "companies",
        ["isin"],
        unique=True,
    )
    op.create_index(
        "ix_companies_nse_symbol",
        "companies",
        ["nse_symbol"],
        unique=True,
    )
    op.create_index(
        "ix_companies_bse_code",
        "companies",
        ["bse_code"],
        unique=True,
    )
    op.create_index(
        "ix_companies_bse_security_id",
        "companies",
        ["bse_security_id"],
        unique=True,
    )

    op.create_index(
        "ix_companies_legal_name",
        "companies",
        ["legal_name"],
        unique=False,
    )
    op.create_index(
        "ix_companies_sector",
        "companies",
        ["sector"],
        unique=False,
    )
    op.create_index(
        "ix_companies_industry_group",
        "companies",
        ["industry_group"],
        unique=False,
    )
    op.create_index(
        "ix_companies_industry",
        "companies",
        ["industry"],
        unique=False,
    )
    op.create_index(
        "ix_companies_sub_industry",
        "companies",
        ["sub_industry"],
        unique=False,
    )
    op.create_index(
        "ix_companies_ownership_type",
        "companies",
        ["ownership_type"],
        unique=False,
    )
    op.create_index(
        "ix_companies_business_group",
        "companies",
        ["business_group"],
        unique=False,
    )
    op.create_index(
        "ix_companies_listing_status",
        "companies",
        ["listing_status"],
        unique=False,
    )
    op.create_index(
        "ix_companies_is_active",
        "companies",
        ["is_active"],
        unique=False,
    )


def downgrade() -> None:
    """Return the companies table to the previous schema."""

    # ------------------------------------------------------------------
    # Step 1: Remove indexes introduced by this migration.
    # ------------------------------------------------------------------

    op.drop_index(
        "ix_companies_is_active",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_listing_status",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_business_group",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_ownership_type",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_sub_industry",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_industry",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_industry_group",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_sector",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_legal_name",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_bse_security_id",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_bse_code",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_nse_symbol",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_isin",
        table_name="companies",
    )
    op.drop_index(
        "ix_companies_company_uuid",
        table_name="companies",
    )

    # ------------------------------------------------------------------
    # Step 2: Remove Company Master fields and restore symbol length.
    # ------------------------------------------------------------------

    with op.batch_alter_table("companies") as batch_op:
        batch_op.alter_column(
            "symbol",
            existing_type=sa.String(length=50),
            type_=sa.String(length=40),
            existing_nullable=False,
        )

        batch_op.drop_column("updated_at")
        batch_op.drop_column("listing_status")
        batch_op.drop_column("parent_company")
        batch_op.drop_column("promoter_entity")
        batch_op.drop_column("business_group")
        batch_op.drop_column("ownership_type")
        batch_op.drop_column("headquarters_country")
        batch_op.drop_column("headquarters_state")
        batch_op.drop_column("headquarters_city")
        batch_op.drop_column("sub_industry")
        batch_op.drop_column("industry_group")
        batch_op.drop_column("business_description")
        batch_op.drop_column("website")
        batch_op.drop_column("bse_security_id")
        batch_op.drop_column("bse_code")
        batch_op.drop_column("nse_symbol")
        batch_op.drop_column("isin")
        batch_op.drop_column("company_uuid")