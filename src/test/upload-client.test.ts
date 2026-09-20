import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareUpload } from "@/features/photo-upload/upload-client";

describe("upload client responses", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows a stable storage message when the server returns an empty error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );

    await expect(
      prepareUpload({ relationship: "brother-sister", role: "first" }),
    ).rejects.toThrow(
      "Photo storage is temporarily unavailable. Please retry in a moment.",
    );
  });
});
