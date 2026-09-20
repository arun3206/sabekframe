export function parseRevenueCatPurchaseUrl(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && url.hostname === "pay.rev.cat"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function getRevenueCatPurchaseUrl(): string | null {
  return parseRevenueCatPurchaseUrl(process.env.NEXT_PUBLIC_REVENUECAT_PURCHASE_URL);
}
