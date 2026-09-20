import type { PortraitTemplate, Relationship } from "@/features/portrait-flow/types";
import { retroTemplateDefinitions } from "@/config/retro-templates";
import type { RetroPromptKey } from "@/config/retro-templates";

interface BasePortraitTemplateConfiguration {
  id: PortraitTemplate;
  name: string;
  relationshipId: Relationship;
  previewImage: string;
  active: boolean;
  visibleInSelector: boolean;
  description: string;
  sortOrder: number;
  selectorSection?: "TRENDING" | "FESTIVAL";
  masterFilePath?: string;
  contentType?: "image/jpeg" | "image/png" | "image/webp";
  s3Key?: string;
}

export interface MagicHourPortraitTemplateConfiguration extends BasePortraitTemplateConfiguration {
  provider: "MAGIC_HOUR";
  relationship: "BROTHER_SISTER";
  occasion: "RAKSHA_BANDHAN";
  category: "FAMILY_RAKHI";
  masterFilePath: string;
  contentType: "image/png";
  s3Key: string;
  faceMappingS3Key: string;
  referenceFaces: {
    brother: PortraitTemplateReferenceFace;
    sister: PortraitTemplateReferenceFace;
  };
}

export interface OpenAiPortraitTemplateConfiguration extends BasePortraitTemplateConfiguration {
  provider: "OPENAI";
  relationship: "CHILD" | "COUPLE" | "MOTHER_DAUGHTER" | "PERSON" | "FAMILY";
  occasion: "JANMASHTAMI" | "RETRO";
  category: "CHILD_KRISHNA" | "RADHA_KRISHNA_COUPLE" | "MOTHER_DAUGHTER_RADHA" | "RETRO";
  identityMode:
    | "CHILD"
    | "COUPLE"
    | "MOTHER_DAUGHTER_COMBINED"
    | "RETRO_SINGLE"
    | "RETRO_COUPLE"
    | "RETRO_FAMILY";
  generationInputMode?: "IDENTITIES_ONLY";
  outputSize: "1024x1536";
  outputQuality: "medium" | "high";
  promptInstructions?: readonly string[];
  promptKey?: RetroPromptKey;
}

export type PortraitTemplateConfiguration =
  MagicHourPortraitTemplateConfiguration | OpenAiPortraitTemplateConfiguration;

export interface PortraitTemplateReferenceFace {
  masterFilePath: string;
  contentType: "image/png";
  s3Key: string;
}

export const rakhiBrotherSisterTemplate = {
  id: "rakhi-brother-sister-traditional-001",
  name: "Traditional Rakhi Celebration",
  relationship: "BROTHER_SISTER",
  relationshipId: "brother-sister",
  occasion: "RAKSHA_BANDHAN",
  category: "FAMILY_RAKHI",
  provider: "MAGIC_HOUR",
  previewImage: "/templates/rakhi-brother-sister-v1.webp",
  active: true,
  visibleInSelector: false,
  description: "A traditional Raksha Bandhan portrait for a brother and sister.",
  sortOrder: 2,
  masterFilePath: "templates/brother-sister/brother-sister101.png",
  contentType: "image/png",
  s3Key: "templates/raksha-bandhan/rakhi-brother-sister-traditional-001/template.png",
  faceMappingS3Key:
    "templates/raksha-bandhan/rakhi-brother-sister-traditional-001/face-mapping.json",
  referenceFaces: {
    brother: {
      masterFilePath: "templates/brother-sister/bother-face.png",
      contentType: "image/png",
      s3Key:
        "templates/raksha-bandhan/rakhi-brother-sister-traditional-001/reference-faces/brother.png",
    },
    sister: {
      masterFilePath: "templates/brother-sister/sister-face.png",
      contentType: "image/png",
      s3Key:
        "templates/raksha-bandhan/rakhi-brother-sister-traditional-001/reference-faces/sister.png",
    },
  },
} as const satisfies PortraitTemplateConfiguration;

