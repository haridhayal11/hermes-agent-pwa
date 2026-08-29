import { describe, expect, it } from "vitest";
import { markdownToPlainText } from "./markdown";

describe("Markdown notification projection", () => {
  it("unwraps generated formatting without losing its content", () => {
    expect(
      markdownToPlainText(
        "## Daily\n\n- **Calories:** `330 kcal`\n- [Details](https://example.com)",
      ),
    ).toBe("Daily Calories: 330 kcal Details");
  });

  it("drops fenced payloads and keeps image alt text", () => {
    expect(
      markdownToPlainText(
        "Finished.\n```json\n{\"private\":true}\n```\n![Chart](https://example.com/chart.png)",
      ),
    ).toBe("Finished. Chart");
  });
});
