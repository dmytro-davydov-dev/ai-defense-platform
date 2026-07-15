# models/

Local scratch space for exported `.onnx` model artifacts produced by
`docs/mvp-plan/PRD-Phase-8.md`'s training pipeline
(`apps/vision-service/src/vision_service/training/train.py`) — not a
permanent store.

Per `docs/architecture/Repository_Structure.md`: **model binaries are
not committed to this repository** unless explicitly licensed and small
(this folder's `.gitkeep` is the only thing tracked by git). Real model
artifacts live in MinIO, under the `models` bucket
(`MINIO_MODELS_BUCKET`, see `.env.example`), addressed by the
`objectKey` field recorded when a model version is registered via
`POST /models` (`apps/api`'s `ModelRegistryModule`).

`apps/vision-service`'s training script writes its local, pre-upload
export here (or to a configured output directory) before uploading to
MinIO and registering it — nothing in `apps/api` reads from this path
directly. The model currently loaded by a running `vision-service`
instance is a separate, single local file at
`VISION_SERVICE_MODEL_REGISTRY_LOCAL_CACHE_PATH`'s configured path
(default `/tmp/vision-service-production-model.onnx`), downloaded from
the registry's current production version at startup — see
`detection/factory.py`.
