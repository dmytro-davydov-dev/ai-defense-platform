"""Kafka topic taxonomy, Python mirror of
packages/event-schemas/src/topics.ts (PRD-Phase-3 REQ-3.1/3.2).
"""

from __future__ import annotations


class Topics:
    COMMANDS = "aidefense.commands"
    PROCESSING_EVENTS = "aidefense.processing-events"
    DETECTIONS = "aidefense.detections"
    TELEMETRY = "aidefense.telemetry"
    AUDIT = "aidefense.audit"
    DEVICE_EVENTS = "aidefense.device-events"
    DEAD_LETTER = "aidefense.dead-letter"


# REQ-3.2: these topics use the mission ID as the Kafka partition key.
MISSION_SCOPED_TOPICS = (Topics.COMMANDS, Topics.PROCESSING_EVENTS, Topics.DETECTIONS)
