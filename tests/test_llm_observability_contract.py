from __future__ import annotations

import httpx

from orkio_v2.services.llm_contracts import LLMUpstreamError
from orkio_v2.services.llm_providers import _provider_error
from orkio_v2.services.llm_contracts import ProviderName


def test_llm_upstream_diagnostic_is_sanitized():
    request = httpx.Request(
        "POST",
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": "Bearer should-never-appear"},
    )
    response = httpx.Response(
        429,
        request=request,
        json={"error": {"code": "rate_limit_exceeded", "message": "private provider detail"}},
    )
    source = httpx.HTTPStatusError("bad", request=request, response=response)

    error = _provider_error(
        provider=ProviderName.openai,
        model="gpt-5",
        operation="stream",
        exc=source,
    )

    assert isinstance(error, LLMUpstreamError)
    assert error.upstream_status == 429
    assert error.upstream_code == "rate_limit_exceeded"
    diagnostic = error.diagnostic()
    rendered = repr(diagnostic)
    assert "Authorization" not in rendered
    assert "should-never-appear" not in rendered
    assert "private provider detail" not in rendered


def test_llm_upstream_diagnostic_keeps_runtime_metadata_only():
    error = LLMUpstreamError(
        provider="openai",
        model="gpt-5",
        operation="generate",
        upstream_status=400,
        upstream_code="unsupported_parameter",
        exception_type="HTTPStatusError",
    )
    assert error.diagnostic() == {
        "provider": "openai",
        "model": "gpt-5",
        "operation": "generate",
        "upstream_status": 400,
        "upstream_code": "unsupported_parameter",
        "exception_type": "HTTPStatusError",
    }
