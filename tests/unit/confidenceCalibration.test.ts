import { describe, expect, it } from "vitest";
import { smoothDisplayConfidence, type ConfidenceFactorTrace } from "../../estimators/shared";

function buildTrace(overrides: Partial<ConfidenceFactorTrace> = {}): ConfidenceFactorTrace {
  return {
    baseFloor: 50,
    requiredInputs: 4,
    photoEvidence: 8.5,
    descriptionUsefulness: 7,
    propertyEvidence: 7,
    crossInputAgreement: 8,
    quantityEvidence: 5.5,
    estimatorPath: 5,
    reconciliation: 5,
    ambiguityPenalty: 0,
    finalScore: 92,
    displayScore: 50,
    maxScoreEligible: false,
    notes: [],
    ...overrides
  };
}

describe("confidence calibration", () => {
  it("compresses a non-exceptional top-end score below the 92 cap", () => {
    const confidence = smoothDisplayConfidence(
      92,
      buildTrace({
        photoEvidence: 7.25,
        propertyEvidence: 7,
        crossInputAgreement: 6,
        quantityEvidence: 5.5,
        reconciliation: 4,
        finalScore: 92
      })
    );

    expect(confidence).toBeLessThan(0.92);
    expect(confidence).toBeGreaterThanOrEqual(0.88);
  });

  it("keeps 92 reserved for exceptionally corroborated jobs", () => {
    const confidence = smoothDisplayConfidence(92, buildTrace());

    expect(confidence).toBe(0.92);
  });

  it("keeps strong jobs in the high 80s without collapsing the middle", () => {
    const confidence = smoothDisplayConfidence(
      88,
      buildTrace({
        finalScore: 88,
        photoEvidence: 8,
        descriptionUsefulness: 4.5,
        propertyEvidence: 7,
        crossInputAgreement: 6,
        quantityEvidence: 5.5,
        reconciliation: 2.5
      })
    );

    expect(confidence).toBeGreaterThanOrEqual(0.85);
    expect(confidence).toBeLessThan(0.9);
  });
});
