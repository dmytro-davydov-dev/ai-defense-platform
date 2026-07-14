"""REQ-4.10: direct MinIO/S3 client for downloading a mission's source
video. Uses the same `MINIO_*` env vars `apps/api`'s `StorageService`
reads (`apps/api/src/storage/storage.service.ts`) — both services run
against the same MinIO instance in
`infrastructure/compose/docker-compose.yml`. This service downloads
objects directly with its own credentials rather than proxying through
`apps/api`'s signed-URL endpoints (PRD-Phase-4 Open questions: "either
satisfies REQ-4.10; pick whichever keeps credential handling
simplest" — a direct client avoids an extra HTTP hop and an
apps/api-issued token this service would otherwise need).

Synchronous (`boto3`, not an async S3 client) on purpose: this mirrors
`apps/api`'s SDK choice and keeps this module dependency-light; callers
on the async Kafka consumer path (`kafka/commands_consumer.py`) run its
methods via `asyncio.to_thread` rather than blocking the event loop.
"""

from __future__ import annotations

import boto3
from botocore.client import Config
from botocore.exceptions import BotoCoreError, ClientError

from vision_service.settings import settings


def _build_boto3_client():
    # boto3 has no public client type to annotate the return value
    # with; left unannotated on purpose rather than importing a
    # private botocore type.
    return boto3.client(
        "s3",
        endpoint_url=f"http://{settings.minio_endpoint}:{settings.minio_port}",
        aws_access_key_id=settings.minio_root_user,
        aws_secret_access_key=settings.minio_root_password,
        config=Config(signature_version="s3v4"),
        # MinIO ignores the region value but the SDK requires one to be
        # set for SigV4 signing — same choice as apps/api's StorageService.
        region_name="us-east-1",
    )


class MinioObjectNotFoundError(RuntimeError):
    """Raised when the requested object key doesn't exist in the
    bucket — REQ-4.11 routes this through PROCESSING_FAILED/DLQ the
    same as a decode failure.
    """


class MinioClient:
    """Thin wrapper around a `boto3` S3 client scoped to one bucket
    (the missions bucket, same default as `apps/api`'s
    `MINIO_MISSIONS_BUCKET`).
    """

    def __init__(self, bucket: str | None = None) -> None:
        self._bucket = bucket or settings.minio_missions_bucket
        self._client = _build_boto3_client()

    def download_to(self, object_key: str, dest_path: str) -> None:
        """Downloads `object_key` from the missions bucket to
        `dest_path` on the local filesystem. Raises
        `MinioObjectNotFoundError` for a missing key, or lets any
        other `botocore` error (auth failure, network error, ...)
        propagate — both are unrecoverable-for-this-attempt failures
        the caller's retry/DLQ machinery (REQ-3.9/3.10) already
        handles.
        """
        try:
            self._client.download_file(self._bucket, object_key, dest_path)
        except ClientError as error:
            error_code = error.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchKey"):
                raise MinioObjectNotFoundError(
                    f"object not found: {self._bucket}/{object_key}"
                ) from error
            raise

    def is_reachable(self) -> bool:
        """REQ-4.7: a lightweight reachability check for `/ready` —
        `HeadBucket` against the missions bucket, no object transfer.
        """
        try:
            self._client.head_bucket(Bucket=self._bucket)
            return True
        except (BotoCoreError, ClientError):
            return False


# Module-level singleton, same pattern as `kafka.runner.commands_consumer_runner`
# — constructed once at import time (safe even with blank credentials;
# boto3 doesn't make a network call until a method is invoked) and
# shared by both the consumer pipeline and the `/ready` health check.
minio_client = MinioClient()
