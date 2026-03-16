import { describe, expect, it } from "vitest";
import { fallbackEstimate } from "../../lib/ai/estimate";
import type { AiEstimatorSignals, CanonicalService, NormalizedServiceSignal } from "../../estimators/shared";

function buildBaseSignals(
  serviceType: CanonicalService,
  overrides: Partial<NormalizedServiceSignal>
): AiEstimatorSignals {
  return {
    summary: "Stable estimator repeatability test.",
    condition: "moderate",
    access: "easy",
    severity: "moderate",
    debris: "light",
    multipleAreas: false,
    materialHint: "concrete",
    inferredScope: "standard residential scope",
    treeSize: "medium",
    estimatedWindowCount: null,
    estimatedPoolSqft: null,
    estimatedFixtureCount: null,
    estimatedJunkCubicYards: null,
    internalConfidence: 76,
    pricingDrivers: ["Questionnaire anchor", "Property hint"],
    estimatorNotes: ["Testing repeatability."],
    imageQuality: 68,
    scopeMatchConfidence: 76,
    satelliteClarity: 82,
    surfaceDetectionConfidence: 74,
    serviceSignals: {
      [serviceType]: {
        serviceType,
        ...overrides
      }
    }
  };
}

describe("estimator repeatability", () => {
  it("keeps inferred concrete runs tightly clustered when AI quantity drifts modestly", () => {
    const input = {
      businessName: "Demo Concrete",
      services: ["Concrete"],
      serviceQuestionAnswers: [
        {
          service: "Concrete" as const,
          answers: {
            concrete_project_type: "Driveway",
            concrete_work_type: "Replacement",
            concrete_material: "Standard concrete",
            concrete_scope: "Large (~600-1,500 sq ft)",
            concrete_site_condition: "Existing concrete needs removal"
          }
        }
      ],
      address: "123 Main St",
      lat: 34.05,
      lng: -118.25,
      description: "Replace the entire driveway.",
      photoUrls: ["https://example.com/driveway.jpg"]
    };
    const propertyData = {
      formattedAddress: "123 Main St, Los Angeles, CA 90012",
      city: "Los Angeles",
      state: "CA",
      zipCode: "90012",
      lotSizeSqft: 6400,
      houseSqft: 1800,
      estimatedBackyardSqft: 3800,
      travelDistanceMiles: 4,
      lotSizeSource: "parcel_data" as const,
      houseSqftSource: "solar_building_ground_area" as const,
      locationSource: "reverse_geocode" as const
    };

    const runs = [980, 1030, 1080].map((quantity) =>
      fallbackEstimate(
        input,
        propertyData,
        buildBaseSignals("Concrete", {
          jobSubtype: "driveway",
          workType: "replace",
          fallbackFamily: "flat_hardscape",
          estimatedQuantity: quantity,
          quantityUnit: "sqft",
          quantityEvidence: "strong_inference",
          consistencyScore: 79,
          aiConfidence: 77
        })
      )
    );

    const quantities = runs.map((run) => run.serviceEstimates[0].scope_reconciliation?.reconciledQuantity ?? 0);
    const prices = runs.map((run) => run.snapQuote);
    const confidences = runs.map((run) => run.confidenceScore);

    expect(Math.max(...quantities) - Math.min(...quantities)).toBeLessThanOrEqual(100);
    expect(Math.max(...prices) - Math.min(...prices)).toBeLessThanOrEqual(500);
    expect(Math.max(...confidences) - Math.min(...confidences)).toBeLessThanOrEqual(0.02);
  });

  it("uses direct customer dimensions to collapse variable AI proposals into the same concrete scope", () => {
    const input = {
      businessName: "Demo Concrete",
      services: ["Concrete"],
      serviceQuestionAnswers: [
        {
          service: "Concrete" as const,
          answers: {
            concrete_project_type: "Patio",
            concrete_work_type: "New installation",
            concrete_material: "Standard concrete",
            concrete_scope: "Medium (~200-600 sq ft)",
            concrete_site_condition: "Open and ready"
          }
        }
      ],
      address: "123 Main St",
      lat: 34.05,
      lng: -118.25,
      description: "Install a new 20 x 30 patio in the backyard.",
      photoUrls: ["https://example.com/patio.jpg"]
    };
    const propertyData = {
      formattedAddress: "123 Main St, Los Angeles, CA 90012",
      city: "Los Angeles",
      state: "CA",
      zipCode: "90012",
      lotSizeSqft: 6400,
      houseSqft: 1800,
      estimatedBackyardSqft: 3800,
      travelDistanceMiles: 4,
      lotSizeSource: "parcel_data" as const,
      houseSqftSource: "solar_building_ground_area" as const,
      locationSource: "reverse_geocode" as const
    };

    const runs = [540, 650].map((quantity) =>
      fallbackEstimate(
        input,
        propertyData,
        buildBaseSignals("Concrete", {
          jobSubtype: "patio",
          workType: "install",
          fallbackFamily: "flat_hardscape",
          estimatedQuantity: quantity,
          quantityUnit: "sqft",
          quantityEvidence: "direct",
          consistencyScore: 82,
          aiConfidence: 81
        })
      )
    );

    const quantities = runs.map((run) => run.serviceEstimates[0].scope_reconciliation?.reconciledQuantity ?? 0);
    const aiEvidence = runs.map(
      (run) => run.serviceEstimates[0].scope_reconciliation?.aiProposal?.evidence ?? "fallback"
    );

    expect(new Set(quantities).size).toBe(1);
    expect(Math.abs(quantities[0] - 600)).toBeLessThanOrEqual(100);
    expect(aiEvidence).toEqual(["direct", "direct"]);
  });
});
