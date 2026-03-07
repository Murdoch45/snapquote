import { describe, expect, it } from "vitest";
import { publicQuoteExpiry } from "../../lib/utils";
import { leadSubmitSchema, sendQuoteSchema } from "../../lib/validations";

describe("API contracts", () => {
  it("accepts valid lead submit payload", () => {
    const parsed = leadSubmitSchema.parse({
      contractorSlug: "greenline-8k2d",
      customerName: "Alex Parker",
      customerPhone: "+15555550123",
      customerEmail: "",
      addressFull: "123 Main St, Austin, TX",
      addressPlaceId: "abc",
      lat: 30.27,
      lng: -97.74,
      services: ["Landscaping"],
      description: "Need front yard cleanup."
    });
    expect(parsed.contractorSlug).toBe("greenline-8k2d");
  });

  it("rejects lead submit without phone/email", () => {
    expect(() =>
      leadSubmitSchema.parse({
        contractorSlug: "greenline-8k2d",
        customerName: "Alex Parker",
        customerPhone: "",
        customerEmail: "",
        addressFull: "123 Main St, Austin, TX",
        services: ["Landscaping"]
      })
    ).toThrow();
  });

  it("accepts valid quote send payload", () => {
    const parsed = sendQuoteSchema.parse({
      leadId: "17b3f688-f594-4014-abf8-04dca0c37d74",
      price: 950,
      message: "Thanks for your request. We can complete this work for $950."
    });
    expect(parsed.price).toBe(950);
  });

  it("calculates 7-day quote expiry", () => {
    const expires = publicQuoteExpiry("2026-01-01T00:00:00.000Z");
    expect(expires.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });
});
