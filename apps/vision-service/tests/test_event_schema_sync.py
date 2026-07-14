"""REQ-3.4: fails CI the moment the JSON Schema envelope/payload
definitions (packages/event-schemas/src/schemas), the TS field-name
constants (packages/event-schemas/src/envelope.ts, src/payloads.ts) and
this service's Pydantic models (vision_service.events) drift apart. This
is the "kept in sync by a CI check, not by convention alone" requirement
— see docs/adr/ADR-005-event-schema-versioning.md.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from vision_service.events.envelope import EventEnvelope
from vision_service.events.payloads import (
    DeadLetterPayload,
    MissionProcessingRequestedPayload,
    ProcessingCompletedPayload,
    ProcessingFailedPayload,
    ProcessingStartedPayload,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMAS_DIR = REPO_ROOT / "packages" / "event-schemas" / "src" / "schemas"
ENVELOPE_TS_SOURCE = (REPO_ROOT / "packages" / "event-schemas" / "src" / "envelope.ts").read_text()
PAYLOADS_TS_SOURCE = (REPO_ROOT / "packages" / "event-schemas" / "src" / "payloads.ts").read_text()


def _schema_field_names(filename: str) -> set[str]:
    schema = json.loads((SCHEMAS_DIR / filename).read_text())
    return set(schema["properties"].keys())


def _ts_field_names(ts_source: str, const_name: str) -> set[str]:
    match = re.search(rf"{const_name}\s*=\s*\[(.*?)\]\s*as const", ts_source, re.DOTALL)
    assert match, f"could not find {const_name} in TS source"
    return {item.strip().strip('"') for item in match.group(1).split(",") if item.strip()}


def _pydantic_field_names(model: type) -> set[str]:
    return set(model.model_fields.keys())


def test_envelope_schema_matches_ts_and_pydantic() -> None:
    schema_fields = _schema_field_names("event-envelope.schema.json")
    ts_fields = _ts_field_names(ENVELOPE_TS_SOURCE, "ENVELOPE_FIELD_NAMES")
    py_fields = _pydantic_field_names(EventEnvelope)

    assert schema_fields == ts_fields, (schema_fields, ts_fields)
    assert schema_fields == py_fields, (schema_fields, py_fields)


PAYLOAD_CASES = [
    (
        "mission-processing-requested.schema.json",
        "MISSION_PROCESSING_REQUESTED_FIELD_NAMES",
        MissionProcessingRequestedPayload,
    ),
    ("processing-started.schema.json", "PROCESSING_STARTED_FIELD_NAMES", ProcessingStartedPayload),
    (
        "processing-completed.schema.json",
        "PROCESSING_COMPLETED_FIELD_NAMES",
        ProcessingCompletedPayload,
    ),
    ("processing-failed.schema.json", "PROCESSING_FAILED_FIELD_NAMES", ProcessingFailedPayload),
    ("dead-letter.schema.json", "DEAD_LETTER_FIELD_NAMES", DeadLetterPayload),
]


@pytest.mark.parametrize(("schema_file", "ts_const", "model"), PAYLOAD_CASES)
def test_payload_schema_matches_ts_and_pydantic(
    schema_file: str, ts_const: str, model: type
) -> None:
    schema_fields = _schema_field_names(schema_file)
    ts_fields = _ts_field_names(PAYLOADS_TS_SOURCE, ts_const)
    py_fields = _pydantic_field_names(model)

    assert schema_fields == ts_fields, (schema_file, schema_fields, ts_fields)
    assert schema_fields == py_fields, (schema_file, schema_fields, py_fields)
