"""Startup configuration, sourced from environment variables / .env.

Per docs/mvp-plan/PRD-Phase-1.md REQ-1.18, no secrets are hardcoded.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="VISION_SERVICE_", env_file=".env")

    service_name: str = "vision-service"
    port: int = 8000
    log_level: str = "info"


settings = Settings()
