import type { OpenAiPortraitTemplateConfiguration } from "@/config/portrait-templates";
import { getRetroPrompt } from "@/server/generation/retro-prompts";

export function buildKrishnaPrompt(template: OpenAiPortraitTemplateConfiguration) {
  if (template.category === "RETRO") {
    if (!template.promptKey)
      throw new Error(`Missing Retro prompt mapping for template: ${template.id}`);
    return getRetroPrompt(template.promptKey);
  }
  const isCouple = template.identityMode === "COUPLE";
  const isCombinedMotherDaughter = template.identityMode === "MOTHER_DAUGHTER_COMBINED";
  if (isCombinedMotherDaughter && template.generationInputMode === "IDENTITIES_ONLY")
    return [
      "Use the single input photograph as the identity and relationship reference.",
      ...(template.promptInstructions ?? []),
      "Return one finished portrait image only.",
    ].join("\n");
  return [
    `Use the ${isCouple ? "three" : "two"} input images according to their assigned roles below.`,
    ...(template.promptInstructions ?? []),
    isCouple
      ? "Preserve both supplied adult faces as two separate, recognizable identities in the final portrait."
      : isCombinedMotherDaughter
        ? "Preserve the mother and daughter from the combined identity photograph as two separate, recognizable identities in the final portrait."
        : "Keep the child's face naturally integrated with consistent perspective, lighting, skin texture, and age-appropriate proportions.",
    "Return one finished portrait image only.",
  ].join("\n");
}
