import { describe, expect, it } from "vitest";
import { parseRevenueCatPurchaseUrl } from "@/config/payment";

describe("RevenueCat payment configuration", () => {
  it("accepts a secure RevenueCat Web Purchase Link", () => {
    expect(parseRevenueCatPurchaseUrl("https://pay.rev.cat/example-token/")).toBe(
      "https://pay.rev.cat/example-token/",
    );
  });

  it.each([
    undefined,
    "",
    "http://pay.rev.cat/example-token/",
    "https://example.com/checkout",
    "not-a-url",
  ])("rejects an unsafe or missing purchase link", (value) => {
    expect(parseRevenueCatPurchaseUrl(value)).toBeNull();
  });
});
