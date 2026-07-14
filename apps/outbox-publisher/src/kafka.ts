/**
 * Minimal surface this package needs from kafkajs's `Producer` — see
 * db.ts's header comment for why these adapters are narrowed to an
 * interface rather than importing the library types directly into the
 * poller module.
 */
export interface KafkaMessage {
  readonly key: string;
  readonly value: string;
  readonly headers: Record<string, string>;
}

export interface KafkaProducerLike {
  send(record: { topic: string; messages: KafkaMessage[] }): Promise<unknown>;
}
