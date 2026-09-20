export type Relationship =
  | "janmashtami-child"
  | "radha-krishna-couple"
  | "retro-single"
  | "retro-couple"
  | "retro-family"
  | "mother-child"
  | "father-child"
  | "grandparent-grandchild"
  | "brother-sister";

export type Occasion =
  | "just-because"
  | "birthday"
  | "janmashtami"
  | "raksha-bandhan"
  | "diwali"
  | "wedding-blessings"
  | "retro";

export type PortraitTemplate =
  | "janmashtami-krishna-makhan-001"
  | "janmashtami-radha-krishna-couple-001"
  | "janmashtami-little-krishna-001"
  | "janmashtami-wish-flute-001"
  | "janmashtami-wish-portrait-001"
  | "janmashtami-mother-daughter-radha-001"
  | "retro-girl-template-001"
  | "retro-single-boy-001"
  | "retro-couple-scooter-001"
  | "retro-girl-car-001"
  | "retro-couple-bullet-001"
  | "retro-video-rental-001"
  | "retro-girl-camera-001"
  | "retro-boy-car-001"
  | "retro-family-001"
  | "rakhi-brother-sister-traditional-001";

export type GenerationJobStatus =
  | "draft"
  | "uploading"
  | "queued"
  | "generating"
  | "preview-ready"
  | "payment-pending"
  | "paid"
  | "failed"
  | "expired";

export interface PortraitFlowState {
  relationship?: Relationship;
  occasion?: Occasion;
  template?: PortraitTemplate;
  sourcePhotoIds: readonly [string, string] | readonly [];
  jobId?: string;
  updatedAt: string;
}
