"""REQ-4.10/4.12: MinioClient — the boto3 S3 client itself is a thin,
untestable-without-a-broker wrapper, so these tests replace the
underlying boto3 client with a fake to exercise `MinioClient`'s own
logic (error translation, bucket scoping) in isolation, the same
"mock the concrete SDK client" approach `apps/api`'s
`storage.service.spec.ts` uses for `@aws-sdk/client-s3`.
"""

from __future__ import annotations

from typing import Any

import pytest
from botocore.exceptions import ClientError

from vision_service.storage.minio_client import MinioClient, MinioObjectNotFoundError


class FakeBoto3Client:
    def __init__(self, *, head_bucket_error: Exception | None = None) -> None:
        self.head_bucket_error = head_bucket_error
        self.downloaded: list[tuple[str, str, str]] = []
        self.download_error: Exception | None = None

    def download_file(self, bucket: str, key: str, dest_path: str) -> None:
        if self.download_error is not None:
            raise self.download_error
        self.downloaded.append((bucket, key, dest_path))

    def head_bucket(self, Bucket: str) -> dict[str, Any]:  # noqa: N803 - boto3's own kwarg casing
        if self.head_bucket_error is not None:
            raise self.head_bucket_error
        return {}


def _not_found_error() -> ClientError:
    return ClientError({"Error": {"Code": "404", "Message": "Not Found"}}, "HeadObject")


def _make_client(fake: FakeBoto3Client) -> MinioClient:
    client = MinioClient(bucket="mission-videos")
    client._client = fake  # noqa: SLF001 - test-only reach into the wrapped SDK client
    return client


def test_download_to_delegates_to_boto3_client() -> None:
    fake = FakeBoto3Client()
    client = _make_client(fake)

    client.download_to("missions/video.mp4", "/tmp/out.mp4")

    assert fake.downloaded == [("mission-videos", "missions/video.mp4", "/tmp/out.mp4")]


def test_download_to_raises_not_found_for_a_missing_object() -> None:
    fake = FakeBoto3Client()
    fake.download_error = _not_found_error()
    client = _make_client(fake)

    with pytest.raises(MinioObjectNotFoundError):
        client.download_to("missions/missing.mp4", "/tmp/out.mp4")


def test_download_to_reraises_other_client_errors() -> None:
    fake = FakeBoto3Client()
    fake.download_error = ClientError(
        {"Error": {"Code": "403", "Message": "Forbidden"}}, "GetObject"
    )
    client = _make_client(fake)

    with pytest.raises(ClientError):
        client.download_to("missions/video.mp4", "/tmp/out.mp4")


def test_is_reachable_true_when_head_bucket_succeeds() -> None:
    client = _make_client(FakeBoto3Client())

    assert client.is_reachable() is True


def test_is_reachable_false_when_head_bucket_fails() -> None:
    fake = FakeBoto3Client(head_bucket_error=_not_found_error())
    client = _make_client(fake)

    assert client.is_reachable() is False