export const janmashtamiKrishnaMakhanTemplate = {
  id: "janmashtami-krishna-makhan-001",
  name: "Makhan Chor Krishna",
  relationship: "CHILD",
  relationshipId: "janmashtami-child",
  occasion: "JANMASHTAMI",
  category: "CHILD_KRISHNA",
  provider: "OPENAI",
  identityMode: "CHILD",
  previewImage: "/templates/krishna-makhan-chor-v1.webp",
  active: true,
  visibleInSelector: false,
  description:
    "A warm, photorealistic Little Krishna portrait with makhan matki and flute.",
  sortOrder: 1,
  masterFilePath: "templates/janmashtami/janmashtami-krishna-makhan-001/template.png",
  contentType: "image/png",
  s3Key: "templates/janmashtami/janmashtami-krishna-makhan-001/template.png",
  outputSize: "1024x1536",
  outputQuality: "medium",
  promptInstructions: [
    "Image A is the Krishna template and composition/style reference.",
    "Image B is the child identity reference.",
    "Create a highly photorealistic Janmashtami portrait of the same child shown in Image B.",
    "Preserve the child's recognizable facial identity: face shape, eyes, eyebrows, nose, lips, cheeks, forehead, skin tone, age appearance, and distinctive facial characteristics.",
    "Do not create a different child. Highest priority: the result must be immediately recognizable as the child from Image B.",
    "Follow Image A for composition, warm festive mood, costume direction, lighting, and premium visual finish.",
    "Dress the child as Little Krishna or Bal Krishna with a yellow silk dhoti, tasteful jewellery, and a peacock-feather crown.",
    "Include a makhan matki and a flute in a refined Indian Janmashtami setting.",
    "Show exactly one child only. Do not add any other people.",
    "No text, watermark, logo, cartoon styling, blue-painted skin, distorted anatomy, or extra limbs.",
  ],
} as const satisfies PortraitTemplateConfiguration;

const sharedChildKrishnaInstructions = [
  "Image A is the Krishna template and composition/style reference.",
  "Image B is the child identity reference.",
  "Create a highly photorealistic Janmashtami portrait of the same child shown in Image B.",
  "Preserve the child's recognizable facial identity: face shape, eyes, eyebrows, nose, lips, cheeks, forehead, skin tone, age appearance, and distinctive facial characteristics.",
  "Do not create a different child. Highest priority: the result must be immediately recognizable as the child from Image B.",
  "Follow Image A for the complete composition, festive mood, costume direction, lighting, text placement, decorative borders, and premium visual finish.",
  "Keep the child's clothing and body proportions age-appropriate.",
  "Do not crop important top, bottom, or edge elements from the template composition.",
  "No added watermark, logo, distorted anatomy, or extra limbs.",
] as const;

const radhaKrishnaCoupleInstructions = [
  "PRIMARY GOAL: the two adults in the result must be immediately recognizable as the two identity references. Identity accuracy is more important than matching the template's exact head angle.",
  "Image A is only the Radha Krishna composition, clothing, pose, flute, lighting, and background reference. The two faces in Image A are disposable placeholders: do not copy, preserve, blend with, or derive any facial identity from them.",
  "Image B (filename woman-identity.jpg) is the only facial identity reference for Radha. Place this same woman on the right side of the composition.",
  "Image C (filename man-identity.jpg) is the only facial identity reference for Krishna. Place this same man on the left side of the composition.",
  "Create a highly photorealistic adult Radha Krishna couple portrait using the exact woman from Image B and the exact man from Image C.",
  "Reconstruct both recognizable facial identities independently and faithfully, including each person's face shape, eyes, eyebrows, nose, lips, jawline, cheeks, forehead, skin tone, apparent age, facial hair, and other distinctive characteristics.",
  "Do not beautify, idealize, genericize, age-shift, blend, swap, average, feminize, masculinize, or replace either identity.",
  "Follow Image A below the neck and for the overall two-person arrangement, clothing, flute, composition, festive setting, lighting, and premium visual finish.",
  "If the close inward-facing pose in Image A would hide or distort an identity, turn that person's head slightly toward the camera in a natural three-quarter view so the face remains clear and recognizable.",
  "Keep both adults' faces naturally integrated with consistent perspective, lighting, and realistic skin texture.",
  "Show exactly two adults only: the man from Image C as Krishna and the woman from Image B as Radha.",
  "Do not crop either face or important top, bottom, or edge elements from the template composition.",
  "No added text, watermark, logo, distorted anatomy, duplicate people, or extra limbs.",
] as const;

