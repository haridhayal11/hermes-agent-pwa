import { describe, expect, it } from "vitest";
import { titleFromPrompt } from "./session-title";

describe("titleFromPrompt", () => {
  it("uses the first nonblank line and normalizes whitespace", () => {
    expect(titleFromPrompt("\n   Build   the Android client \nignore me"))
      .toBe("Build the Android client");
  });

  it("limits titles to sixty characters", () => {
    expect(titleFromPrompt("x".repeat(80))).toBe("x".repeat(60));
  });

  it("does not name a session from blank input", () => {
    expect(titleFromPrompt(" \n\t")).toBeNull();
  });
});
