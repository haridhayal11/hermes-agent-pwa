import { describe, expect, it } from "vitest";
import { hermesVersion } from "./hermes-version";

describe("hermesVersion", () => {
  it("prefers /health, then capabilities, then one level of nesting", () => {
    expect(hermesVersion({ status: "ok", version: "0.20.5" }, { version: "x" })).toBe("0.20.5");
    expect(hermesVersion({ status: "ok" }, { hermes_version: "0.21.0" })).toBe("0.21.0");
    expect(hermesVersion(null, { server: { version: "0.19.1" } })).toBe("0.19.1");
  });

  it("reports nothing rather than guessing", () => {
    expect(hermesVersion({ status: "ok" }, { features: {} })).toBeNull();
    expect(hermesVersion(null, null)).toBeNull();
  });
});
