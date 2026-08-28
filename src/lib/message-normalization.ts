import type { CronDelivery } from "./cron-watcher";
import type { HermesMessage } from "./hermes";

function messageTime(message: HermesMessage): number | null {
  const raw = message.timestamp;
  if (typeof raw === "number") return raw < 1e12 ? raw * 1000 : raw;
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** Canonical shape promised by /api/v1, while tolerating older Hermes hosts. */
export function normalizeMessage(message: HermesMessage): HermesMessage {
  if (message.id === undefined) return message;
  return { ...message, id: String(message.id) };
}

function deliveryMessage(delivery: CronDelivery): HermesMessage {
  return {
    id: delivery.id,
    role: "cron",
    content: delivery.body,
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
): HermesMessage[] {
  const normalized = messages.map(normalizeMessage);
  if (deliveries.length === 0) return normalized;

  const out: HermesMessage[] = [];
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
