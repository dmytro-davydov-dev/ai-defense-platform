"""Startup configuration, sourced from environment variables / .env.

Per docs/mvp-plan/PRD-Phase-1.md REQ-1.18, no secrets are hardcoded.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VISION_SERVICE_", env_file=".env")

    service_name: str = "vision-service"
    port: int = 8000
    log_level: str = "info"

    # Not VISION_SERVICE_-prefixed on purpose: infrastructure/compose/docker-compose.yml
    # sets these as plain KAFKA_BROKERS/DATABASE_URL, the same names
    # apps/api uses, rather than a per-service duplicate. Default to ""
    # (not a hard failure at settings-construction time) — the Kafka
    # consumer runner checks for a blank value itself and disables the
    # consumer with a loud log line, the same "don't take down the
    # whole app over optional infra" choice apps/api's Kafka consumer
    # makes (see apps/api/src/kafka/processing-events-consumer.service.ts).
    kafka_brokers: str = Field(default="", validation_alias="KAFKA_BROKERS")
    database_url: str = Field(default="", validation_alias="DATABASE_URL")

    # Phase 4 (REQ-4.10): same MINIO_* names apps/api's StorageService
    # reads (infrastructure/compose/docker-compose.yml sets these
    # identically for both services) — this service downloads mission
    # videos directly from MinIO rather than proxying through apps/api.
    # minio_root_user/minio_root_password default to "" (not a hard
    # failure at settings-construction time), mirroring
    # kafka_brokers/database_url above: MinioClient can always be
    # constructed, and /ready's reachability check treats a blank
    # credential pair as "not configured" rather than "unreachable".
    minio_endpoint: str = Field(default="localhost", validation_alias="MINIO_ENDPOINT")
    minio_port: str = Field(default="9000", validation_alias="MINIO_PORT")
    minio_root_user: str = Field(default="", validation_alias="MINIO_ROOT_USER")
    minio_root_password: str = Field(default="", validation_alias="MINIO_ROOT_PASSWORD")
    minio_missions_bucket: str = Field(
        default="mission-videos", validation_alias="MINIO_MISSIONS_BUCKET"
    )


settings = Settings()
