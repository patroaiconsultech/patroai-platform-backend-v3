from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


class BlobStorageError(RuntimeError):
    """A blob could not be stored or retrieved safely."""


class BlobStorage(Protocol):
    def put_if_absent(self, key: str, data: bytes, *, content_type: str) -> bool:
        """Store a blob without overwriting an existing key; return whether created."""

    def get(self, key: str) -> bytes:
        """Read a blob by its opaque storage key."""

    def delete(self, key: str) -> None:
        """Delete a blob by its opaque storage key."""


@dataclass(frozen=True, slots=True)
class LocalBlobStorage:
    root: Path

    def _target(self, key: str) -> Path:
        root = self.root.resolve()
        target = (root / key).resolve()
        if target != root and root not in target.parents:
            raise BlobStorageError("STORAGE_KEY_INVALID")
        return target

    def put_if_absent(self, key: str, data: bytes, *, content_type: str) -> bool:
        target = self._target(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            return False
        temporary = target.with_name(target.name + ".uploading")
        temporary.write_bytes(data)
        temporary.replace(target)
        return True

    def get(self, key: str) -> bytes:
        target = self._target(key)
        try:
            return target.read_bytes()
        except FileNotFoundError as exc:
            raise BlobStorageError("BLOB_NOT_FOUND") from exc
        except OSError as exc:
            raise BlobStorageError("BLOB_READ_FAILED") from exc

    def delete(self, key: str) -> None:
        target = self._target(key)
        try:
            target.unlink(missing_ok=True)
        except OSError as exc:
            raise BlobStorageError("BLOB_DELETE_FAILED") from exc


@dataclass(frozen=True, slots=True)
class S3BlobStorage:
    bucket: str
    region: str
    endpoint_url: str | None
    access_key_id: str
    secret_access_key: str
    prefix: str
    server_side_encryption: str
    kms_key_id: str

    def _key(self, key: str) -> str:
        clean = key.replace("\\", "/").lstrip("/")
        if not clean or ".." in clean.split("/"):
            raise BlobStorageError("STORAGE_KEY_INVALID")
        prefix = self.prefix.strip("/")
        return f"{prefix}/{clean}" if prefix else clean

    def _client(self):
        try:
            import boto3
        except ImportError as exc:
            raise BlobStorageError("S3_CLIENT_NOT_INSTALLED") from exc
        return boto3.client(
            "s3",
            region_name=self.region,
            endpoint_url=self.endpoint_url or None,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
        )

    def put_if_absent(self, key: str, data: bytes, *, content_type: str) -> bool:
        client = self._client()
        object_key = self._key(key)
        try:
            client.head_object(Bucket=self.bucket, Key=object_key)
            return False
        except Exception as exc:
            response = getattr(exc, "response", {}) or {}
            error_code = str((response.get("Error") or {}).get("Code") or "")
            if error_code not in {"404", "NoSuchKey", "NotFound"}:
                raise BlobStorageError("BLOB_HEAD_FAILED") from exc
        try:
            put_kwargs = {
                "Bucket": self.bucket,
                "Key": object_key,
                "Body": data,
                "ContentType": content_type,
                "ServerSideEncryption": self.server_side_encryption,
            }
            if self.server_side_encryption == "aws:kms":
                put_kwargs["SSEKMSKeyId"] = self.kms_key_id
            client.put_object(**put_kwargs)
        except Exception as exc:
            raise BlobStorageError("BLOB_WRITE_FAILED") from exc
        return True

    def get(self, key: str) -> bytes:
        try:
            response = self._client().get_object(Bucket=self.bucket, Key=self._key(key))
            return response["Body"].read()
        except KeyError as exc:
            raise BlobStorageError("BLOB_READ_FAILED") from exc
        except Exception as exc:
            response = getattr(exc, "response", {}) or {}
            error_code = str((response.get("Error") or {}).get("Code") or "")
            if error_code in {"404", "NoSuchKey", "NotFound"}:
                raise BlobStorageError("BLOB_NOT_FOUND") from exc
            raise BlobStorageError("BLOB_READ_FAILED") from exc

    def delete(self, key: str) -> None:
        try:
            self._client().delete_object(Bucket=self.bucket, Key=self._key(key))
        except Exception as exc:
            raise BlobStorageError("BLOB_DELETE_FAILED") from exc


def build_blob_storage(settings) -> BlobStorage:
    backend = str(getattr(settings, "artifact_storage_backend", "local") or "local").lower()
    if backend == "local":
        return LocalBlobStorage(Path(settings.artifact_storage_path))
    if backend == "s3":
        return S3BlobStorage(
            bucket=settings.artifact_storage_bucket,
            region=settings.artifact_storage_region,
            endpoint_url=settings.artifact_storage_endpoint_url,
            access_key_id=settings.artifact_storage_access_key_id,
            secret_access_key=settings.artifact_storage_secret_access_key,
            prefix=settings.artifact_storage_prefix,
            server_side_encryption=settings.artifact_storage_sse,
            kms_key_id=settings.artifact_storage_kms_key_id,
        )
    raise BlobStorageError("STORAGE_BACKEND_UNSUPPORTED")
