import { beforeEach, describe, expect, it } from "vitest";
import { janmashtamiKrishnaMakhanTemplate } from "@/config/portrait-templates";
import { GET } from "@/app/api/templates/[templateId]/preview/route";
import { getPrivateImageStorage } from "@/server/uploads/storage";

describe("template preview route", () => {
  beforeEach(async () => {
    await getPrivateImageStorage().deletePrivateObject(
      janmashtamiKrishnaMakhanTemplate.s3Key,
    );
  });

  it("serves the private S3 template without using the Worker filesystem", async () => {
    const bytes = new Uint8Array([1, 4, 9, 16]);
    await getPrivateImageStorage().putPrivateObject(
      janmashtamiKrishnaMakhanTemplate.s3Key,
      bytes,
      janmashtamiKrishnaMakhanTemplate.contentType,
    );

    const response = await GET(new Request("https://example.com/preview"), {
      params: Promise.resolve({ templateId: janmashtamiKrishnaMakhanTemplate.id }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("returns 404 for an inactive or unknown template", async () => {
    const response = await GET(new Request("https://example.com/preview"), {
      params: Promise.resolve({ templateId: "unknown-template" }),
    });

    expect(response.status).toBe(404);
  });
});
