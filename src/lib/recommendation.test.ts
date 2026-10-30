import { describe, expect, it } from "vitest";
import { extractQuestion, parseRecommendation } from "./recommendation";

const card = (body: object) => "```hermes-recommend\n" + JSON.stringify(body) + "\n```";

describe("recommendation parsing", () => {
  it("finds the last question a message ends on", () => {
    const first = { kind: "question", title: "First?", actions: [{ label: "A", reply: "a" }] };
    const second = { kind: "question", title: "Second?", actions: [{ label: "B" }] };
    expect(extractQuestion(`Hi.\n${card(first)}\nAnd also:\n${card(second)}`)).toEqual({
      kind: "question",
      title: "Second?",
      rationale: undefined,
      confidence: undefined,
      actions: [{ label: "B", reply: "B" }],
    });
  });

  it("is not a question when it is advice, has no actions, or is malformed", () => {
    const advice = { kind: "recommendation", title: "Do X", confidence: 0.8, actions: [{ label: "Ok" }] };
    expect(extractQuestion(card(advice))).toBeNull();
    expect(extractQuestion(card({ kind: "question", title: "No buttons", actions: [] }))).toBeNull();
    expect(extractQuestion("```hermes-recommend\n{not json\n```")).toBeNull();
    expect(parseRecommendation(JSON.stringify({ actions: [] }))).toBeNull();
  });
});
