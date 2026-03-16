import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPropertyData } from "@/lib/property-data";

const originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
const originalFetch = global.fetch;

describe("getPropertyData", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
    global.fetch = originalFetch;
  });

  it("uses parcel data before any fallback estimate", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "";

    const propertyData = await getPropertyData({
      address: "123 Main St",
      parcelLotSizeSqft: 3358
    });

    expect(propertyData.lotSizeSqft).toBe(3358);
    expect(propertyData.lotSizeSource).toBe("parcel_data");
  });

  it("uses a solar-derived lot estimate before the regional fallback", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              formatted_address: "123 Solar St",
              address_components: [
                { long_name: "Los Angeles", types: ["locality"] },
                { long_name: "CA", types: ["administrative_area_level_1"] },
                { long_name: "90012", types: ["postal_code"] }
              ]
            }
          ]
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          solarPotential: {
            buildingStats: {
              groundAreaMeters2: 1200 / 10.7639
            }
          }
        })
      } as Response);

    const propertyData = await getPropertyData({
      address: "123 Solar St",
      lat: 34.05,
      lng: -118.24
    });

    expect(propertyData.houseSqft).toBe(1200);
    expect(propertyData.lotSizeSource).toBe("solar_estimate");
    expect(propertyData.lotSizeSqft).toBeGreaterThan(2500);
    expect(propertyData.lotSizeSqft).toBeLessThan(4500);
  });
});
