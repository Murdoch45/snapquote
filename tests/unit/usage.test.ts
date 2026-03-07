import { describe, expect, it } from "vitest";
import { getPlanUsageLimit } from "../../lib/usage";

describe("usage limits", () => {
  it("returns solo limit and grace", () => {
    expect(getPlanUsageLimit("SOLO")).toEqual({
      limit: 50,
      grace: 5,
      hardStopAt: 55
    });
  });

  it("returns team limit and grace", () => {
    expect(getPlanUsageLimit("TEAM")).toEqual({
      limit: 150,
      grace: 5,
      hardStopAt: 155
    });
  });

  it("returns unlimited business", () => {
    expect(getPlanUsageLimit("BUSINESS")).toEqual({
      limit: null,
      grace: 0,
      hardStopAt: null
    });
  });
});
