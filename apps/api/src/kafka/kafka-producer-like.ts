/**
 * Minimal surface this module needs from kafkajs's `Producer` — narrowed
 * to an interface so handler logic is unit-testable without a real
 * broker connection (same pattern as apps/outbox-publisher/src/kafka.ts).
 */
export interface KafkaProducerLike {
  send(record: {
    topic: string;
    messages: {
      key: string;
      value: string;
      headers?: Record<string, string>;
    }[];
  }): Promise<unknown>;
}
