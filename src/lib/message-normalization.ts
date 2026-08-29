import type { CronDelivery } from "./cron-watcher";
import type { MessageContentFormat } from "./chat-types";
import type { HermesMessage } from "./hermes";

export type NormalizedMessage = HermesMessage & {
  content_format: MessageContentFormat;
};

export function messageContentFormat(message: HermesMessage): MessageContentFormat {
  if (message.content_format === "plain" || message.content_format === "markdown") {
    return message.content_format;
  }
  return message.role === "assistant" || message.role === "cron" ? "markdown" : "plain";
}

function messageTime(message: HermesMessage): number | null {
  const raw = message.timestamp;
  if (typeof raw === "number") return raw < 1e12 ? raw * 1000 : raw;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Canonical shape promised by our APIs; upstream Hermes has no presentation field. */
export function normalizeMessage(message: HermesMessage): NormalizedMessage {
  return {
    ...message,
    ...(message.id === undefined ? {} : { id: String(message.id) }),
    content_format: messageContentFormat(message),
  };
}

function deliveryMessage(delivery: CronDelivery): NormalizedMessage {
  return {
    id: delivery.id,
    role: "cron",
    content: delivery.body,
    content_format: "markdown",
    cron: {
      jobId: delivery.job_id,
      jobName: delivery.job_name,
      status: delivery.status,
      ts: delivery.ts,
    },
  };
}

export function mergeProjectMessages(
  messages: HermesMessage[],
  deliveries: CronDelivery[],
): NormalizedMessage[] {
  const normalized = messages.map(normalizeMessage);
  if (deliveries.length === 0) return normalized;

  const out: NormalizedMessage[] = [];
  let next = 0;
  for (const message of normalized) {
    const at = messageTime(message);
    if (at !== null) {
      while (next < deliveries.length && deliveries[next].ts <= at) {
        out.push(deliveryMessage(deliveries[next]));
        next += 1;
      }
    }
    out.push(message);
  }
  for (; next < deliveries.length; next += 1) {
    out.push(deliveryMessage(deliveries[next]));
  }
  return out;
}
