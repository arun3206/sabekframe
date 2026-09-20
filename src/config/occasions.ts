import type { Occasion } from "@/features/portrait-flow/types";

export const occasions: ReadonlyArray<{ id: Occasion; label: string }> = [
  { id: "just-because", label: "Just because" },
  { id: "birthday", label: "Birthday" },
  { id: "raksha-bandhan", label: "Raksha Bandhan" },
  { id: "diwali", label: "Diwali" },
  { id: "wedding-blessings", label: "Wedding blessings" },
];
