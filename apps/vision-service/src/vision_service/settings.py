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
    # Phase 8 (docs/mvp-plan/PRD-Phase-8.md REQ-8.9): same bucket name
    # apps/api's StorageService.getModelsBucket() defaults to — the
    # training script (training/train.py's publish_training_run())
    # uploads exported `.onnx` artifacts here directly, the same
    # "each service credentials its own MinIO client against a shared
    # bucket name" pattern minio_missions_bucket already established.
    minio_models_bucket: str = Field(
        default="models", validation_alias="MINIO_MODELS_BUCKET"
    )

    # Phase 5 (REQ-5.2/5.3): VISION_SERVICE_-prefixed since these are
    # vision-service-specific, unlike KAFKA_BROKERS/MINIO_* above which
    # apps/api also reads. detection_model_path defaults to "" (not a
    # hard failure at settings-construction time) — the same "disabled,
    # not broken" pattern as kafka_brokers/minio_root_user:
    # detection.factory.build_detector() falls back to
    # NullDetectorAdapter (zero detections, pipeline still runs)
    # instead of crashing the app. See
    # docs/adr/ADR-006-detection-model-and-tracker.md.
    detection_model_path: str = Field(default="")
    detection_confidence_threshold: float = Field(default=0.35, ge=0.0, le=1.0)
    detection_input_size: int = Field(default=640, gt=0)

    # Phase 8 (docs/mvp-plan/PRD-Phase-8.md REQ-8.7/8.9/8.10,
    # docs/adr/ADR-008-experiment-tracking-and-dataset-versioning.md):
    # the in-house model registry `training/registry_client.py` talks
    # to, and `detection/factory.py` queries for the current production
    # model when `detection_model_path` is unset. Both default to ""
    # (not a hard failure at settings-construction time) — same
    # "disabled, not broken" pattern as kafka_brokers/minio_root_user
    # above: an unconfigured registry means "resolve to
    # NullDetectorAdapter," not a startup crash.
    model_registry_base_url: str = Field(default="")
    model_registry_api_token: str = Field(default="")
    # Local path `detection/factory.py` downloads a registry-resolved
    # production model to before constructing OnnxDetectorAdapter —
    # mirrors commands_consumer.py's use of a local temp path for a
    # MinIO-downloaded video (REQ-4.10), same download-then-load shape.
    model_registry_local_cache_path: str = Field(
        default="/tmp/vision-service-production-model.onnx"
    )


settings = Settings()
