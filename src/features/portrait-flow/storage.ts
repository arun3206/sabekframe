import { z } from "zod";
import type { StoredUploadAsset } from "@/features/photo-upload/types";
import type { PortraitTemplate, Relationship } from "@/features/portrait-flow/types";
import {
  portraitTemplateSchema,
  relationshipSchema,
} from "@/features/portrait-flow/validation/flow";

export const PORTRAIT_FLOW_STORAGE_KEY = "yaadon:portrait-flow:v1";
const PORTRAIT_FLOW_STORAGE_EVENT = "yaadon:portrait-flow-changed";

const storedUploadAssetSchema = z.object({
  assetId: z.string().uuid(),
  role: z.enum(["first", "second"]),
  validationStatus: z.enum(["pass", "warning-accepted"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const storedPortraitFlowSchema = z.object({
  version: z.literal(1),
  relationship: relationshipSchema.optional(),
  template: portraitTemplateSchema.optional(),
  uploads: z
    .object({
      first: storedUploadAssetSchema.optional(),
      second: storedUploadAssetSchema.optional(),
    })
    .optional(),
});

export interface StoredPortraitFlow {
  version: 1;
  relationship?: Relationship;
  template?: PortraitTemplate;
  uploads?: {
    first?: StoredUploadAsset;
    second?: StoredUploadAsset;
  };
}

interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parseStoredPortraitFlow(value: string | null): StoredPortraitFlow {
  if (!value) return { version: 1 };

  try {
    const parsedValue: unknown = JSON.parse(value);
    const result = storedPortraitFlowSchema.safeParse(parsedValue);
    return result.success ? result.data : { version: 1 };
  } catch {
    return { version: 1 };
  }
}

export function readStoredPortraitFlow(storage: BrowserStorage): StoredPortraitFlow {
  try {
    return parseStoredPortraitFlow(storage.getItem(PORTRAIT_FLOW_STORAGE_KEY));
  } catch {
    return { version: 1 };
  }
}

export function readStoredRelationship(storage: BrowserStorage): Relationship | null {
  return readStoredPortraitFlow(storage).relationship ?? null;
}

function notifyPortraitFlowChanged(storage: BrowserStorage) {
  if (typeof window !== "undefined" && storage === window.localStorage) {
    window.dispatchEvent(new Event(PORTRAIT_FLOW_STORAGE_EVENT));
  }
}

export function storeRelationship(
  storage: BrowserStorage,
  relationship: Relationship,
): void {
  try {
    const current = readStoredPortraitFlow(storage);
    const relationshipChanged = current.relationship !== relationship;
    storage.setItem(
      PORTRAIT_FLOW_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        relationship,
        uploads: relationshipChanged ? undefined : current.uploads,
        template: relationshipChanged ? undefined : current.template,
      }),
    );
    notifyPortraitFlowChanged(storage);
  } catch {
    // The flow remains usable if storage is unavailable.
  }
}

export function storePortraitTemplate(
  storage: BrowserStorage,
  template: PortraitTemplate,
): void {
  try {
    const current = readStoredPortraitFlow(storage);
    storage.setItem(
      PORTRAIT_FLOW_STORAGE_KEY,
      JSON.stringify({ ...current, version: 1, template }),
    );
    notifyPortraitFlowChanged(storage);
  } catch {
    // The selection remains usable for the current page if storage is unavailable.
  }
}

export function storeUploadedAsset(
  storage: BrowserStorage,
  asset: StoredUploadAsset,
): void {
  try {
    const current = readStoredPortraitFlow(storage);
    storage.setItem(
      PORTRAIT_FLOW_STORAGE_KEY,
      JSON.stringify({
        ...current,
        version: 1,
        uploads: { ...current.uploads, [asset.role]: asset },
      }),
    );
    notifyPortraitFlowChanged(storage);
  } catch {
    // Server ownership remains authoritative if browser storage is unavailable.
  }
}

export function removeStoredAsset(
  storage: BrowserStorage,
  role: "first" | "second",
): void {
  try {
    const current = readStoredPortraitFlow(storage);
    const uploads = { ...current.uploads };
    delete uploads[role];
    storage.setItem(
      PORTRAIT_FLOW_STORAGE_KEY,
      JSON.stringify({ ...current, version: 1, uploads }),
    );
    notifyPortraitFlowChanged(storage);
  } catch {
    // The server deletion request still runs if local storage is unavailable.
  }
}

export function getStoredRelationshipSnapshot(): Relationship | null {
  return typeof window === "undefined"
    ? null
    : readStoredRelationship(window.localStorage);
}

export function getStoredPortraitFlowSnapshot(): string | null {
  return typeof window === "undefined"
    ? null
    : window.localStorage.getItem(PORTRAIT_FLOW_STORAGE_KEY);
}

export function getBrowserStorageReadySnapshot(): boolean {
  return typeof window !== "undefined";
}

export function subscribeToStoredRelationship(onStoreChange: () => void): () => void {
  function handleStorage(event: StorageEvent) {
    if (event.key === PORTRAIT_FLOW_STORAGE_KEY) onStoreChange();
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(PORTRAIT_FLOW_STORAGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(PORTRAIT_FLOW_STORAGE_EVENT, onStoreChange);
  };
}
