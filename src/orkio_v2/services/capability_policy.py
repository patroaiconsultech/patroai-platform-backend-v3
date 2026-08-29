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
        )
        if policy.external_read_enabled and not policy.external_read_allowed_domains:
            raise CapabilityPolicyError("EXTERNAL_READ_ALLOWED_DOMAINS_REQUIRED")
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
            "external_write": False,
            "proposal_only": True,
        }
