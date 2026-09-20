import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPortraitDownloadFileName } from "@/config/portrait-download";
import { PortraitDownloadButton } from "@/features/portrait-flow/components/portrait-download-button";
import { storePortraitTemplate } from "@/features/portrait-flow/storage";

const { trackImageDownloaded } = vi.hoisted(() => ({
  trackImageDownloaded: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({ trackImageDownloaded }));

describe("PortraitDownloadButton", () => {
  const imageUrl = "/api/generations/job-token/output";
  let downloadedFileName: string | undefined;

  beforeEach(() => {
    downloadedFileName = undefined;
    window.localStorage.clear();
    trackImageDownloaded.mockClear();
    storePortraitTemplate(window.localStorage, "janmashtami-little-krishna-001");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:portrait"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      downloadedFileName =
        document.querySelector<HTMLAnchorElement>("a[download]")?.download;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a distinct filename for every generated portrait", () => {
    const date = new Date("2026-09-03T12:34:56.000Z");
    expect(
      createPortraitDownloadFileName("png", date, "11111111-1111-4111-8111-111111111111"),
    ).not.toBe(
      createPortraitDownloadFileName("png", date, "22222222-2222-4222-8222-222222222222"),
    );
  });

  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
  ])(
    "downloads the displayed %s output with the correct extension",
    async (type, extension) => {
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type });
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        blob: vi.fn().mockResolvedValue(blob),
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<PortraitDownloadButton imageUrl={imageUrl} />);

      fireEvent.click(screen.getByRole("button", { name: "Download Portrait" }));

      expect(screen.getByRole("button", { name: "Downloading..." })).toBeDisabled();
      await waitFor(() =>
        expect(downloadedFileName).toMatch(
          new RegExp(`^my-krishna-portrait-\\d{8}-\\d{6}-[a-f0-9]{8}\\.${extension}$`),
        ),
      );
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(imageUrl, { credentials: "same-origin" });
      expect(screen.getByRole("button", { name: "Download Portrait" })).toBeEnabled();
      expect(trackImageDownloaded).toHaveBeenCalledWith(
        expect.objectContaining({ id: "janmashtami-little-krishna-001" }),
      );
    },
  );

  it("shows an actionable message when the portrait cannot be downloaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    render(<PortraitDownloadButton imageUrl={imageUrl} />);

    fireEvent.click(screen.getByRole("button", { name: "Download Portrait" }));

    expect(
      await screen.findByText("Unable to download the portrait. Please try again."),
    ).toHaveAttribute("role", "alert");
    expect(screen.getByRole("button", { name: "Download Portrait" })).toBeEnabled();
    expect(trackImageDownloaded).not.toHaveBeenCalled();
  });
});
