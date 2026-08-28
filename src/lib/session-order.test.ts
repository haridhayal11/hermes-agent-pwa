import { describe, expect, it } from "vitest";
import type { ProjectSession } from "./chat-types";
import { sessionsRecentFirst } from "./session-order";

function session(
  id: string,
  lastActiveAt: number,
  createdAt: number,
): ProjectSession {
  return {
    session_id: id,
    project_id: "project",
    title: "Same title",
    parent_session_id: null,
    created_at: createdAt,
    last_active_at: lastActiveAt,
    archived: 0,
    kind: "chat",
  };
}

describe("sessionsRecentFirst", () => {
  it("keeps duplicate titles distinct and orders them by recent activity", () => {
    const old = session("session-old", 10, 1);
    const recent = session("session-recent", 30, 2);

    expect(sessionsRecentFirst([old, recent])).toEqual([recent, old]);
  });

  it("uses creation time and then the durable id as deterministic tie-breakers", () => {
    const first = session("session-a", 20, 5);
    const second = session("session-b", 20, 6);
    const third = session("session-c", 20, 6);

    expect(sessionsRecentFirst([third, first, second])).toEqual([
      second,
      third,
      first,
    ]);
  });

  it("does not mutate the API-owned input list", () => {
    const old = session("session-old", 10, 1);
    const recent = session("session-recent", 30, 2);
    const input = [old, recent];

    sessionsRecentFirst(input);

    expect(input).toEqual([old, recent]);
  });
});
