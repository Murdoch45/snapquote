import { describe, expect, it } from "vitest";
import { getPlanUsageLimit, getWarningAt90 } from "../../lib/usage";

describe("getPlanUsageLimit", () => {
  // Plans currently run without a grace tier — the monthly credit count
  // is both the soft limit and the hard stop. Keeping limit === hardStopAt
  // lets UpgradeBanner render "Usage: X/Y (hard stop at Y)" coherently.
  it("returns solo limit", () => {
    expect(getPlanUsageLimit("SOLO")).toEqual({ limit: 5, grace: 0, hardStopAt: 5 });
  });

  it("returns team limit", () => {
    expect(getPlanUsageLimit("TEAM")).toEqual({ limit: 20, grace: 0, hardStopAt: 20 });
  });

  it("returns business limit", () => {
    expect(getPlanUsageLimit("BUSINESS")).toEqual({ limit: 100, grace: 0, hardStopAt: 100 });
  });
});

describe("getWarningAt90", () => {
  it("returns false when limit is null", () => {
    expect(getWarningAt90(null, 1000)).toBe(false);
  });

  it("returns false below 90% of limit", () => {
    expect(getWarningAt90(100, 89)).toBe(false);
  });

  it("returns true at 90% of limit", () => {
    expect(getWarningAt90(100, 90)).toBe(true);
  });

  it("returns true above 90% of limit", () => {
    expect(getWarningAt90(100, 99)).toBe(true);
  });

  it("returns true at the hard cap", () => {
    expect(getWarningAt90(100, 100)).toBe(true);
  });

  it("uses ceiling for small limits so SOLO trips at the cap", () => {
    // SOLO: 5 * 0.9 = 4.5, ceil = 5 — the warning and the hard stop
    // fire at the same moment for SOLO, which is expected given the
    // small denominator.
    expect(getWarningAt90(5, 4)).toBe(false);
    expect(getWarningAt90(5, 5)).toBe(true);
  });
});
