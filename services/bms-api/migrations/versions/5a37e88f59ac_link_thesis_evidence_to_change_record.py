"""link thesis evidence to change record

Revision ID: 5a37e88f59ac
Revises: 82ce0e4d50bd
Create Date: 2026-08-06 17:58:00.152491
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5a37e88f59ac"
down_revision: Union[str, Sequence[str], None] = "82ce0e4d50bd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("thesis_evidence") as batch_op:
        batch_op.add_column(
            sa.Column(
                "change_record_id",
                sa.Integer(),
                nullable=True,
            )
        )

        batch_op.create_index(
            "ix_thesis_evidence_change_record_id",
            ["change_record_id"],
            unique=False,
        )

        batch_op.create_foreign_key(
            "fk_thesis_evidence_change_record",
            "change_records",
            ["change_record_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("thesis_evidence") as batch_op:
        batch_op.drop_constraint(
            "fk_thesis_evidence_change_record",
            type_="foreignkey",
        )

        batch_op.drop_index(
            "ix_thesis_evidence_change_record_id"
        )

        batch_op.drop_column(
            "change_record_id"
        )