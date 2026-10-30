import { describe, expect, it } from "vitest";
import { normalizeUpstreamEvent, promptRef, promptResponseBody } from "./run-events";

describe("normalizeUpstreamEvent", () => {
  it("reads a gateway shutdown as a failed run with its reason", () => {
    expect(
      normalizeUpstreamEvent({ event: "run.interrupted", run_id: "r", error: "Gateway shutdown interrupted the run." }),
    ).toMatchObject({ event: "run.failed", run_id: "r", interrupted: true, error: "Gateway shutdown interrupted the run." });
    expect(normalizeUpstreamEvent({ event: "run.interrupted" }).error).toBeTruthy();
  });

  it("reads approval.settled as approval.responded, keeping the prompt id", () => {
    expect(
      normalizeUpstreamEvent({ event: "approval.settled", prompt_id: "p1", execution_generation: 3 }),
    ).toEqual({ event: "approval.responded", prompt_id: "p1", execution_generation: 3, resolved: true });
  });

  it("passes everything else through untouched", () => {
    const event = { event: "clarify.request", question: "Which?" };
    expect(normalizeUpstreamEvent(event)).toBe(event);
  });
});

describe("prompt references", () => {
  it("needs both the id and an integer generation", () => {
    expect(promptRef({ prompt_id: "p", execution_generation: 2 })).toEqual({ requestId: "p", generation: 2 });
    expect(promptRef({ prompt_id: "p" })).toBeNull();
    expect(promptRef({ prompt_id: "p", execution_generation: "2" })).toBeNull();
    expect(promptRef({ execution_generation: 2 })).toBeNull();
  });

  it("sends exactly the authority key set when there is a reference", () => {
    expect(promptResponseBody({ requestId: "p", generation: 2 }, "choice", "once", { all: true })).toEqual({
      request_id: "p",
      execution_generation: 2,
      choice: "once",
    });
  });

  it("falls back to the legacy body without one", () => {
    expect(promptResponseBody(null, "choice", "deny", { all: true })).toEqual({ choice: "deny", all: true });
    expect(promptResponseBody(null, "answer", "yes")).toEqual({ answer: "yes" });
  });
});
