from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from pathlib import Path, PurePosixPath
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from .auth import Principal
from .config import Settings, get_settings
from .database import get_db
from .services.blob_storage import BlobStorageError, build_blob_storage
from .services.identity import require_provisioned_principal
from .services.knowledge_policy import KnowledgePolicyError, normalize_scope
from .services.knowledge_repository import (
    KnowledgeRepositoryError,
    create_uploaded_document,
    delete_document,
    document_payload,
    list_documents,
    list_versions,
    publish_document,
    revoke_document,
    supersede_document,
)


router = APIRouter(prefix="/api/v2/knowledge", tags=["knowledge"])

_ALLOWED_MIME = {
    "application/pdf",
    "text/plain",
    "text/csv",
    "text/markdown",
    "application/json",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
_SUFFIX_MIME = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".json": "application/json",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
_CLASSIFICATIONS = {"public", "internal", "confidential", "restricted"}
_AGENT_RE = re.compile(r"^[A-Za-z0-9._:-]{1,80}$")


def _raise_known(exc: Exception) -> None:
    if isinstance(exc, KnowledgePolicyError):
        raise HTTPException(exc.status_code, exc.code) from exc
    if isinstance(exc, KnowledgeRepositoryError):
        raise HTTPException(exc.status_code, exc.code) from exc
    if isinstance(exc, BlobStorageError):
        raise HTTPException(503, str(exc)) from exc
    raise exc


def _parse_purposes(raw: str | None) -> list[str]:
    values = [item.strip().lower() for item in str(raw or "").split(",") if item.strip()]
    return values or ["chat", "team", "realtime"]


def _clean_metadata(
    *,
    title: str | None,
    filename: str,
    classification: str,
    agent_id: str | None,
    expires_at: datetime | None,
) -> tuple[str, str, str, str | None, datetime | None]:
    safe = PurePosixPath((filename or "file").replace("\\", "/")).name
    if not safe or safe in {".", ".."} or "\x00" in safe:
        raise HTTPException(400, "FILENAME_INVALID")
    if len(safe) > 255:
        raise HTTPException(400, "FILENAME_TOO_LONG")

    normalized_title = (title or Path(safe).stem or safe).strip()
    if not normalized_title:
        raise HTTPException(422, "KNOWLEDGE_TITLE_REQUIRED")
    if len(normalized_title) > 240:
        raise HTTPException(422, "KNOWLEDGE_TITLE_TOO_LONG")

    normalized_classification = (classification or "internal").strip().lower()
    if normalized_classification not in _CLASSIFICATIONS:
        raise HTTPException(422, "KNOWLEDGE_CLASSIFICATION_INVALID")

    normalized_agent = (agent_id or "").strip() or None
    if normalized_agent and not _AGENT_RE.fullmatch(normalized_agent):
        raise HTTPException(422, "KNOWLEDGE_AGENT_ID_INVALID")

    if expires_at is not None:
        expiry = expires_at
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry.astimezone(timezone.utc) <= datetime.now(timezone.utc):
            raise HTTPException(422, "KNOWLEDGE_EXPIRY_MUST_BE_FUTURE")
        expires_at = expiry

    return (
        normalized_title,
        safe,
        normalized_classification,
        normalized_agent,
        expires_at,
    )


async def _read_upload(
    file: UploadFile,
    *,
    settings: Settings,
) -> tuple[bytes, str, str]:
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "FILE_TOO_LARGE")
    if not data:
        raise HTTPException(422, "FILE_EMPTY")

    safe = PurePosixPath((file.filename or "file").replace("\\", "/")).name
    if not safe or safe in {".", ".."} or "\x00" in safe:
        raise HTTPException(400, "FILENAME_INVALID")

    mime = (
        file.content_type
        if file.content_type in _ALLOWED_MIME
        else _SUFFIX_MIME.get(Path(safe).suffix.lower(), file.content_type)
    )
    if mime not in _ALLOWED_MIME:
        raise HTTPException(415, "MIME_TYPE_NOT_ALLOWED")
    return data, safe, str(mime)


