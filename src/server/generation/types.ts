import type { PortraitTemplate } from "@/features/portrait-flow/types";

export type GenerationStatus =
  "initializing" | "queued" | "rendering" | "complete" | "failed";

export interface TemplateFaceMapping {
  mappingVersion: 2;
  templateId: PortraitTemplate;
  detectedAt: string;
  detectionIds: {
    brother: string;
    sister: string;
  };
  referenceS3Keys: {
    brother: string;
    sister: string;
  };
  faces: {
    brother: { path: string };
    sister: { path: string };
  };
}

export interface GenerationJobRecord {
  jobId: string;
  jobToken: string;
  sessionId: string;
  templateId: PortraitTemplate;
  occasion?: "JANMASHTAMI" | "RAKSHA_BANDHAN" | "RETRO";
  provider?: "OPENAI" | "MAGIC_HOUR";
  model?: string;
  childAssetId?: string;
  motherDaughterAssetId?: string;
  subjectAssetId?: string;
  maleAssetId?: string;
  femaleAssetId?: string;
  womanAssetId?: string;
  manAssetId?: string;
  brotherAssetId?: string;
  sisterAssetId?: string;
  status: GenerationStatus;
  magicHourProjectId?: string;
  creditsCharged?: number;
  outputS3Key?: string;
  outputContentType?: string;
  errorMessage?: string;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface PublicGenerationJob {
  jobToken: string;
  templateId: PortraitTemplate;
  status: GenerationStatus;
  errorMessage?: string;
  outputUrl?: string;
}
