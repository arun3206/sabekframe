import type { Relationship } from "@/features/portrait-flow/types";
import { googleAnalytics } from "@/config/analytics";

type AnalyticsParameters = Record<string, string | number | boolean | undefined>;

export interface AnalyticsTemplate {
  id: string;
  name: string;
  category?: string;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __yaadonGaInitialized?: boolean;
    __yaadonLastGaPage?: string;
  }
}

const PURCHASE_STORAGE_KEY = "yaadon:ga4:purchases:v1";
const COMPLETION_STORAGE_KEY = "yaadon:ga4:generation-completions:v1";
const MAX_DEDUPLICATION_IDS = 50;
const seenPurchases = new Set<string>();
const seenCompletions = new Set<string>();

function wasRemembered(memory: Set<string>, storageKey: string, id: string) {
  if (memory.has(id)) return true;
  try {
    const existing: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    const ids = Array.isArray(existing)
      ? existing.filter((value): value is string => typeof value === "string")
      : [];
    if (ids.includes(id)) {
      memory.add(id);
      return true;
    }
  } catch {
    // In-memory deduplication still applies when browser storage is unavailable.
  }
  return false;
}

function remember(memory: Set<string>, storageKey: string, id: string) {
  memory.add(id);
  try {
    const existing: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    const ids = Array.isArray(existing)
      ? existing.filter((value): value is string => typeof value === "string")
      : [];
    window.localStorage.setItem(
      storageKey,
      JSON.stringify([...ids.slice(-(MAX_DEDUPLICATION_IDS - 1)), id]),
    );
  } catch {
    // In-memory deduplication still applies when browser storage is unavailable.
  }
}

export function initializeGoogleAnalytics() {
  try {
    if (typeof window === "undefined") return;
    window.dataLayer ??= [];
    window.gtag ??= function gtag() {
      // Google Tag Manager distinguishes gtag command arguments from ordinary
      // arrays, so preserve the official snippet's Arguments object shape.
      // eslint-disable-next-line prefer-rest-params -- required by Google's gtag snippet
      window.dataLayer?.push(arguments);
    };
    if (window.__yaadonGaInitialized) return;
    window.__yaadonGaInitialized = true;
    window.gtag("js", new Date());
    window.gtag("config", googleAnalytics.measurementId, { send_page_view: false });
  } catch {
    // Analytics must never affect the product experience.
  }
}

export function trackEvent(eventName: string, params?: AnalyticsParameters) {
  try {
    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
      return true;
    }
  } catch {
    // Analytics must never affect the product experience.
  }
  return false;
}

export function trackPageView(path: string) {
  try {
    if (typeof window === "undefined" || window.__yaadonLastGaPage === path) return;
    window.__yaadonLastGaPage = path;
    trackEvent("page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  } catch {
    // Analytics must never affect the product experience.
  }
}

export function trackTemplateSelected(template: AnalyticsTemplate) {
  trackEvent("select_template", {
    template_id: template.id,
    template_name: template.name,
    template_category: template.category,
  });
}

export function trackPhotoUploaded(template: AnalyticsTemplate) {
  trackEvent("photo_uploaded", {
    template_id: template.id,
    template_name: template.name,
  });
}

export function trackGenerateClicked(template: AnalyticsTemplate) {
  trackEvent("generate_clicked", {
    template_id: template.id,
    template_name: template.name,
  });
}

interface PaymentAnalytics {
  currency: string;
  value: number;
  template: AnalyticsTemplate;
}

export function trackCheckoutStarted({ currency, value, template }: PaymentAnalytics) {
  trackEvent("begin_checkout", {
    currency,
    value,
    template_id: template.id,
    template_name: template.name,
  });
}

export function trackPurchase(
  transactionId: string,
  { currency, value, template }: PaymentAnalytics,
) {
  try {
    if (typeof window === "undefined") return;
    if (wasRemembered(seenPurchases, PURCHASE_STORAGE_KEY, transactionId)) return;
    const tracked = trackEvent("purchase", {
      transaction_id: transactionId,
      currency,
      value,
      template_id: template.id,
      template_name: template.name,
    });
    if (tracked) remember(seenPurchases, PURCHASE_STORAGE_KEY, transactionId);
  } catch {
    // Analytics must never affect the product experience.
  }
}

export function trackGenerationCompleted(
  template: AnalyticsTemplate,
  generationId: string,
) {
  try {
    if (typeof window === "undefined") return;
    if (wasRemembered(seenCompletions, COMPLETION_STORAGE_KEY, generationId)) return;
    const tracked = trackEvent("generation_completed", {
      template_id: template.id,
      template_name: template.name,
    });
    if (tracked) remember(seenCompletions, COMPLETION_STORAGE_KEY, generationId);
  } catch {
    // Analytics must never affect the product experience.
  }
}

export type GenerationErrorType =
  "provider_error" | "timeout" | "generation_error" | "network_error" | "unknown";

export function normalizeGenerationError(error: unknown): GenerationErrorType {
  if (!(error instanceof Error)) return "unknown";
  const message = error.message.toLowerCase();
  if (error.name === "AbortError" || /time(?:d)?\s*out/.test(message)) return "timeout";
  if (error instanceof TypeError || /network|fetch|connection/.test(message))
    return "network_error";
  if (/provider|openai|magic hour|service unavailable/.test(message))
    return "provider_error";
  return "generation_error";
}

export function trackGenerationFailed(
  template: AnalyticsTemplate,
  errorType: GenerationErrorType,
) {
  trackEvent("generation_failed", {
    template_id: template.id,
    template_name: template.name,
    error_type: errorType,
  });
}

export function trackImageDownloaded(template: AnalyticsTemplate) {
  trackEvent("image_downloaded", {
    template_id: template.id,
    template_name: template.name,
  });
}

export interface AnalyticsEvents {
  relationship_page_viewed: Record<string, never>;
  relationship_selected: { relationship: Relationship };
  relationship_continue_clicked: { relationship: Relationship };
}

export interface AnalyticsAdapter {
  track<EventName extends keyof AnalyticsEvents>(
    eventName: EventName,
    properties: AnalyticsEvents[EventName],
  ): void;
}

export const analytics: AnalyticsAdapter = {
  track: (eventName, properties) => trackEvent(eventName, properties),
};
