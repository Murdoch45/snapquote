import { describe, expect, it } from "vitest";
import { resolveRegion } from "../../lib/location/resolveRegion";

describe("resolveRegion", () => {
  it("maps bay area California addresses to san_francisco", () => {
    expect(
      resolveRegion({
        formattedAddress: "1 Market St, San Francisco, CA 94105",
        city: "San Francisco",
        state: "CA",
        zipCode: "94105"
      })
    ).toBe("san_francisco");
  });

  it("maps other California addresses to los_angeles", () => {
    expect(
      resolveRegion({
        formattedAddress: "123 Main St, Los Angeles, CA 90012",
        city: "Los Angeles",
        state: "CA",
        zipCode: "90012"
      })
    ).toBe("los_angeles");
  });

  it("maps supported non-California states and defaults unknown states", () => {
    expect(
      resolveRegion({
        formattedAddress: "50 W Washington St, Chicago, IL 60602",
        city: "Chicago",
        state: "IL",
        zipCode: "60602"
      })
    ).toBe("chicago");

    expect(
      resolveRegion({
        formattedAddress: "200 Congress Ave, Austin, TX 78701",
        city: "Austin",
        state: "TX",
        zipCode: "78701"
      })
    ).toBe("default");
  });
});
