import { describe, expect, it } from "vitest";
import { composeInstructions } from "./instructions";

describe("project instructions", () => {
  it("declares the generated-response Markdown contract", () => {
    const instructions = composeInstructions({
      name: "Test",
      outboxDir: "/tmp/hermes-test",
    });

    expect(instructions).toContain("This chat renders Markdown");
    expect(instructions).toContain("plain text is also rendered normally");
    expect(instructions).toContain("Do not use headings, tables, blockquotes, raw HTML");
  });
});
