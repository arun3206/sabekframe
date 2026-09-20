import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  initializeGoogleAnalytics,
  normalizeGenerationError,
  trackEvent,
  trackPageView,
  trackPurchase,
} from "@/lib/analytics";

const template = {
  id: "janmashtami-little-krishna-001",
  name: "Little Krishna Matki",
  category: "CHILD_KRISHNA",
};

describe("Google Analytics observer", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.gtag;
    delete window.dataLayer;
    delete window.__yaadonGaInitialized;
    delete window.__yaadonLastGaPage;
  });

  it("queues initialization once without an automatic page view", () => {
    initializeGoogleAnalytics();
    initializeGoogleAnalytics();

    expect(window.dataLayer).toHaveLength(2);
    expect(Array.from(window.dataLayer?.[1] as ArrayLike<unknown>)).toEqual([
      "config",
      "G-04EBZ3L3FJ",
      { send_page_view: false },
    ]);
  });

  it("tracks one page view for a route including its campaign query", () => {
    window.gtag = vi.fn();

    trackPageView("/create?utm_source=test&utm_medium=test");
    trackPageView("/create?utm_source=test&utm_medium=test");

    expect(window.gtag).toHaveBeenCalledOnce();
    expect(window.gtag).toHaveBeenCalledWith(
      "event",
      "page_view",
      expect.objectContaining({
        page_path: "/create?utm_source=test&utm_medium=test",
      }),
    );
  });

  it("deduplicates a purchase by transaction ID", () => {
    window.gtag = vi.fn();
    const payment = { currency: "INR", value: 49, template };

    trackPurchase("order_analytics_test", payment);
    trackPurchase("order_analytics_test", payment);

    expect(window.gtag).toHaveBeenCalledOnce();
    expect(window.gtag).toHaveBeenCalledWith("event", "purchase", {
      transaction_id: "order_analytics_test",
      currency: "INR",
      value: 49,
      template_id: template.id,
      template_name: template.name,
    });
  });

  it("never propagates an analytics failure", () => {
    window.gtag = vi.fn(() => {
      throw new Error("blocked");
    });

    expect(() =>
      trackEvent("select_template", { template_id: template.id }),
    ).not.toThrow();
  });

  it("normalizes generation errors without exposing their message", () => {
    expect(normalizeGenerationError(new Error("Provider service unavailable"))).toBe(
      "provider_error",
    );
    expect(normalizeGenerationError(new TypeError("Failed to fetch private URL"))).toBe(
      "network_error",
    );
    expect(normalizeGenerationError(new Error("Timed out"))).toBe("timeout");
    expect(normalizeGenerationError("private raw message")).toBe("unknown");
  });
});
