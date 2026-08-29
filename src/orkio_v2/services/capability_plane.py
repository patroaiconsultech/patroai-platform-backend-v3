from __future__ import annotations

from .capability_policy import CapabilityPolicy
from .external_read_tool import external_read_context_messages
from .python_tool import python_context_messages


def privileged_roles(roles: frozenset[str] | set[str] | tuple[str, ...]) -> bool:
    return bool({"admin", "orkio_admin"}.intersection(set(roles)))


def capability_manifest_message(
    policy: CapabilityPolicy,
    *,
    privileged: bool,
) -> dict[str, str]:
    manifest = policy.manifest(privileged=privileged)
    py = manifest["python"]
    ext = manifest["external_read"]
    return {
        "role": "system",
        "content": (
            "ORKIO EFFECTIVE CAPABILITIES FOR THIS TURN — authoritative runtime policy.\n"
            f"python_execute={str(bool(py['execute'])).lower()} "
            "python_network=false python_filesystem=false\n"
            f"external_read={str(bool(ext['enabled'])).lower()} "
            f"allowed_domains={','.join(ext['allowed_domains']) or '[none]'}\n"
            "external_write=false proposal_only=true\n"
            "Generate source code as text when requested. "
            "Only claim Python execution or external-link reading when a trusted tool result "
            "message is present in this turn."
        ),
    }


async def runtime_capability_messages(
    *,
    message: str,
    roles,
) -> list[dict[str, str]]:
    policy = CapabilityPolicy.from_env()
    privileged = privileged_roles(roles)
    messages = [capability_manifest_message(policy, privileged=privileged)]
    messages.extend(
        await python_context_messages(
            policy,
            message=message,
            privileged=privileged,
        )
    )
    messages.extend(
        await external_read_context_messages(
            policy,
            message=message,
            privileged=privileged,
        )
    )
    return messages
