import { describe, expect, it } from "vitest";
import {
  computeTravelCost,
  resolveRegionalCostModel,
  TRAVEL_DISTANCE_CAP_MILES
} from "../../lib/ai/cost-models";
import { regionalMultiplier } from "../../estimators/shared";

describe("resolveRegionalCostModel — unified region lookup", () => {
  it("matches a city model when city + state are present", () => {
    const nyc = resolveRegionalCostModel({ city: "New York", state: "NY" });
    expect(nyc.key).toBe("new-york-city-ny");
    expect(nyc.regionalMultiplier).toBe(1.38);
  });

  it("is case-insensitive on city and accepts full state names", () => {
    const sf = resolveRegionalCostModel({ city: "SAN FRANCISCO", state: "California" });
    expect(sf.key).toBe("san-francisco-ca");
    expect(sf.regionalMultiplier).toBe(1.3);
  });

  it("treats each NYC borough as its own city entry", () => {
    expect(resolveRegionalCostModel({ city: "Brooklyn", state: "NY" }).regionalMultiplier).toBe(1.38);
    expect(resolveRegionalCostModel({ city: "Bronx", state: "NY" }).regionalMultiplier).toBe(1.35);
  });

  it("falls back to the state model when the city is unknown", () => {
    const upstate = resolveRegionalCostModel({ city: "Buffalo", state: "NY" });
    expect(upstate.key).toBe("ny-state");
    expect(upstate.regionalMultiplier).toBe(1.18);
  });

  it("falls back to national default when state has no model", () => {
    const model = resolveRegionalCostModel({ city: "Boise", state: "ID" });
    expect(model.key).toBe("national-default");
    expect(model.regionalMultiplier).toBe(1);
  });

  it("ignores ZIP code entirely — there is no ZIP matching anymore", () => {
    // 90001 is a Los Angeles ZIP but the city is deliberately missing; should fall to CA state.
    const noCity = resolveRegionalCostModel({ city: null, state: "CA", zipCode: "90001" });
    expect(noCity.key).toBe("ca-state");
    expect(noCity.regionalMultiplier).toBe(1.15);
  });
});

describe("regionalMultiplier clamp", () => {
  it("never returns below 1.0", () => {
    expect(regionalMultiplier({ ...resolveRegionalCostModel({ state: "ID" }), regionalMultiplier: 0.6 })).toBe(1);
  });

  it("caps at 1.45", () => {
    expect(regionalMultiplier({ ...resolveRegionalCostModel({ state: "NY" }), regionalMultiplier: 1.9 })).toBe(1.45);
  });

  it("passes through values inside the band", () => {
    expect(regionalMultiplier(resolveRegionalCostModel({ city: "New York", state: "NY" }))).toBe(1.38);
  });
});

describe("computeTravelCost — per-mile regional formula", () => {
  const nyc = resolveRegionalCostModel({ city: "New York", state: "NY" }).regionalMultiplier;
  const rural = resolveRegionalCostModel({ state: "ID" }).regionalMultiplier;

  it("returns 0 for null or sub-10-mile leads", () => {
    expect(computeTravelCost(null, nyc)).toBe(0);
    expect(computeTravelCost(0, nyc)).toBe(0);
    expect(computeTravelCost(9, nyc)).toBe(0);
    expect(computeTravelCost(10, nyc)).toBe(0);
  });

  it("scales with distance and region", () => {
    expect(computeTravelCost(20, rural)).toBe(20 * 2.5 * 1);
    expect(computeTravelCost(20, nyc)).toBeCloseTo(20 * 2.5 * 1.38, 5);
  });

  it("caps mileage at the service radius", () => {
    const atCap = computeTravelCost(TRAVEL_DISTANCE_CAP_MILES, nyc);
    const beyondCap = computeTravelCost(TRAVEL_DISTANCE_CAP_MILES + 500, nyc);
    expect(atCap).toBeCloseTo(TRAVEL_DISTANCE_CAP_MILES * 2.5 * 1.38, 5);
    expect(beyondCap).toBe(atCap);
  });
});
