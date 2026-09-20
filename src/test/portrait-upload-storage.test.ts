import { describe, expect, it } from "vitest";
import {
  parseStoredPortraitFlow,
  storePortraitTemplate,
  storeUploadedAsset,
} from "@/features/portrait-flow/storage";

describe("safe upload flow storage", () => {
  it("restores only valid opaque upload metadata", () => {
    const state = parseStoredPortraitFlow(
      JSON.stringify({
        version: 1,
        relationship: "mother-child",
        uploads: {
          first: {
            assetId: "27de847e-8e05-4f44-a78b-b1d19dc0b223",
            role: "first",
            validationStatus: "pass",
            width: 900,
            height: 1200,
          },
        },
      }),
    );
    expect(state.uploads?.first?.assetId).toBe("27de847e-8e05-4f44-a78b-b1d19dc0b223");
  });
  it("discards invalid persisted image data", () =>
    expect(
      parseStoredPortraitFlow(
        JSON.stringify({
          version: 1,
          relationship: "mother-child",
          uploads: {
            first: { assetId: "data:image/jpeg;base64,secret", file: "secret" },
          },
        }),
      ).uploads,
    ).toBeUndefined());
  it("never writes filenames, bytes, previews or face coordinates", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    storeUploadedAsset(storage, {
      assetId: "27de847e-8e05-4f44-a78b-b1d19dc0b223",
      role: "first",
      validationStatus: "warning-accepted",
      width: 800,
      height: 900,
    });
    const serialized = [...values.values()][0] ?? "";
    expect(serialized).not.toMatch(/base64|filename|preview|face/i);
  });
  it("persists only a configured portrait template ID", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    storePortraitTemplate(storage, "rakhi-brother-sister-traditional-001");

    expect(parseStoredPortraitFlow([...values.values()][0] ?? null).template).toBe(
      "rakhi-brother-sister-traditional-001",
    );
  });

  it("discards an unknown portrait template", () => {
    expect(
      parseStoredPortraitFlow(
        JSON.stringify({
          version: 1,
          relationship: "mother-child",
          template: "unknown-template",
        }),
      ),
    ).toEqual({ version: 1 });
  });
});
