import { describe, expect, it } from "vitest";
import { clampDisplayConfidence } from "../../components/ConfidenceMeter";
import {
  buildAiExtractionNotes,
  buildAiSignalsResponseFormat,
  buildDeterministicJobSummary,
  classifyStructuredAiFailure,
  fallbackEstimate,
  parseAiOutput
} from "../../lib/ai/estimate";

describe("ai estimate parsing", () => {
  it("parses valid output with service-level signals", () => {
    const parsed = parseAiOutput(
      JSON.stringify({
        summary: "Pressure washing request.",
        condition: "moderate",
        access: "easy",
        severity: "moderate",
        debris: "light",
        multipleAreas: false,
        materialHint: "concrete driveway",
        inferredScope: "driveway only",
        treeSize: "medium",
        estimatedWindowCount: null,
        estimatedPoolSqft: null,
        estimatedFixtureCount: null,
        estimatedJunkCubicYards: null,
        internalConfidence: 74,
        pricingDrivers: ["Driveway scope"],
        estimatorNotes: ["Customer provided clear scope."],
        serviceSignals: [
          {
            serviceType: "Pressure Washing",
            jobSubtype: "driveway",
            workType: "clean",
            fallbackFamily: "flat_hardscape",
            jobStandardness: "standard",
            scopeClarity: "moderate",
            remainingUncertainty: "medium",
            estimatedQuantity: 900,
            quantityUnit: "sqft",
            quantityEvidence: "strong_inference"
          }
        ]
      })
    );

    expect(parsed.internalConfidence).toBe(74);
    expect(parsed.serviceSignals?.["Pressure Washing"]?.jobSubtype).toBe("driveway");
  });

  it("builds the structured-output schema for OpenAI", () => {
    const responseFormat = buildAiSignalsResponseFormat();
    const serialized = JSON.stringify(responseFormat);

    expect(responseFormat.type).toBe("json_schema");
    expect(responseFormat.name).toBe("snapquote_estimator_signals");
    expect(serialized).toContain("\"serviceSignals\"");
    expect(serialized).not.toContain("\"anyOf\"");
    expect(serialized).not.toContain("\"nullable\"");
  });

  it("classifies image payload failures as non-retryable", () => {
    const failure = classifyStructuredAiFailure({
      status: 400,
      message: "Invalid image_url payload for input_image.",
      code: "invalid_image_url"
    });

    expect(failure.category).toBe("image_payload_issue");
    expect(failure.retryable).toBe(false);
  });

  it("classifies parse failures as retryable", () => {
    const failure = classifyStructuredAiFailure(new SyntaxError("Unexpected token } in JSON at position 18"));

    expect(failure.category).toBe("parse_failure");
    expect(failure.retryable).toBe(true);
  });

  it("formats fallback trace notes with exact failure metadata", () => {
    expect(
      buildAiExtractionNotes({
        source: "fallback",
        structuredAiSucceeded: false,
        fallbackUsed: true,
        attemptsMade: 1,
        finalFailureCategory: "timeout",
        finalFailureRetryable: true,
        attempts: [
          {
            attempt: 1,
            category: "timeout",
            retryable: true,
            message: "timed out"
          }
        ]
      })
    ).toEqual([
      "Structured AI extraction failed after 1 attempt; fallback was used.",
      "Structured AI final failure category: timeout (retryable).",
      "Structured AI failure history: attempt 1=timeout retryable."
    ]);
  });

  it("produces a deterministic fallback estimate for a straightforward landscaping job", () => {
    const fallback = fallbackEstimate(
      {
        businessName: "Demo Co",
        services: ["Landscaping / Installation"],
        serviceQuestionAnswers: [
          {
            service: "Landscaping / Installation",
            answers: {
              landscape_work_type: "Rock or mulch installation",
              landscape_area_size: "One side of yard (~500-1,500 sq ft)",
              landscape_job_type: "Refresh existing landscaping",
              landscape_materials: "Mostly mulch or rock",
              landscape_access: "Easy"
            }
          }
        ],
        address: "123 Main St",
        lat: 30.27,
        lng: -97.74,
        description: "Refresh the front beds with fresh mulch and some edging.",
        photoUrls: ["https://example.com/landscape-1.jpg"]
      },
      {
        formattedAddress: "123 Main St",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        lotSizeSqft: 6000,
        houseSqft: 1600,
        estimatedBackyardSqft: 4400,
        travelDistanceMiles: 8,
        lotSizeSource: "lead_parcel",
        houseSqftSource: "lot_coverage_estimate",
        locationSource: "address_geocode"
      }
    );

    expect(fallback.snapQuote).toBeGreaterThan(0);
    expect(fallback.lowEstimate).toBeGreaterThan(0);
    expect(fallback.serviceEstimates[0].jobType).toBe("rock_or_mulch_install");
    expect(fallback.confidenceScore).toBeGreaterThanOrEqual(0.48);
    expect(fallback.serviceEstimates[0].scopeSummary).toContain("sqft");
  });

  it("maps new outdoor lighting work-type answers into lower and higher install paths", () => {
    const propertyData = {
      formattedAddress: "123 Main St",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      lotSizeSqft: 7000,
      houseSqft: 1800,
      estimatedBackyardSqft: 4200,
      travelDistanceMiles: 8,
      lotSizeSource: "lead_parcel" as const,
      houseSqftSource: "lot_coverage_estimate" as const,
      locationSource: "address_geocode" as const
    };
    const buildLightingEstimate = (lighting_work_type: string, lighting_install_difficulty = "Not sure") =>
      fallbackEstimate(
        {
          businessName: "Demo Co",
          services: ["Outdoor Lighting Installation"],
          serviceQuestionAnswers: [
            {
              service: "Outdoor Lighting Installation",
              answers: {
                lighting_type: ["Pathway lights", "Driveway lights"],
                lighting_scope: "One medium-sized area",
                lighting_work_type,
                lighting_power: "Yes",
                lighting_install_difficulty
              }
            }
          ],
          address: "123 Main St",
          lat: 30.27,
          lng: -97.74,
          description: "Install pathway lighting along the front walk.",
          photoUrls: ["https://example.com/light-1.jpg"]
        },
        propertyData
      );

    const laborOnly = buildLightingEstimate("Install lights I already have", "Easy access, simple install");
    const basicInstall = buildLightingEstimate("Install a basic new lighting setup");
    const fullInstall = buildLightingEstimate("Install a full new lighting system");

    expect(basicInstall.snapQuote).toBeGreaterThan(laborOnly.snapQuote);
    expect(fullInstall.snapQuote).toBeGreaterThan(basicInstall.snapQuote);
  });

  it("preserves outdoor lighting backward compatibility for older labels", () => {
    const propertyData = {
      formattedAddress: "123 Main St",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      lotSizeSqft: 7000,
      houseSqft: 1800,
      estimatedBackyardSqft: 4200,
      travelDistanceMiles: 8,
      lotSizeSource: "lead_parcel" as const,
      houseSqftSource: "lot_coverage_estimate" as const,
      locationSource: "address_geocode" as const
    };
    const fallback = fallbackEstimate(
      {
        businessName: "Demo Co",
        services: ["Outdoor Lighting Installation"],
        serviceQuestionAnswers: [
          {
            service: "Outdoor Lighting Installation",
            answers: {
              lighting_type: "Pathway lights",
              lighting_scope: "Medium job (several lights across part of the property)",
              lighting_work_type: "New installation",
              lighting_power: "Yes",
              lighting_property_type: "Yes, I already have the lights/materials"
            }
          }
        ],
        address: "123 Main St",
        lat: 30.27,
        lng: -97.74,
        description: "Install pathway lighting along the front walk.",
        photoUrls: ["https://example.com/light-1.jpg"]
      },
      propertyData
    );

    expect(fallback.serviceEstimates[0].scope_reconciliation?.questionnaireAnchor?.bandMin).toBe(7);
    expect(fallback.serviceEstimates[0].scope_reconciliation?.questionnaireAnchor?.bandMax).toBe(11);
    expect(fallback.serviceEstimates[0].lineItems.condition_adjustment).toBeLessThan(300);
  });

  it("maps new outdoor lighting scope labels into explicit fixture bands", () => {
    const propertyData = {
      formattedAddress: "123 Main St",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      lotSizeSqft: 7000,
      houseSqft: 1800,
      estimatedBackyardSqft: 4200,
      travelDistanceMiles: 8,
      lotSizeSource: "lead_parcel" as const,
      houseSqftSource: "lot_coverage_estimate" as const,
      locationSource: "address_geocode" as const
    };
    const buildLightingEstimate = (lighting_scope: string) =>
      fallbackEstimate(
        {
          businessName: "Demo Co",
          services: ["Outdoor Lighting Installation"],
          serviceQuestionAnswers: [
            {
              service: "Outdoor Lighting Installation",
              answers: {
                lighting_type: ["Pathway lights", "Driveway lights"],
                lighting_scope,
                lighting_work_type: "Install a basic new lighting setup",
                lighting_power: "Yes"
              }
            }
          ],
          address: "123 Main St",
          lat: 30.27,
          lng: -97.74,
          description: "Install pathway lighting along the front walk.",
          photoUrls: []
        },
        propertyData
      ).serviceEstimates[0].scope_reconciliation?.questionnaireAnchor;

    expect(buildLightingEstimate("One small area")).toMatchObject({ bandMin: 3, bandMax: 5, quantity: 4 });
    expect(buildLightingEstimate("One medium-sized area")).toMatchObject({ bandMin: 6, bandMax: 10, quantity: 8 });
    expect(buildLightingEstimate("One large area")).toMatchObject({ bandMin: 8, bandMax: 12, quantity: 10 });
    expect(buildLightingEstimate("Multiple areas")).toMatchObject({ bandMin: 12, bandMax: 18, quantity: 15 });
  });

  it("keeps inferred AI quantity close to the questionnaire/property center", () => {
    const propertyData = {
      formattedAddress: "123 Main St",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      lotSizeSqft: 7000,
      houseSqft: 1800,
      estimatedBackyardSqft: 4200,
      travelDistanceMiles: 8,
      lotSizeSource: "lead_parcel" as const,
      houseSqftSource: "lot_coverage_estimate" as const,
      locationSource: "address_geocode" as const
    };
    const input: Parameters<typeof fallbackEstimate>[0] = {
      businessName: "Demo Co",
      services: ["Outdoor Lighting Installation"],
      serviceQuestionAnswers: [
        {
          service: "Outdoor Lighting Installation",
          answers: {
            lighting_type: ["Other"],
            lighting_type_other_text: "Christmas lights",
            lighting_scope: "One large area",
            lighting_work_type: "Install lights I already have",
            lighting_power: "Yes",
            lighting_install_difficulty: "Easy access, simple install"
          }
        }
      ],
      address: "123 Main St",
      lat: 30.27,
      lng: -97.74,
      description: "Install Christmas lights on the front of the house.",
      photoUrls: ["https://example.com/light-1.jpg", "https://example.com/light-2.jpg"]
    };
    const buildSignals = (
      quantityEvidence: "direct" | "strong_inference"
    ): NonNullable<Parameters<typeof fallbackEstimate>[2]> => ({
      summary: "Outdoor lighting request.",
      condition: "light" as const,
      access: "easy" as const,
      severity: "minor" as const,
      debris: "none" as const,
      multipleAreas: false,
      materialHint: null,
      inferredScope: null,
      treeSize: "medium" as const,
      estimatedWindowCount: null,
      estimatedPoolSqft: null,
      estimatedFixtureCount: null,
      estimatedJunkCubicYards: null,
      internalConfidence: 76,
      pricingDrivers: [],
      estimatorNotes: [],
      serviceSignals: {
        "Outdoor Lighting Installation": {
          serviceType: "Outdoor Lighting Installation" as const,
          jobSubtype: "holiday_lighting",
          workType: "install" as const,
          fallbackFamily: "lighting_system" as const,
          jobStandardness: "standard" as const,
          scopeClarity: "moderate" as const,
          remainingUncertainty: "medium" as const,
          estimatedQuantity: 30,
          quantityUnit: "fixture_count" as const,
          quantityEvidence
        }
      }
    });

    const inferred = fallbackEstimate(input, propertyData, buildSignals("strong_inference"));
    const inferredTrace = inferred.serviceEstimates[0].scope_reconciliation;

    expect(inferredTrace?.reconciledQuantity).toBe(9);
    expect(inferredTrace?.questionnaireAnchor?.quantity).toBe(10);
    expect(inferredTrace?.propertyHint?.quantity).toBe(8);
    expect(inferredTrace?.notes).toContain("Large inferred AI drift was heavily damped to keep repeat runs stable.");
  });

  it("prices outdoor lighting from broad scope buckets instead of inferred fixture count", () => {
    const propertyData = {
      formattedAddress: "123 Main St",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      lotSizeSqft: 7000,
      houseSqft: 1800,
      estimatedBackyardSqft: 4200,
      travelDistanceMiles: 8,
      lotSizeSource: "lead_parcel" as const,
      houseSqftSource: "lot_coverage_estimate" as const,
      locationSource: "address_geocode" as const
    };
    const input: Parameters<typeof fallbackEstimate>[0] = {
      businessName: "Demo Co",
      services: ["Outdoor Lighting Installation"],
      serviceQuestionAnswers: [
        {
          service: "Outdoor Lighting Installation",
          answers: {
            lighting_type: ["Other"],
            lighting_type_other_text: "Christmas lights",
            lighting_scope: "One large area",
            lighting_work_type: "Install lights I already have",
            lighting_power: "Yes",
            lighting_install_difficulty: "Easy access, simple install"
          }
        }
      ],
      address: "123 Main St",
      lat: 30.27,
      lng: -97.74,
      description: "Install Christmas lights on the front of the house.",
      photoUrls: ["https://example.com/light-1.jpg", "https://example.com/light-2.jpg"]
    };
    const aiSignals: NonNullable<Parameters<typeof fallbackEstimate>[2]> = {
      summary: "Outdoor lighting request.",
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
      internalConfidence: 76,
      pricingDrivers: [],
      estimatorNotes: [],
      serviceSignals: {
        "Outdoor Lighting Installation": {
          serviceType: "Outdoor Lighting Installation",
          jobSubtype: "holiday_lighting",
          workType: "install",
          fallbackFamily: "lighting_system",
          jobStandardness: "standard",
          scopeClarity: "moderate",
          remainingUncertainty: "medium",
          estimatedQuantity: 30,
          quantityUnit: "fixture_count",
          quantityEvidence: "strong_inference"
        }
      }
    };

    const withoutAiQuantity = fallbackEstimate(input, propertyData);
    const withAiQuantity = fallbackEstimate(input, propertyData, aiSignals);

    expect(withAiQuantity.serviceEstimates[0].lineItems.base_scope).toBe(
      withoutAiQuantity.serviceEstimates[0].lineItems.base_scope
    );
    expect(withAiQuantity.serviceEstimates[0].scopeSummary).toBe(withoutAiQuantity.serviceEstimates[0].scopeSummary);
  });

  it("treats gutter landscaping obstacles as moderate access", () => {
    const propertyData = {
      formattedAddress: "456 Gutter St",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      lotSizeSqft: 6200,
      houseSqft: 1700,
      estimatedBackyardSqft: 3600,
      travelDistanceMiles: 6,
      lotSizeSource: "lead_parcel" as const,
      houseSqftSource: "lot_coverage_estimate" as const,
      locationSource: "address_geocode" as const
    };
    const buildGutterEstimate = (gutter_access: string) =>
      fallbackEstimate(
        {
          businessName: "Demo Co",
          services: ["Gutter Cleaning"],
          serviceQuestionAnswers: [
            {
              service: "Gutter Cleaning",
              answers: {
                gutter_building_type: "Single-story home",
                gutter_work_type: "Clean gutters only",
                gutter_fill_level: "Moderate debris",
                gutter_access
              }
            }
          ],
          address: "456 Gutter St",
          lat: 30.27,
          lng: -97.74,
          description: "Clean the gutters.",
          photoUrls: []
        },
        propertyData
      );

    const easy = buildGutterEstimate("No");
    const obstacles = buildGutterEstimate("Yes, landscaping or obstacles");
    const hardAccess = buildGutterEstimate("Yes, steep roof or hard access");

    expect(obstacles.snapQuote).toBeGreaterThan(easy.snapQuote);
    expect(hardAccess.snapQuote).toBeGreaterThan(obstacles.snapQuote);
  });

  it("treats pool access 'No' as difficult access", () => {
    const propertyData = {
      formattedAddress: "789 Pool Rd",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      lotSizeSqft: 8000,
      houseSqft: 2100,
      estimatedBackyardSqft: 5000,
      travelDistanceMiles: 5,
      lotSizeSource: "lead_parcel" as const,
      houseSqftSource: "lot_coverage_estimate" as const,
      locationSource: "address_geocode" as const
    };
    const buildPoolEstimate = (pool_access: string) =>
      fallbackEstimate(
        {
          businessName: "Demo Co",
          services: ["Pool Service / Cleaning"],
          serviceQuestionAnswers: [
            {
              service: "Pool Service / Cleaning",
              answers: {
                pool_work_type: "Routine cleaning / service",
                pool_type: "Standard in-ground pool",
                pool_condition: "Needs normal cleaning",
                pool_size: "Medium pool",
                pool_access
              }
            }
          ],
          address: "789 Pool Rd",
          lat: 30.27,
          lng: -97.74,
          description: "Routine pool cleaning.",
          photoUrls: []
        },
        propertyData
      );

    const easy = buildPoolEstimate("Yes");
    const somewhat = buildPoolEstimate("Somewhat");
    const difficult = buildPoolEstimate("No");

    expect((somewhat.serviceEstimates[0].lineItems.access_adjustment ?? 0)).toBeGreaterThan(0);
    expect((difficult.serviceEstimates[0].lineItems.access_adjustment ?? 0)).toBeGreaterThan(
      somewhat.serviceEstimates[0].lineItems.access_adjustment ?? 0
    );
  });

  it("recognizes the updated landscaping size answer as the large bucket", () => {
    const fallback = fallbackEstimate(
      {
        businessName: "Demo Co",
        services: ["Landscaping / Installation"],
        serviceQuestionAnswers: [
          {
            service: "Landscaping / Installation",
            answers: {
              landscape_work_type: "Rock or mulch installation",
              landscape_area_size: "Most of front or backyard (~1,500-4,000 sq ft)",
              landscape_job_type: "Refresh existing landscaping",
              landscape_materials: "Mostly mulch or rock",
              landscape_access: "Easy"
            }
          }
        ],
        address: "123 Main St",
        lat: 30.27,
        lng: -97.74,
        description: "Refresh most of the backyard with mulch.",
        photoUrls: []
      },
      {
        formattedAddress: "123 Main St",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        lotSizeSqft: 7000,
        houseSqft: 1800,
        estimatedBackyardSqft: 5200,
        travelDistanceMiles: 8,
        lotSizeSource: "lead_parcel",
        houseSqftSource: "lot_coverage_estimate",
        locationSource: "address_geocode"
      }
    );

    expect(fallback.serviceEstimates[0].scope_reconciliation?.questionnaireAnchor?.bandMin).toBe(1800);
    expect(fallback.serviceEstimates[0].scope_reconciliation?.questionnaireAnchor?.bandMax).toBe(4000);
  });

  it("uses the new lawn work-type answers and charges more for mowing and edging than mowing only", () => {
    const base = fallbackEstimate(
      {
        businessName: "Demo Co",
        services: ["Lawn Care / Maintenance"],
        serviceQuestionAnswers: [
          {
            service: "Lawn Care / Maintenance",
            answers: {
              lawn_work_type: "Mowing only",
              lawn_area_size: "Medium yard (~2,000-5,000 sq ft)",
              lawn_condition: "Regular maintenance",
              lawn_property_type: "Front and backyard"
            }
          }
        ],
        address: "101 Lawn St",
        lat: 30.27,
        lng: -97.74,
        description: "Routine mowing.",
        photoUrls: []
      },
      {
        formattedAddress: "101 Lawn St",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        lotSizeSqft: 6500,
        houseSqft: 1800,
        estimatedBackyardSqft: 3000,
        travelDistanceMiles: 4,
        lotSizeSource: "lead_parcel",
        houseSqftSource: "lot_coverage_estimate",
        locationSource: "address_geocode"
      }
    );
    const withEdging = fallbackEstimate(
      {
        businessName: "Demo Co",
        services: ["Lawn Care / Maintenance"],
        serviceQuestionAnswers: [
          {
            service: "Lawn Care / Maintenance",
            answers: {
              lawn_work_type: "Mowing and edging",
              lawn_area_size: "Medium yard (~2,000-5,000 sq ft)",
              lawn_condition: "Regular maintenance",
              lawn_property_type: "Front and backyard"
            }
          }
        ],
        address: "101 Lawn St",
        lat: 30.27,
        lng: -97.74,
        description: "Routine mowing and edging.",
        photoUrls: []
      },
      {
        formattedAddress: "101 Lawn St",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        lotSizeSqft: 6500,
        houseSqft: 1800,
        estimatedBackyardSqft: 3000,
        travelDistanceMiles: 4,
        lotSizeSource: "lead_parcel",
        houseSqftSource: "lot_coverage_estimate",
        locationSource: "address_geocode"
      }
    );

    expect(base.serviceEstimates[0].scopeSummary).toContain("maintainable lawn");
    expect(withEdging.snapQuote).toBeGreaterThan(base.snapQuote);
    expect(withEdging.costBreakdown?.edging_adjustment).toBeGreaterThan(0);
  });

  it("caps the travel multiplier at 200 miles so far-away leads still produce a normal estimate", () => {
    const leadInput: Parameters<typeof fallbackEstimate>[0] = {
      businessName: "Demo Co",
      services: ["Lawn Care / Maintenance"],
      serviceQuestionAnswers: [
        {
          service: "Lawn Care / Maintenance",
          answers: {
            lawn_work_type: "Mowing only",
            lawn_area_size: "Medium yard (~2,000-5,000 sq ft)",
            lawn_condition: "Regular maintenance",
            lawn_property_type: "Front and backyard"
          }
        }
      ],
      address: "999 Far Away Rd",
      lat: 35.0,
      lng: -120.0,
      description: "Lawn mowing request far outside the service area.",
      photoUrls: []
    };

    const propertyAt = (miles: number) => ({
      formattedAddress: "999 Far Away Rd",
      city: "Austin",
      state: "TX",
      zipCode: "78701",
      lotSizeSqft: 7000,
      houseSqft: 2000,
      estimatedBackyardSqft: 3200,
      travelDistanceMiles: miles,
      lotSizeSource: "lead_parcel" as const,
      houseSqftSource: "lot_coverage_estimate" as const,
      locationSource: "address_geocode" as const
    });

    const atCap = fallbackEstimate(leadInput, propertyAt(200));
    const beyondCap = fallbackEstimate(leadInput, propertyAt(250));

    expect(atCap.snapQuote).toBeGreaterThan(0);
    expect(beyondCap.snapQuote).toBeGreaterThan(0);
    expect(beyondCap.confidenceScore).toBeGreaterThan(0);
    expect(beyondCap.snapQuote).toBe(atCap.snapQuote);
    expect(beyondCap.lowEstimate).toBe(atCap.lowEstimate);
    expect(beyondCap.highEstimate).toBe(atCap.highEstimate);
    expect(beyondCap.estimatorNotes.join(" ")).toContain("200-mile");
  });

  it("filters pressure-wash scope to the quoted surface family instead of all detected hardscape", () => {
    const fallback = fallbackEstimate(
      {
        businessName: "Demo Co",
        services: ["Pressure Washing"],
        serviceQuestionAnswers: [
          {
            service: "Pressure Washing",
            answers: {
              pressure_washing_target: "Driveway",
              pressure_washing_size: "Large area (~1,500-3,000 sq ft)",
              pressure_washing_condition: "Moderate buildup",
              pressure_washing_access: "Easy access"
            }
          }
        ],
        address: "123 Bel Air Rd, Los Angeles, CA 90077",
        lat: 34.1,
        lng: -118.45,
        description: "Pressure wash the gated driveway only.",
        photoUrls: ["https://example.com/driveway-1.jpg", "https://example.com/driveway-2.jpg"]
      },
      {
        formattedAddress: "123 Bel Air Rd, Los Angeles, CA 90077",
        city: "Los Angeles",
        state: "CA",
        zipCode: "90077",
        lotSizeSqft: 18000,
        houseSqft: 4200,
        estimatedBackyardSqft: 13800,
        travelDistanceMiles: 8,
        lotSizeSource: "lead_parcel",
        houseSqftSource: "lot_coverage_estimate",
        locationSource: "address_geocode"
      }
    );

    expect(fallback.detected_surfaces?.driveway).toBeGreaterThan(0);
    expect(fallback.detected_surfaces?.patio).toBeGreaterThan(0);
    expect(fallback.quoted_surfaces?.driveway).toBeGreaterThan(0);
    expect(fallback.quoted_surfaces?.walkway).toBeUndefined();
    expect(fallback.wash_surface_sqft).toBeGreaterThanOrEqual(fallback.quoted_surfaces?.driveway ?? 0);
    expect(fallback.wash_surface_sqft).toBeLessThan(
      (fallback.detected_surfaces?.driveway ?? 0) + (fallback.detected_surfaces?.patio ?? 0)
    );
  });

  it("drops confidence for custom fallback jobs with weak property context", () => {
    const weak = fallbackEstimate(
      {
        businessName: "Demo Co",
        services: ["Other"],
        serviceQuestionAnswers: [
          {
            service: "Other",
            answers: {
              other_work_type: "Other",
              other_size: "Not sure",
              other_property_type: "Commercial property",
              other_access: "Very difficult",
              other_work_type_other_text: "Need help with an unusual rooftop exterior fixture issue."
            }
          }
        ],
        address: "Unknown Address",
        description: "Weird custom exterior problem.",
        photoUrls: []
      },
      {
        formattedAddress: "Unknown Address",
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
      }
    );

    expect(weak.serviceEstimates[0].jobType).toContain("other_");
    expect(weak.confidenceScore).toBe(0.42);
    expect(weak.estimatorNotes.join(" ")).toContain("fallback");
  });

  it("clamps displayed confidence out of the deepest red zone", () => {
    expect(clampDisplayConfidence(0.05)).toBe(0.25);
    expect(clampDisplayConfidence(0.72)).toBe(0.72);
  });

  it("builds a deterministic job summary from questionnaire answers for the declared service", () => {
    const summary = buildDeterministicJobSummary({
      businessName: "Demo Co",
      services: ["Concrete"],
      address: "123 Example St",
      photoUrls: [],
      serviceQuestionAnswers: [
        {
          service: "Concrete",
          answers: {
            concrete_work_type: "New pour",
            concrete_size: "Medium (~500 sq ft)",
            concrete_access: "Easy"
          }
        }
      ]
    });

    expect(summary.toLowerCase()).toContain("concrete");
    const sentences = summary.split(/\.\s+/).filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(1);
    expect(sentences.length).toBeLessThanOrEqual(3);
  });

  it("ignores questionnaire bundles whose service isn't declared", () => {
    // Guardrail: a Concrete lead must never get a summary describing a fence,
    // even if a stray fence answer bundle sneaks in.
    const summary = buildDeterministicJobSummary({
      businessName: "Demo Co",
      services: ["Concrete"],
      address: "123 Example St",
      photoUrls: [],
      serviceQuestionAnswers: [
        {
          service: "Fence Installation / Repair",
          answers: {
            fence_work_type: "New installation",
            fence_material: "Wood"
          }
        },
        {
          service: "Concrete",
          answers: {
            concrete_work_type: "New pour",
            concrete_size: "Medium (~500 sq ft)"
          }
        }
      ]
    });

    expect(summary.toLowerCase()).not.toContain("fence");
    expect(summary.toLowerCase()).not.toContain("wood");
    expect(summary.toLowerCase()).toContain("concrete");
  });
});
