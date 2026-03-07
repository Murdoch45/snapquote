import { describe, expect, it } from "vitest";
import { fallbackEstimate, parseAiOutput } from "../../lib/ai/estimate";

describe("ai estimate parsing", () => {
  it("parses valid output", () => {
    const parsed = parseAiOutput(
      JSON.stringify({
        jobSummary: "Fence repair in backyard.",
        estimateLow: 400,
        estimateHigh: 1200,
        suggestedPrice: 850,
        draftMessage: "Thanks for your request. We can complete this for about $850."
      })
    );
    expect(parsed.suggestedPrice).toBe(850);
  });

  it("throws on invalid pricing relation", () => {
    expect(() =>
      parseAiOutput(
        JSON.stringify({
          jobSummary: "Example",
          estimateLow: 400,
          estimateHigh: 1200,
          suggestedPrice: 2000,
          draftMessage: "Message here for customer."
        })
      )
    ).toThrow();
  });

  it("provides fallback payload", () => {
    const fallback = fallbackEstimate({
      businessName: "Demo Co",
      services: ["Landscaping"],
      address: "123 Main St",
      description: "",
      photoUrls: []
    });
    expect(fallback.estimateLow).toBeLessThan(fallback.estimateHigh);
  });
});