@router.post("")
async def upload_knowledge(
    file: UploadFile = File(...),
    scope: str = Form(...),
    title: str | None = Form(None),
    classification: str = Form("internal"),
    allowed_purposes: str = Form("chat,team,realtime"),
    agent_id: str | None = Form(None),
    expires_at: datetime | None = Form(None),
    p: Principal = Depends(require_provisioned_principal),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    if not settings.knowledge_plane_enabled:
        raise HTTPException(403, "KNOWLEDGE_PLANE_DISABLED")
    try:
        normalized_scope = normalize_scope(scope)
        data, safe, mime = await _read_upload(file, settings=settings)
        normalized_title, safe, classification, agent_id, expires_at = _clean_metadata(
            title=title,
            filename=safe,
            classification=classification,
            agent_id=agent_id,
            expires_at=expires_at,
        )
        row = create_uploaded_document(
            db,
            principal=p,
            scope=normalized_scope,
            title=normalized_title,
            filename=safe,
            mime_type=mime,
            data=data,
            digest=hashlib.sha256(data).hexdigest(),
            classification=classification,
            allowed_purposes=_parse_purposes(allowed_purposes),
            agent_id=agent_id,
            expires_at=expires_at,
            storage=build_blob_storage(settings),
        )
        return document_payload(row)
    except (KnowledgePolicyError, KnowledgeRepositoryError, BlobStorageError) as exc:
        _raise_known(exc)


@router.get("")
def get_knowledge(
    scope: str = Query("PERSONAL"),
    p: Principal = Depends(require_provisioned_principal),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    if not settings.knowledge_plane_enabled:
        raise HTTPException(403, "KNOWLEDGE_PLANE_DISABLED")
    try:
        rows = list_documents(db, principal=p, scope=scope)
        return {"items": [document_payload(row) for row in rows], "total": len(rows)}
    except (KnowledgePolicyError, KnowledgeRepositoryError) as exc:
        _raise_known(exc)


@router.get("/{logical_document_id}/versions")
def get_knowledge_versions(
    logical_document_id: str,
    p: Principal = Depends(require_provisioned_principal),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    if not settings.knowledge_plane_enabled:
        raise HTTPException(403, "KNOWLEDGE_PLANE_DISABLED")
    try:
        rows = list_versions(
            db,
            principal=p,
            logical_document_id=logical_document_id,
        )
        return {"items": [document_payload(row) for row in rows], "total": len(rows)}
    except KnowledgePolicyError as exc:
        _raise_known(exc)


@router.post("/{document_id}/publish")
def publish_knowledge(
    document_id: str,
    p: Principal = Depends(require_provisioned_principal),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    if not settings.knowledge_plane_enabled:
        raise HTTPException(403, "KNOWLEDGE_PLANE_DISABLED")
    try:
        return document_payload(
            publish_document(db, principal=p, document_id=document_id)
        )
    except (KnowledgePolicyError, KnowledgeRepositoryError) as exc:
        _raise_known(exc)


@router.post("/{document_id}/revoke")
def revoke_knowledge(
    document_id: str,
    p: Principal = Depends(require_provisioned_principal),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    if not settings.knowledge_plane_enabled:
        raise HTTPException(403, "KNOWLEDGE_PLANE_DISABLED")
    try:
        return document_payload(
            revoke_document(db, principal=p, document_id=document_id)
        )
    except (KnowledgePolicyError, KnowledgeRepositoryError) as exc:
        _raise_known(exc)


@router.post("/{document_id}/supersede")
async def supersede_knowledge(
    document_id: str,
    file: UploadFile = File(...),
    title: str | None = Form(None),
    classification: str | None = Form(None),
    allowed_purposes: str | None = Form(None),
    agent_id: str | None = Form(None),
    expires_at: datetime | None = Form(None),
    p: Principal = Depends(require_provisioned_principal),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    if not settings.knowledge_plane_enabled:
        raise HTTPException(403, "KNOWLEDGE_PLANE_DISABLED")
    try:
        data, safe, mime = await _read_upload(file, settings=settings)
        # Optional metadata inherits from the old row. When explicitly supplied,
        # validate it using the same upload contract.
        validated_title = None
        validated_classification = classification
        validated_agent = agent_id
        validated_expiry = expires_at
        if any(value is not None for value in (title, classification, agent_id, expires_at)):
            (
                normalized_title,
                safe,
                normalized_classification,
                normalized_agent,
                normalized_expiry,
            ) = _clean_metadata(
                title=title,
                filename=safe,
                classification=classification or "internal",
                agent_id=agent_id,
                expires_at=expires_at,
            )
            validated_title = normalized_title if title is not None else None
            validated_classification = (
                normalized_classification if classification is not None else None
            )
            validated_agent = normalized_agent if agent_id is not None else None
            validated_expiry = normalized_expiry
        row = supersede_document(
            db,
            principal=p,
            document_id=document_id,
            title=validated_title,
            filename=safe,
            mime_type=mime,
            data=data,
            digest=hashlib.sha256(data).hexdigest(),
            classification=validated_classification,
            allowed_purposes=(
                _parse_purposes(allowed_purposes)
                if allowed_purposes is not None
                else None
            ),
            agent_id=validated_agent,
            expires_at=validated_expiry,
            storage=build_blob_storage(settings),
        )
        return document_payload(row)
    except (KnowledgePolicyError, KnowledgeRepositoryError, BlobStorageError) as exc:
        _raise_known(exc)


@router.delete("/{document_id}")
def delete_knowledge(
    document_id: str,
    p: Principal = Depends(require_provisioned_principal),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db),
):
    if not settings.knowledge_plane_enabled:
        raise HTTPException(403, "KNOWLEDGE_PLANE_DISABLED")
    try:
        delete_document(
            db,
            principal=p,
            document_id=document_id,
            storage=build_blob_storage(settings),
        )
        return {"status": "deleted", "id": document_id}
    except (KnowledgePolicyError, KnowledgeRepositoryError, BlobStorageError) as exc:
        _raise_known(exc)
