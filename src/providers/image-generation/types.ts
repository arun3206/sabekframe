export interface GenerationInput {
  jobId: string;
  sourceImageKeys: readonly [string, string];
  occasion: string;
  template: string;
}

export interface GeneratedPreview {
  storageKey: string;
  width: number;
  height: number;
}

export interface ImageGenerationProvider {
  readonly name: string;
  generate(input: GenerationInput): Promise<readonly GeneratedPreview[]>;
  getStatus(providerJobId: string): Promise<"pending" | "complete" | "failed">;
}
