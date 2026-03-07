import { describe, expect, it } from "vitest";
import { publicQuoteExpiry, slugify } from "../../lib/utils";

describe("utils", () => {
  it("slugify normalizes strings", () => {
    expect(slugify("  ACME Outdoor Pros! ")).toBe("acme-outdoor-pros");
    expect(slugify("A---B___C")).toBe("a-b-c");
  });

  it("public quote expiry adds 7 days", () => {
    const expiry = publicQuoteExpiry("2026-03-01T10:00:00.000Z");
    expect(expiry.toISOString()).toBe("2026-03-08T10:00:00.000Z");
  });
});
