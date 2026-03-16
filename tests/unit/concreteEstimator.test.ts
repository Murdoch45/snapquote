import { describe, expect, it } from "vitest";
import { estimateConcrete } from "@/estimators/concreteEstimator";
import type { EstimatorContext } from "@/estimators/shared";

function buildContext(answers: Record<string, string>): EstimatorContext {
  return {
    request: {
      service: "Concrete",
      answers
    },
    propertyData: {
      formattedAddress: "123 Test St",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      lotSizeSqft: 6000,
      houseSqft: 1800,
      estimatedBackyardSqft: 4000,
      travelDistanceMiles: 8,
      lotSizeSource: "lead_parcel",
      houseSqftSource: "lot_coverage_estimate",
      locationSource: "address_geocode"
    },
    regionalModel: {
      key: "national-default",
      label: "National Default",
      costTier: "NATIONAL_DEFAULT",
      regionalMultiplier: 1,
      typicalLotSqft: 7200,
      minimumJobPrice: 300,
      retainingWallPerLinearFoot: { low: 150, high: 350, target: 240 },
      paverWalkwayPerSqft: { low: 20, high: 40, target: 30 },
      patioPerSqft: { low: 25, high: 50, target: 38 },
      gradingPerSqft: { low: 5, high: 12, target: 8 },
      landscapingAllowance: { low: 1500, high: 5000, target: 2800 },
      irrigationAllowance: { low: 1200, high: 4000, target: 2200 },
      firePitAllowance: { low: 1500, high: 4000, target: 2600 },
      fencePerLinearFoot: { low: 28, high: 75, target: 46 },
      deckPerSqft: { low: 35, high: 90, target: 58 },
      cleaningPerSqft: { low: 0.15, high: 0.35, target: 0.24 },
      demolitionAllowance: { low: 500, high: 4000, target: 1600 },
      outdoorLivingAllowance: { low: 6000, high: 20000, target: 11000 }
    },
    description: "Need a medium decorative patio replacement.",
    photoCount: 2,
    signals: {
      summary: "",
      condition: "light",
      access: "easy",
      severity: "minor",
      debris: "none",
      multipleAreas: false,
      materialHint: null,
      inferredScope: null,
      treeSize: "small",
      estimatedWindowCount: null,
      estimatedPoolSqft: null,
      estimatedFixtureCount: null,
      estimatedJunkCubicYards: null,
      internalConfidence: 70,
      pricingDrivers: [],
      estimatorNotes: []
    }
  };
}

describe("estimateConcrete", () => {
  it("uses the canonical subtype path and produces an area-based scope", () => {
    const estimate = estimateConcrete(
      buildContext({
        concrete_project_type: "Patio",
        concrete_work_type: "Replacement",
        concrete_material: "Stamped or decorative concrete",
        concrete_scope: "Medium (~200-600 sq ft)",
        concrete_site_condition: "Existing concrete needs removal"
      })
    );

    expect(estimate.jobType).toBe("patio");
    expect(estimate.scopeSummary).toContain("sqft of concrete scope");
    expect(estimate.snapQuote).toBeGreaterThan(estimate.lowEstimate - 1);
    expect(estimate.lineItems.material_adjustment).toBeGreaterThan(0);
  });

  it("prices repair/resurfacing below a similarly sized new installation", () => {
    const repairEstimate = estimateConcrete(
      buildContext({
        concrete_project_type: "Walkway",
        concrete_work_type: "Repair or resurfacing",
        concrete_material: "Standard concrete",
        concrete_scope: "Medium (~200-600 sq ft)",
        concrete_site_condition: "Open and ready"
      })
    );
    const newInstallEstimate = estimateConcrete(
      buildContext({
        concrete_project_type: "Walkway",
        concrete_work_type: "New installation",
        concrete_material: "Standard concrete",
        concrete_scope: "Medium (~200-600 sq ft)",
        concrete_site_condition: "Open and ready"
      })
    );

    expect(repairEstimate.jobType).toBe("repair_resurfacing");
    expect(repairEstimate.snapQuote).toBeLessThan(newInstallEstimate.snapQuote);
  });
});
