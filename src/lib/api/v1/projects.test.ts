import { describe, expect, it, vi } from "vitest";

vi.mock("./http", () => ({
  fromLegacy: vi.fn(),
  json: vi.fn(),
}));

import { projectDto } from "./projects";

describe("projectDto", () => {
  it("keeps options when the project follows the gateway default", () => {
    const project = projectDto({
      id: "p",
      name: "Project",
      emoji: null,
      color: null,
      cwd: null,
      instructions: null,
      pinned: 0,
      skills: null,
      model: null,
      provider: null,
      model_options: JSON.stringify({
        reasoning: { enabled: true, effort: "medium" },
      }),
      session_id: "s",
      created_at: 1,
      last_active_at: 2,
      archived: 0,
    });

    expect(project.modelSelection).toEqual({
      model: null,
      provider: null,
      options: { reasoning: { enabled: true, effort: "medium" } },
    });
  });
});
