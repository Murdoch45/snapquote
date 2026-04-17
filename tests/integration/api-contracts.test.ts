import { describe, expect, it } from "vitest";
import { publicQuoteExpiry } from "../../lib/utils";
import { leadSubmitSchema, sendQuoteSchema, updateSettingsSchema } from "../../lib/validations";

describe("API contracts", () => {
  it("accepts valid lead submit payload", () => {
    const parsed = leadSubmitSchema.parse({
      contractorSlug: "greenline-8k2d",
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
      photoCount: 1
    });
    expect(parsed.contractorSlug).toBe("greenline-8k2d");
  });

  it("accepts valid lead submit payload with multiple services", () => {
    const parsed = leadSubmitSchema.parse({
      contractorSlug: "greenline-8k2d",
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
      photoCount: 2
    });
    expect(parsed.services).toHaveLength(2);
  });

  it("accepts lead submit payload with up to 10 photos", () => {
    const parsed = leadSubmitSchema.parse({
      contractorSlug: "greenline-8k2d",
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
      photoCount: 10
    });

    expect(parsed.photoCount).toBe(10);
  });

  it("rejects lead submit without phone/email", () => {
    expect(() =>
      leadSubmitSchema.parse({
        contractorSlug: "greenline-8k2d",
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
        photoCount: 1
      })
    ).toThrow();
  });

  it("rejects lead submit without a selected Google address", () => {
    expect(() =>
      leadSubmitSchema.parse({
        contractorSlug: "greenline-8k2d",
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
        photoCount: 1
      })
    ).toThrow();
  });

  it("rejects lead submit payload with more than 10 photos", () => {
    expect(() =>
      leadSubmitSchema.parse({
        contractorSlug: "greenline-8k2d",
        customerName: "Alex Parker",
        customerPhone: "+15555550123",
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
        photoCount: 11
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
