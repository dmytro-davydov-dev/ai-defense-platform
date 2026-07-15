# datasets/

Local scratch space for dataset content used by
`docs/mvp-plan/PRD-Phase-8.md`'s dataset registry and training pipeline
— not a permanent store.

Per `docs/architecture/Repository_Structure.md`: **datasets are not
committed to this repository** unless explicitly licensed and small
(this folder's `.gitkeep` is the only thing tracked by git). Real
dataset content lives in MinIO, under the `datasets` bucket
(`MINIO_DATASETS_BUCKET`, see `.env.example`), addressed by the
`storageLocation` field recorded when a dataset is registered via
`POST /datasets` (`apps/api`'s `DatasetsModule`,
`docs/adr/ADR-008-experiment-tracking-and-dataset-versioning.md`).

Use this folder locally (git-ignored, except this README and
`.gitkeep`) as a staging area when preparing a dataset before uploading
it to MinIO and registering it — nothing in `apps/api` or
`apps/vision-service` reads from this path directly.
