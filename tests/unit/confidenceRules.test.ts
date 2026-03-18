import { describe, expect, it } from "vitest";
import { buildConfidenceTrace, computeRuleBasedConfidence, type AiEstimatorSignals } from "../../estimators/shared";
import type { EstimatorContext } from "../../estimators/shared";

function makeSignals(service: "Pressure Washing" | "Other"): AiEstimatorSignals {
  return {
    summary: "",
    condition: "light",
    access: "easy",
    severity: "minor",
    debris: "none",
    multipleAreas: false,
    materialHint: null,
    inferredScope: null,
    treeSize: "medium",
    estimatedWindowCount: null,
    estimatedPoolSqft: null,
    estimatedFixtureCount: null,
    estimatedJunkCubicYards: null,
    internalConfidence: 0,
    pricingDrivers: [],
    estimatorNotes: [],
    serviceSignals: {
      [service]: {
        serviceType: service
      }
    }
  };
}

describe("deterministic confidence scoring", () => {
  it("scores listed tier 1 services from baseline, answer counts, and photos", () => {
    const result = computeRuleBasedConfidence({
      service: "Pressure Washing",
      photoCount: 2,
      vagueAnswers: 0,
      nonVagueSelections: 5
    });

    expect(result.serviceBaseline).toBe(80);
    expect(result.rawScore).toBe(85);
    expect(result.finalScore).toBe(85);
  });

  it("subtracts 10 per vague selection and adds 1 per non-vague selection", () => {
    const result = computeRuleBasedConfidence({
      service: "Roofing",
      photoCount: 1,
      vagueAnswers: 1,
      nonVagueSelections: 4
    });

    expect(result.serviceBaseline).toBe(70);
    expect(result.vaguePenalty).toBe(-10);
    expect(result.nonVagueBonus).toBe(4);
    expect(result.photoAdjustment).toBe(-5);
    expect(result.finalScore).toBe(59);
  });

  it("caps Other services at 70", () => {
    const result = computeRuleBasedConfidence({
      service: "Other",
      photoCount: 10,
      vagueAnswers: 0,
      nonVagueSelections: 5
    });

    expect(result.rawScore).toBe(73);
    expect(result.finalScore).toBe(70);
  });

  it("applies the configured floor for low-scoring listed services", () => {
    const result = computeRuleBasedConfidence({
      service: "Concrete",
      photoCount: 1,
      vagueAnswers: 5,
      nonVagueSelections: 0
    });

    expect(result.rawScore).toBe(15);
    expect(result.finalScore).toBe(37);
  });

  it("keeps customer description confidence-neutral", () => {
    const baseContext = {
      request: {
        service: "Pressure Washing",
        answers: {
          pressure_washing_target: "Driveway",
          pressure_washing_size: "Medium area (~500-1,500 sq ft)",
          pressure_washing_condition: "Moderate buildup",
          pressure_washing_access: "Some obstacles"
        }
      },
      propertyData: {
        formattedAddress: "",
        city: null,
        state: null,
        zipCode: null,
        lotSizeSqft: null,
        houseSqft: null,
        estimatedBackyardSqft: null,
        travelDistanceMiles: null,
        lotSizeSource: "unavailable",
        houseSqftSource: "unavailable",
        locationSource: "unavailable"
      },
      regionalModel: {} as never,
      photoCount: 2,
      signals: makeSignals("Pressure Washing")
    } satisfies Omit<EstimatorContext, "description">;

    const withoutDescription = buildConfidenceTrace({
      ...baseContext,
      description: ""
    } as EstimatorContext);
    const withDescription = buildConfidenceTrace({
      ...baseContext,
      description: "Long free-text note that should not change contractor-facing confidence."
    } as EstimatorContext);

    expect(withDescription.finalScore).toBe(withoutDescription.finalScore);
    expect(withDescription.displayScore).toBe(withoutDescription.displayScore);
  });
});
