export const pricing = {
  currency: "INR",
  offer: {
    id: "single-generation",
    portraitCount: 1,
    amountMinor: 2900,
    label: "1 AI Portrait Generation",
    description: "Includes one downloadable AI portrait.",
  },
} as const;

export function formatPrice(amountMinor: number, currency = pricing.currency) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}
