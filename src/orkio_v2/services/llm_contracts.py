from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any

from ..agents.registry import resolve_agent_by_id


SYSTEM_PROMPT = (
    "Você opera como um agente da Plataforma Efatá 777. "
    "Responda com precisão, de forma profissional e concisa, no idioma solicitado "
    "pelo usuário ou, na ausência de instrução explícita, no idioma dominante do turno."
)


class LLMNotConfigured(RuntimeError):
    """O provedor solicitado não está configurado."""


class LLMUpstreamError(RuntimeError):
    """O provedor solicitado respondeu com erro ou ficou indisponível."""


class ProviderName(str, Enum):
    openai = "openai"
    anthropic = "anthropic"
    google = "google"


class ProviderConfigurationState(str, Enum):
    registered = "REGISTERED"
    unconfigured = "UNCONFIGURED"
    configured = "CONFIGURED"


class ProviderHealthState(str, Enum):
    unconfigured = "UNCONFIGURED"
    ready = "READY"
    unavailable = "UNAVAILABLE"


@dataclass(frozen=True)
class LLMUsage:
    input_tokens: int | None = None
    output_tokens: int | None = None
    cached_input_tokens: int | None = None


@dataclass(frozen=True)
class LLMResult:
    content: str
    provider: ProviderName
    model: str
    usage: LLMUsage


@dataclass(frozen=True)
class ProviderDescriptor:
    provider: ProviderName
    model: str
    state: ProviderConfigurationState


@dataclass(frozen=True)
class ProviderHealth:
    provider: ProviderName
    model: str
    state: ProviderHealthState
    code: str | None = None


HYPER_COCREATOR_SYSTEM_PREFIX = "HYPER CO-CREATOR MODE"


def agent_system_prompt(agent: str) -> str:
    resolved = resolve_agent_by_id(agent)
    return (
        f"{SYSTEM_PROMPT} Seu nome nesta conversa é {resolved.canonical_name}. "
        f"{resolved.system_instruction} "
        "Não alegue ter usado ferramentas que não foram explicitamente disponibilizadas."
    )


def _has_hyper_cocreator_context(agent: str, history: list[dict[str, Any]]) -> bool:
    if agent.strip().lower() != "orkio":
        return False
    return any(
        str(item.get("role") or "").strip() == "system"
        and str(item.get("content") or "").lstrip().startswith(HYPER_COCREATOR_SYSTEM_PREFIX)
        for item in history
    )


def system_prompt_for_history(agent: str, history: list[dict[str, Any]]) -> str:
    """Return the base system prompt without conflicting legacy identity in Hyper mode.

    The personalized Hyper Co-Creator system message in `history` is authoritative for
    user-facing presentation. Technical ownership remains `agent_id=orkio`.
    """
    if _has_hyper_cocreator_context(agent, history):
        return (
            f"{SYSTEM_PROMPT} "
            "A identidade visível do Hyper Co-Criador é definida pelo contexto system "
            "autoritativo deste turno. Não substitua esse nome por identidade organizacional "
            "legada ou metadado interno do agente técnico. Não exponha nomes internos, cargos "
            "organizacionais ou aliases como sua identidade quando estiver em Hyper Co-Creator mode. "
            "Não alegue ter usado ferramentas que não foram explicitamente disponibilizadas."
        )
    return agent_system_prompt(agent)


def split_system_and_history(agent: str, history: list[dict[str, Any]]) -> tuple[str, list[dict[str, str]]]:
    """Normaliza histórico para provedores que usam system fora de messages.

    Mensagens system auxiliares, como contexto documental canônico, são preservadas
    no system prompt do request. Somente user/assistant entram no histórico.
    """
    system_parts = [system_prompt_for_history(agent, history)]
    normalized: list[dict[str, str]] = []
    for item in history:
        role = str(item.get("role") or "").strip()
        content = str(item.get("content") or "")
        if not content:
            continue
        if role == "system":
            system_parts.append(content)
            continue
        if role in {"user", "assistant"}:
            normalized.append({"role": role, "content": content})
    return "\n\n".join(system_parts), normalized
