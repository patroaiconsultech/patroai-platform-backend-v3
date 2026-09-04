from __future__ import annotations

import os
from dataclasses import dataclass


class CapabilityPolicyError(RuntimeError):
    code = "CAPABILITY_POLICY_ERROR"


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    raise CapabilityPolicyError(f"{name}_INVALID")


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise CapabilityPolicyError(f"{name}_INVALID") from exc
    if value < minimum or value > maximum:
        raise CapabilityPolicyError(f"{name}_OUT_OF_RANGE")
    return value


def _env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise CapabilityPolicyError(f"{name}_INVALID") from exc
    if value < minimum or value > maximum:
        raise CapabilityPolicyError(f"{name}_OUT_OF_RANGE")
    return value



def _csv_tokens(name: str) -> tuple[str, ...]:
    values: list[str] = []
    seen: set[str] = set()
    for raw in os.getenv(name, "").split(","):
        item = raw.strip().lower()
        if not item:
            continue
        if any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789-_.:" for ch in item):
            raise CapabilityPolicyError(f"{name}_INVALID")
        if item not in seen:
            seen.add(item)
            values.append(item)
    return tuple(values)

def _domains() -> tuple[str, ...]:
    values: list[str] = []
    seen: set[str] = set()
    for raw in os.getenv("PLATFORM_EXTERNAL_READ_ALLOWED_DOMAINS", "").split(","):
        item = raw.strip().lower().strip(".")
        if not item:
            continue
        if any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789-." for ch in item):
            raise CapabilityPolicyError("PLATFORM_EXTERNAL_READ_ALLOWED_DOMAINS_INVALID")
        if ".." in item or item.startswith("-") or item.endswith("-"):
            raise CapabilityPolicyError("PLATFORM_EXTERNAL_READ_ALLOWED_DOMAINS_INVALID")
        if item not in seen:
            seen.add(item)
            values.append(item)
    return tuple(values)


