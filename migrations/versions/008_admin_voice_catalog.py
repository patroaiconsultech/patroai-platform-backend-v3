"""Admin voice catalog.

Revision ID: 008_admin_voice_catalog
Revises: 007_large_document_b1_b2
"""
from alembic import op
import sqlalchemy as sa

revision = "008_admin_voice_catalog"
down_revision = "007_large_document_b1_b2"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table("voice_catalog_entries",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("provider_key", sa.String(80), nullable=False),
        sa.Column("provider_voice_id", sa.String(120), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("provider_model", sa.String(120), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("license_label", sa.String(160), nullable=False),
        sa.Column("cost_class", sa.String(40), nullable=False),
        sa.Column("provenance_url", sa.String(500)),
        sa.Column("catalog_version", sa.String(64), nullable=False),
        sa.Column("supported_locales", sa.JSON(), nullable=False),
        sa.Column("delivery_modes", sa.JSON(), nullable=False),
        sa.Column("curation_status", sa.String(32), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.UniqueConstraint("provider_key", "provider_voice_id", name="uq_voice_catalog_provider_voice"),
    )
    op.create_table("agent_voice_assignments",
        sa.Column("id", sa.String(64), primary_key=True), sa.Column("tenant_id", sa.String(64), nullable=False),
        sa.Column("agent_slug", sa.String(80), nullable=False), sa.Column("voice_catalog_id", sa.String(64), nullable=False),
        sa.Column("locale", sa.String(24), nullable=False), sa.Column("delivery_modes", sa.JSON(), nullable=False),
        sa.Column("presentation_label", sa.String(24), nullable=False), sa.Column("timbre_label", sa.String(80)), sa.Column("energy_label", sa.String(80)),
        sa.Column("assignment_state", sa.String(24), nullable=False), sa.Column("validation_status", sa.String(24), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False), sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.String(64), nullable=False), sa.Column("updated_by", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voice_catalog_id"], ["voice_catalog_entries.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("assignment_state IN ('DRAFT','ACTIVE','DISABLED')", name="ck_agent_voice_assignment_state"),
        sa.CheckConstraint("validation_status IN ('UNVALIDATED','VALIDATED','FAILED')", name="ck_agent_voice_validation_status"),
        sa.CheckConstraint("NOT (assignment_state = 'ACTIVE' AND validation_status != 'VALIDATED')", name="ck_agent_voice_active_requires_validated"),
    )
    op.create_index("uq_agent_voice_assignment_active", "agent_voice_assignments", ["tenant_id","agent_slug","locale"], unique=True, postgresql_where=sa.text("active"))
    op.create_index("uq_agent_voice_unique_active", "agent_voice_assignments", ["tenant_id","voice_catalog_id"], unique=True, postgresql_where=sa.text("active"))

def downgrade() -> None:
    op.drop_table("agent_voice_assignments")
    op.drop_table("voice_catalog_entries")