export const janmashtamiRadhaKrishnaCoupleTemplate = {
  id: "janmashtami-radha-krishna-couple-001",
  name: "Radha Krishna Couple",
  relationship: "COUPLE",
  relationshipId: "radha-krishna-couple",
  occasion: "JANMASHTAMI",
  category: "RADHA_KRISHNA_COUPLE",
  provider: "OPENAI",
  identityMode: "COUPLE",
  previewImage: "/templates/radha-krishna-couple-v1.webp",
  active: true,
  visibleInSelector: true,
  description: "A lush Radha Krishna-inspired portrait in blue and gold.",
  sortOrder: 2,
  masterFilePath: "templates/janmashtami/radha-krishna-couple-001/template.webp",
  contentType: "image/webp",
  s3Key: "templates/janmashtami/radha-krishna-couple-001/template.webp",
  outputSize: "1024x1536",
  outputQuality: "medium",
  promptInstructions: radhaKrishnaCoupleInstructions,
} as const satisfies PortraitTemplateConfiguration;

export const janmashtamiLittleKrishnaTemplate = {
  id: "janmashtami-little-krishna-001",
  name: "Little Krishna Matki",
  relationship: "CHILD",
  relationshipId: "janmashtami-child",
  occasion: "JANMASHTAMI",
  category: "CHILD_KRISHNA",
  provider: "OPENAI",
  identityMode: "CHILD",
  previewImage: "/templates/little-krishna-matki-v1.webp",
  active: true,
  visibleInSelector: true,
  description: "A bright Little Krishna portrait beside a decorated matki.",
  sortOrder: 1,
  masterFilePath: "templates/janmashtami/janmashtami-little-krishna-001/template.webp",
  contentType: "image/webp",
  s3Key: "templates/janmashtami/janmashtami-little-krishna-001/template.webp",
  outputSize: "1024x1536",
  outputQuality: "medium",
  promptInstructions: sharedChildKrishnaInstructions,
} as const satisfies PortraitTemplateConfiguration;

export const janmashtamiWishFluteTemplate = {
  id: "janmashtami-wish-flute-001",
  name: "Janmashtami Blessings",
  relationship: "CHILD",
  relationshipId: "janmashtami-child",
  occasion: "JANMASHTAMI",
  category: "CHILD_KRISHNA",
  provider: "OPENAI",
  identityMode: "CHILD",
  previewImage: "/templates/janmashtami-wish-flute-v1.webp",
  active: true,
  visibleInSelector: true,
  description: "A blue festive greeting portrait with flute and blessings.",
  sortOrder: 3,
  masterFilePath: "templates/janmashtami/janmashtami-wish-flute-001/template.webp",
  contentType: "image/webp",
  s3Key: "templates/janmashtami/janmashtami-wish-flute-001/template.webp",
  outputSize: "1024x1536",
  outputQuality: "medium",
  promptInstructions: sharedChildKrishnaInstructions,
} as const satisfies PortraitTemplateConfiguration;

export const janmashtamiWishPortraitTemplate = {
  id: "janmashtami-wish-portrait-001",
  name: "Janmashtami Wishes",
  relationship: "CHILD",
  relationshipId: "janmashtami-child",
  occasion: "JANMASHTAMI",
  category: "CHILD_KRISHNA",
  provider: "OPENAI",
  identityMode: "CHILD",
  previewImage: "/templates/janmashtami-wish-portrait-v1.webp",
  active: true,
  visibleInSelector: true,
  description: "A framed Janmashtami wish portrait with flute and matki.",
  sortOrder: 4,
  masterFilePath: "templates/janmashtami/janmashtami-wish-portrait-001/template.webp",
  contentType: "image/webp",
  s3Key: "templates/janmashtami/janmashtami-wish-portrait-001/template.webp",
  outputSize: "1024x1536",
  outputQuality: "medium",
  promptInstructions: sharedChildKrishnaInstructions,
} as const satisfies PortraitTemplateConfiguration;

const motherDaughterRadhaInstructions = [
  "Transform the adult mother and her daughter in the input photograph into a traditional Radha-inspired mother-and-daughter portrait.",
  "Preserve both supplied faces as separate, recognizable identities, including their natural facial features, skin tones, and ages.",
  "Keep the mother clearly adult and the daughter clearly a child. Do not blend, swap, average, age-shift, or replace either face.",
  "Dress both in coordinated traditional Indian Radha-inspired attire with elegant jewellery, floral details, and tasteful festive makeup.",
  "Create a warm golden temple or Vrindavan-inspired setting with soft cinematic lighting and a premium photorealistic finish.",
  "Show exactly two people only: the mother and daughter from the input photograph.",
  "No text, watermark, logo, cartoon styling, distorted anatomy, duplicate people, or extra limbs.",
] as const;

