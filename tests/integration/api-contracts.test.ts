import { describe, expect, it } from "vitest";
import { publicQuoteExpiry } from "../../lib/utils";
import { leadSubmitSchema, sendQuoteSchema, updateSettingsSchema } from "../../lib/validations";

// Stable v4 UUID for tests (not real PII). The leadSubmitSchema uses a
// strict v4 regex on tempLeadId; arbitrary strings would fail validation
// for the wrong reason, so we hold one at module scope and reuse.
const SAMPLE_TEMP_LEAD_ID = "11112222-3333-4444-9555-666677778888";
const SAMPLE_PHOTO_PATHS = [
  {
    storagePath: "00000000-0000-0000-0000-000000000000/11112222-3333-4444-9555-666677778888/photo-1.jpg",
    publicUrl: "https://example.com/signed/photo-1.jpg"
  }
];

describe("API contracts", () => {
  it("accepts valid lead submit payload", () => {
    const parsed = leadSubmitSchema.parse({
      contractorSlug: "greenline-8k2d",
      tempLeadId: SAMPLE_TEMP_LEAD_ID,
      customerName: "Alex Parker",
      customerPhone: "+15555550123",
      customerEmail: "alex@example.com",
      addressFull: "123 Main St, Austin, TX",
      addressPlaceId: "abc",
      lat: 30.27,
      lng: -97.74,
      services: ["Lawn Care / Maintenance"],
      description: "Need front yard cleanup.",
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
      photoStoragePaths: SAMPLE_PHOTO_PATHS
    });
    expect(parsed.contractorSlug).toBe("greenline-8k2d");
    expect(parsed.tempLeadId).toBe(SAMPLE_TEMP_LEAD_ID);
  });

  it("accepts valid lead submit payload with multiple services", () => {
    const parsed = leadSubmitSchema.parse({
      contractorSlug: "greenline-8k2d",
      tempLeadId: SAMPLE_TEMP_LEAD_ID,
      customerName: "Alex Parker",
      customerPhone: "+15555550123",
      customerEmail: "alex@example.com",
      addressFull: "123 Main St, Austin, TX",
      addressPlaceId: "abc",
      lat: 30.27,
      lng: -97.74,
      services: ["Pressure Washing", "Gutter Cleaning"],
      description: "Need exterior cleanup.",
      serviceQuestionAnswers: [
        {
          service: "Pressure Washing",
          answers: {
            pressure_washing_target: ["Driveway", "Patio or porch"],
            pressure_washing_size: "Medium area (~500-1,500 sq ft)",
            pressure_washing_condition: "Moderate buildup",
            pressure_washing_access: "Easy access"
          }
        },
        {
          service: "Gutter Cleaning",
          answers: {
            gutter_building_type: "Two-story home",
            gutter_work_type: "Clean gutters and downspouts",
            gutter_fill_level: "Moderate debris",
            gutter_access: "No"
          }
        }
      ],
      photoStoragePaths: SAMPLE_PHOTO_PATHS
    });
    expect(parsed.services).toHaveLength(2);
  });

  it("accepts lead submit payload with empty photoStoragePaths (in-flight uploads)", () => {
    // The new flow allows submit with zero photos in photoStoragePaths
    // — any photos still uploading at submit time will attach to the
    // lead row themselves via /api/public/lead-photo-upload's
    // auto-attach branch. The form blocks submit on its own when
    // nothing has been picked, but the schema accepts an empty array.
    const parsed = leadSubmitSchema.parse({
      contractorSlug: "greenline-8k2d",
      tempLeadId: SAMPLE_TEMP_LEAD_ID,
      customerName: "Alex Parker",
      customerPhone: "+15555550123",
      customerEmail: "alex@example.com",
      addressFull: "123 Main St, Austin, TX",
      addressPlaceId: "abc",
      lat: 30.27,
      lng: -97.74,
      services: ["Lawn Care / Maintenance"],
      description: "Need front yard cleanup.",
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
      photoStoragePaths: []
    });
    expect(parsed.photoStoragePaths).toEqual([]);
  });

  it("rejects lead submit without phone/email", () => {
    expect(() =>
      leadSubmitSchema.parse({
        contractorSlug: "greenline-8k2d",
        tempLeadId: SAMPLE_TEMP_LEAD_ID,
        customerName: "Alex Parker",
        customerPhone: "",
        customerEmail: "",
        addressFull: "123 Main St, Austin, TX",
        addressPlaceId: "abc",
        lat: 30.27,
        lng: -97.74,
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
        photoStoragePaths: SAMPLE_PHOTO_PATHS
      })
    ).toThrow();
  });

  it("rejects lead submit without a selected Google address", () => {
    expect(() =>
      leadSubmitSchema.parse({
        contractorSlug: "greenline-8k2d",
        tempLeadId: SAMPLE_TEMP_LEAD_ID,
        customerName: "Alex Parker",
        customerPhone: "+15555550123",
        customerEmail: "",
        addressFull: "123 Main St, Austin, TX",
        addressPlaceId: "",
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
        photoStoragePaths: SAMPLE_PHOTO_PATHS
      })
    ).toThrow();
  });

  it("rejects lead submit payload with more than 10 photoStoragePaths", () => {
    expect(() =>
      leadSubmitSchema.parse({
        contractorSlug: "greenline-8k2d",
        tempLeadId: SAMPLE_TEMP_LEAD_ID,
        customerName: "Alex Parker",
        customerPhone: "+15555550123",
        customerEmail: "alex@example.com",
        addressFull: "123 Main St, Austin, TX",
        addressPlaceId: "abc",
        lat: 30.27,
        lng: -97.74,
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
        photoStoragePaths: Array.from({ length: 11 }, (_, i) => ({
          storagePath: `00000000-0000-0000-0000-000000000000/${SAMPLE_TEMP_LEAD_ID}/photo-${i}.jpg`,
          publicUrl: `https://example.com/signed/photo-${i}.jpg`
        }))
      })
    ).toThrow();
  });

  it("rejects lead submit when tempLeadId is not a v4 UUID", () => {
    expect(() =>
      leadSubmitSchema.parse({
        contractorSlug: "greenline-8k2d",
        tempLeadId: "not-a-uuid",
        customerName: "Alex Parker",
        customerPhone: "+15555550123",
        customerEmail: "alex@example.com",
        addressFull: "123 Main St, Austin, TX",
        addressPlaceId: "abc",
        lat: 30.27,
        lng: -97.74,
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
        photoStoragePaths: SAMPLE_PHOTO_PATHS
      })
    ).toThrow();
  });

  it("accepts valid quote send payload", () => {
    const parsed = sendQuoteSchema.parse({
      leadId: "17b3f688-f594-4014-abf8-04dca0c37d74",
      estimatedPriceLow: 850,
      estimatedPriceHigh: 1050,
      message: "Thanks for your request. We can complete this work for $950.",
      sendEmail: true,
      sendText: false
    });
    expect(parsed.estimatedPriceLow).toBe(850);
  });

  it("calculates 7-day quote expiry", () => {
    const expires = publicQuoteExpiry("2026-01-01T00:00:00.000Z");
    expect(expires.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("requires business address when travel pricing is enabled", () => {
    expect(() =>
      updateSettingsSchema.parse({
        businessName: "Greenline",
        publicSlug: "greenline-8k2d",
        phone: "",
        email: "owner@example.com",
        services: ["Lawn Care / Maintenance"],
        businessAddressFull: "",
        businessAddressPlaceId: "",
        businessLat: null,
        businessLng: null,
        travelPricingDisabled: false,
        notificationLeadEmail: true,
        notificationAcceptEmail: true
      })
    ).toThrow();
  });

  it("allows mobile-only pricing without a business address", () => {
    const parsed = updateSettingsSchema.parse({
      businessName: "Greenline",
      publicSlug: "greenline-8k2d",
      phone: "",
      email: "owner@example.com",
      services: ["Lawn Care / Maintenance"],
      businessAddressFull: "",
      businessAddressPlaceId: "",
      businessLat: null,
      businessLng: null,
      travelPricingDisabled: true,
      notificationLeadEmail: true,
      notificationAcceptEmail: true
    });

    expect(parsed.travelPricingDisabled).toBe(true);
  });
});
