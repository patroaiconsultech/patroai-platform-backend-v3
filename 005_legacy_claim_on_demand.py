"""On-demand legacy account claim tracking.

Revision ID: 005_legacy_claim_on_demand
Revises: 004_rc1_auth_d
"""
from alembic import op
import sqlalchemy as sa


revision = "005_legacy_claim_on_demand"
down_revision = "004_rc1_auth_d"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def _index_names(table_name: str) -> set[str]:
    return {
        item["name"]
        for item in sa.inspect(op.get_bind()).get_indexes(table_name)
        if item.get("name")
    }


def _ensure_index(name: str, table_name: str, columns: list[str]) -> None:
    if name not in _index_names(table_name):
        op.create_index(name, table_name, columns)


def upgrade():
    if not _table_exists("legacy_account_links"):
        op.create_table(
            "legacy_account_links",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("source_name", sa.String(80), nullable=False),
            sa.Column("legacy_org_slug", sa.String(120), nullable=False),
            sa.Column("legacy_user_id", sa.String(120), nullable=False),
            sa.Column("target_tenant_id", sa.String(64), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("target_user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("claim_method", sa.String(40), nullable=False, server_default="verified_email"),
            sa.Column("verified_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("source_name", "legacy_org_slug", "legacy_user_id", name="uq_legacy_account_source_user"),
            sa.UniqueConstraint("source_name", "target_user_id", name="uq_legacy_account_source_target"),
        )
    _ensure_index("ix_legacy_account_links_source_name", "legacy_account_links", ["source_name"])
    _ensure_index("ix_legacy_account_links_legacy_org_slug", "legacy_account_links", ["legacy_org_slug"])
    _ensure_index("ix_legacy_account_links_legacy_user_id", "legacy_account_links", ["legacy_user_id"])
    _ensure_index("ix_legacy_account_links_target_tenant_id", "legacy_account_links", ["target_tenant_id"])
    _ensure_index("ix_legacy_account_links_target_user_id", "legacy_account_links", ["target_user_id"])

    if not _table_exists("legacy_claim_runs"):
        op.create_table(
            "legacy_claim_runs",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("link_id", sa.String(64), sa.ForeignKey("legacy_account_links.id", ondelete="CASCADE"), nullable=False),
            sa.Column("tenant_id", sa.String(64), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("consent_version", sa.String(80), nullable=False),
            sa.Column("status", sa.String(30), nullable=False, server_default="running"),
            sa.Column("imported_threads", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("imported_messages", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("imported_attachments", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("exception_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_code", sa.String(80), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        )
    _ensure_index("ix_legacy_claim_runs_link_id", "legacy_claim_runs", ["link_id"])
    _ensure_index("ix_legacy_claim_runs_tenant_id", "legacy_claim_runs", ["tenant_id"])
    _ensure_index("ix_legacy_claim_runs_user_id", "legacy_claim_runs", ["user_id"])

    if not _table_exists("legacy_id_mappings"):
        op.create_table(
            "legacy_id_mappings",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("source_name", sa.String(80), nullable=False),
            sa.Column("legacy_org_slug", sa.String(120), nullable=False),
            sa.Column("resource_type", sa.String(40), nullable=False),
            sa.Column("legacy_resource_id", sa.String(160), nullable=False),
            sa.Column("target_resource_id", sa.String(160), nullable=False),
            sa.Column("claim_run_id", sa.String(64), sa.ForeignKey("legacy_claim_runs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("source_name", "legacy_org_slug", "resource_type", "legacy_resource_id", name="uq_legacy_id_mapping_source_resource"),
        )
    for column in ("source_name", "legacy_org_slug", "resource_type", "legacy_resource_id", "target_resource_id", "claim_run_id"):
        _ensure_index(f"ix_legacy_id_mappings_{column}", "legacy_id_mappings", [column])

    if not _table_exists("legacy_claim_exceptions"):
        op.create_table(
            "legacy_claim_exceptions",
            sa.Column("id", sa.String(64), primary_key=True),
            sa.Column("claim_run_id", sa.String(64), sa.ForeignKey("legacy_claim_runs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("resource_type", sa.String(40), nullable=False),
            sa.Column("legacy_resource_id", sa.String(160), nullable=True),
            sa.Column("code", sa.String(80), nullable=False),
            sa.Column("metadata_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    _ensure_index("ix_legacy_claim_exceptions_claim_run_id", "legacy_claim_exceptions", ["claim_run_id"])
    _ensure_index("ix_legacy_claim_exceptions_resource_type", "legacy_claim_exceptions", ["resource_type"])
    _ensure_index("ix_legacy_claim_exceptions_code", "legacy_claim_exceptions", ["code"])


def downgrade():
    bind = op.get_bind()
    table_indexes = {
        "legacy_claim_exceptions": ("ix_legacy_claim_exceptions_code", "ix_legacy_claim_exceptions_resource_type", "ix_legacy_claim_exceptions_claim_run_id"),
        "legacy_id_mappings": tuple(f"ix_legacy_id_mappings_{column}" for column in ("source_name", "legacy_org_slug", "resource_type", "legacy_resource_id", "target_resource_id", "claim_run_id")),
        "legacy_claim_runs": ("ix_legacy_claim_runs_user_id", "ix_legacy_claim_runs_tenant_id", "ix_legacy_claim_runs_link_id"),
        "legacy_account_links": ("ix_legacy_account_links_target_user_id", "ix_legacy_account_links_target_tenant_id", "ix_legacy_account_links_legacy_user_id", "ix_legacy_account_links_legacy_org_slug", "ix_legacy_account_links_source_name"),
    }
    for table_name, indexes in table_indexes.items():
        if not sa.inspect(bind).has_table(table_name):
            continue
        existing = _index_names(table_name)
        for name in indexes:
            if name in existing:
                op.drop_index(name, table_name=table_name)
        op.drop_table(table_name)
