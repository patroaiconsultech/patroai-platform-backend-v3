from __future__ import annotations

import json

from orkio_v2.config import get_settings
from orkio_v2.services.realtime_session import realtime_capability
from orkio_v2.services.speech_to_text import inspect_stt_readiness


def main() -> None:
    settings = get_settings()
    payload = {
        "environment": settings.environment,
        "release_sha": settings.release_sha,
        "realtime": realtime_capability(settings),
        "stt": inspect_stt_readiness(settings),
        "provider_configuration_state": (
            "configured" if (settings.openai_api_key or "").strip() else "unconfigured"
        ),
    }
    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
