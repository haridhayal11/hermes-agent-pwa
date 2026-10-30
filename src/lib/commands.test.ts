import { describe, expect, it } from "vitest";
import { COMMAND_CATALOGUE, findCatalogued, parseCommand, SLASH_COMMANDS } from "./commands";

describe("slash commands", () => {
  it("dispatches the promoted commands with their arguments", () => {
    expect(parseCommand("/approve always")).toMatchObject({
      command: { id: "approve" },
      rest: "always",
    });
    expect(parseCommand("/deny all")).toMatchObject({ command: { id: "deny" }, rest: "all" });
    expect(parseCommand("/v")).toMatchObject({ command: { id: "version" } });
    expect(parseCommand("/save json")).toMatchObject({ command: { id: "save" }, rest: "json" });
    expect(parseCommand("/resume Daily notes")).toMatchObject({
      command: { id: "resume" },
      rest: "Daily notes",
    });
    expect(parseCommand("/diff")).toMatchObject({ command: { id: "diff" } });
  });

  it("never lists a command as both runnable and catalogued", () => {
    for (const command of SLASH_COMMANDS) {
      expect(findCatalogued(command.name)).toBeUndefined();
      for (const alias of command.aliases ?? []) expect(findCatalogued(alias)).toBeUndefined();
    }
    expect(SLASH_COMMANDS).toHaveLength(19);
    expect(COMMAND_CATALOGUE.filter((c) => c.reason === "unbuilt").map((c) => c.name)).toEqual([
      "/moa",
      "/reasoning",
      "/fast",
      "/usage",
    ]);
  });

  it("still explains a real command it can't run", () => {
    expect(parseCommand("/compress")).toBeNull();
    expect(findCatalogued("/compress")).toMatchObject({ reason: "no-api" });
  });
});