export const janmashtamiMotherDaughterRadhaTemplate = {
  id: "janmashtami-mother-daughter-radha-001",
  name: "Mother & Little Radha",
  relationship: "MOTHER_DAUGHTER",
  relationshipId: "mother-child",
  occasion: "JANMASHTAMI",
  category: "MOTHER_DAUGHTER_RADHA",
  provider: "OPENAI",
  identityMode: "MOTHER_DAUGHTER_COMBINED",
  generationInputMode: "IDENTITIES_ONLY",
  previewImage: "/templates/mother-daughter-radha-v1.webp",
  active: true,
  visibleInSelector: true,
  description: "Create a festive Radha portrait from one mother-daughter photo.",
  sortOrder: 5,
  masterFilePath: "templates/janmashtami/mother-daughter-radha-001/template.jpeg",
  contentType: "image/jpeg",
  s3Key: "templates/janmashtami/mother-daughter-radha-001/template.jpeg",
  outputSize: "1024x1536",
  outputQuality: "medium",
  promptInstructions: motherDaughterRadhaInstructions,
} as const satisfies PortraitTemplateConfiguration;

export const retroPortraitTemplates: readonly OpenAiPortraitTemplateConfiguration[] =
  retroTemplateDefinitions.map((template) => ({
    ...template,
    relationship:
      template.identityMode === "RETRO_COUPLE"
        ? "COUPLE"
        : template.identityMode === "RETRO_FAMILY"
          ? "FAMILY"
          : "PERSON",
    occasion: "RETRO",
    category: "RETRO",
    provider: "OPENAI",
    generationInputMode: "IDENTITIES_ONLY",
    selectorSection: "TRENDING",
    active: true,
    visibleInSelector: true,
    outputSize: "1024x1536",
    outputQuality: "medium",
  }));

export const portraitTemplates: readonly PortraitTemplateConfiguration[] = [
  ...retroPortraitTemplates,
  janmashtamiLittleKrishnaTemplate,
  janmashtamiRadhaKrishnaCoupleTemplate,
  janmashtamiWishFluteTemplate,
  janmashtamiWishPortraitTemplate,
  janmashtamiMotherDaughterRadhaTemplate,
  janmashtamiKrishnaMakhanTemplate,
  rakhiBrotherSisterTemplate,
];

export const portraitTemplateSections = [
  { id: "TRENDING", title: "🔥 Trending" },
  { id: "FESTIVAL", title: "Festival Portraits" },
] as const;

export function getSelectablePortraitTemplateSections() {
  const templates = getSelectablePortraitTemplates();
  return portraitTemplateSections
    .map((section) => ({
      ...section,
      templates: templates.filter(
        (template) => (template.selectorSection ?? "FESTIVAL") === section.id,
      ),
    }))
    .filter((section) => section.templates.length > 0);
}

export function getSelectablePortraitTemplates(): readonly PortraitTemplateConfiguration[] {
  return portraitTemplates
    .filter((template) => template.active && template.visibleInSelector)
    .sort((first, second) => first.sortOrder - second.sortOrder);
}

export function getActivePortraitTemplate(
  templateId: string,
): PortraitTemplateConfiguration | null {
  return (
    portraitTemplates.find((template) => template.id === templateId && template.active) ??
    null
  );
}

export function getPortraitTemplatesForRelationship(
  relationship: Relationship | null,
): readonly PortraitTemplateConfiguration[] {
  if (!relationship) return [];
  return portraitTemplates
    .filter((template) => template.active && template.relationshipId === relationship)
    .sort((first, second) => first.sortOrder - second.sortOrder);
}

export function getSelectablePortraitTemplatesForRelationship(
  relationship: Relationship | null,
): readonly PortraitTemplateConfiguration[] {
  if (!relationship) return [];
  return getSelectablePortraitTemplates().filter(
    (template) => template.relationshipId === relationship,
  );
}