@dataclass(frozen=True, slots=True)
class CapabilityPolicy:
    python_enabled: bool
    python_timeout_seconds: float
    python_max_code_bytes: int
    python_max_output_bytes: int
    external_read_enabled: bool
    external_read_allowed_domains: tuple[str, ...]
    external_read_timeout_seconds: float
    external_read_max_bytes: int
    external_read_max_urls_per_turn: int
    audit_evidence_capabilities_enabled: bool = False
    audit_file_inspect_enabled: bool = False
    audit_archive_inspect_enabled: bool = False
    audit_runtime_inspect_enabled: bool = False
    audit_runtime_file_sha256_enabled: bool = False
    audit_runtime_search_marker_enabled: bool = False
    audit_allowed_agent_ids: tuple[str, ...] = ()
    audit_allowed_tenant_ids: tuple[str, ...] = ()
    audit_allowed_environments: tuple[str, ...] = ()
    audit_timeout_seconds: float = 3.0
    audit_max_output_bytes: int = 128_000
    audit_governed_invocation_enabled: bool = False
    audit_rate_limit_window_seconds: int = 60
    audit_user_rate_limit_per_window: int = 4
    audit_tenant_rate_limit_per_window: int = 20
    audit_directive_user_rate_limit: int = 12

    @classmethod
    def from_env(cls) -> "CapabilityPolicy":
        policy = cls(
            python_enabled=_env_bool("PLATFORM_PYTHON_TOOL_ENABLED", False),
            python_timeout_seconds=_env_float(
                "PLATFORM_PYTHON_TOOL_TIMEOUT_SECONDS", 3.0, 0.25, 10.0
            ),
            python_max_code_bytes=_env_int(
                "PLATFORM_PYTHON_TOOL_MAX_CODE_BYTES", 20_000, 256, 100_000
            ),
            python_max_output_bytes=_env_int(
                "PLATFORM_PYTHON_TOOL_MAX_OUTPUT_BYTES", 64_000, 1_024, 250_000
            ),
            external_read_enabled=_env_bool("PLATFORM_EXTERNAL_READ_ENABLED", False),
            external_read_allowed_domains=_domains(),
            external_read_timeout_seconds=_env_float(
                "PLATFORM_EXTERNAL_READ_TIMEOUT_SECONDS", 5.0, 0.5, 15.0
            ),
            external_read_max_bytes=_env_int(
                "PLATFORM_EXTERNAL_READ_MAX_BYTES", 500_000, 1_024, 2_000_000
            ),
            external_read_max_urls_per_turn=_env_int(
                "PLATFORM_EXTERNAL_READ_MAX_URLS_PER_TURN", 2, 1, 4
            ),
            audit_evidence_capabilities_enabled=_env_bool(
                "PLATFORM_AUDIT_EVIDENCE_CAPABILITIES_ENABLED", False
            ),
            audit_file_inspect_enabled=_env_bool(
                "PLATFORM_AUDIT_FILE_INSPECT_ENABLED", False
            ),
            audit_archive_inspect_enabled=_env_bool(
                "PLATFORM_AUDIT_ARCHIVE_INSPECT_ENABLED", False
            ),
            audit_runtime_inspect_enabled=_env_bool(
                "PLATFORM_AUDIT_RUNTIME_INSPECT_ENABLED", False
            ),
            audit_runtime_file_sha256_enabled=_env_bool(
                "PLATFORM_AUDIT_RUNTIME_FILE_SHA256_ENABLED", False
            ),
            audit_runtime_search_marker_enabled=_env_bool(
                "PLATFORM_AUDIT_RUNTIME_SEARCH_MARKER_ENABLED", False
            ),
            audit_allowed_agent_ids=_csv_tokens("PLATFORM_AUDIT_ALLOWED_AGENT_IDS"),
            audit_allowed_tenant_ids=_csv_tokens("PLATFORM_AUDIT_ALLOWED_TENANT_IDS"),
            audit_allowed_environments=_csv_tokens("PLATFORM_AUDIT_ALLOWED_ENVIRONMENTS"),
            audit_timeout_seconds=_env_float(
                "PLATFORM_AUDIT_TIMEOUT_SECONDS", 3.0, 0.25, 15.0
            ),
            audit_max_output_bytes=_env_int(
                "PLATFORM_AUDIT_MAX_OUTPUT_BYTES", 128_000, 1_024, 1_000_000
            ),
            audit_governed_invocation_enabled=_env_bool(
                "PLATFORM_AUDIT_GOVERNED_INVOCATION_ENABLED", False
            ),
            audit_rate_limit_window_seconds=_env_int(
                "PLATFORM_AUDIT_RATE_LIMIT_WINDOW_SECONDS", 60, 60, 60
            ),
            audit_user_rate_limit_per_window=_env_int(
                "PLATFORM_AUDIT_USER_RATE_LIMIT_PER_WINDOW", 4, 1, 100
            ),
            audit_tenant_rate_limit_per_window=_env_int(
                "PLATFORM_AUDIT_TENANT_RATE_LIMIT_PER_WINDOW", 20, 1, 1000
            ),
            audit_directive_user_rate_limit=_env_int(
                "PLATFORM_AUDIT_DIRECTIVE_USER_RATE_LIMIT", 12, 1, 100
            ),
        )
        if policy.external_read_enabled and not policy.external_read_allowed_domains:
            raise CapabilityPolicyError("EXTERNAL_READ_ALLOWED_DOMAINS_REQUIRED")
        if policy.audit_tenant_rate_limit_per_window < policy.audit_user_rate_limit_per_window:
            raise CapabilityPolicyError("PLATFORM_AUDIT_RATE_LIMIT_INVALID")
        return policy

    def manifest(self, *, privileged: bool) -> dict[str, object]:
        return {
            "python": {
                "execute": bool(self.python_enabled and privileged),
                "network": False,
                "filesystem": False,
                "privileged_only": True,
            },
            "external_read": {
                "enabled": bool(self.external_read_enabled and privileged),
                "https_only": True,
                "read_only": True,
                "allowed_domains": list(self.external_read_allowed_domains),
                "privileged_only": True,
            },
            "audit": {
                "governed_invocation": bool(
                    self.audit_governed_invocation_enabled and privileged
                ),
                "evidence_capabilities_enabled": bool(
                    self.audit_evidence_capabilities_enabled and privileged
                ),
                "file_inspect": bool(
                    self.audit_evidence_capabilities_enabled
                    and self.audit_file_inspect_enabled
                    and privileged
                ),
                "archive_inspect": bool(
                    self.audit_evidence_capabilities_enabled
                    and self.audit_archive_inspect_enabled
                    and privileged
                ),
                "runtime_file_sha256": bool(
                    self.audit_evidence_capabilities_enabled
                    and self.audit_runtime_inspect_enabled
                    and self.audit_runtime_file_sha256_enabled
                    and privileged
                ),
                "runtime_search_marker": bool(
                    self.audit_evidence_capabilities_enabled
                    and self.audit_runtime_inspect_enabled
                    and self.audit_runtime_search_marker_enabled
                    and privileged
                ),
                "network": False,
                "write": False,
                "allowed_agent_ids": list(self.audit_allowed_agent_ids),
                "allowed_tenant_ids": list(self.audit_allowed_tenant_ids),
                "allowed_environments": list(self.audit_allowed_environments),
                "rate_limit_window_seconds": self.audit_rate_limit_window_seconds,
                "user_rate_limit_per_window": self.audit_user_rate_limit_per_window,
                "tenant_rate_limit_per_window": self.audit_tenant_rate_limit_per_window,
                "directive_user_rate_limit": self.audit_directive_user_rate_limit,
            },
            "external_write": False,
            "proposal_only": True,
        }
