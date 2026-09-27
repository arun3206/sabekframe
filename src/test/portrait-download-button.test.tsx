import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPortraitDownloadFileName } from "@/config/portrait-download";
import { PortraitDownloadButton } from "@/features/portrait-flow/components/portrait-download-button";

const mocks = vi.hoisted(() => ({
  getGeneration: vi.fn(),
  createPaymentOrder: vi.fn(),
  openRazorpayCheckout: vi.fn(),
  verifyPayment: vi.fn(),
  trackCheckoutStarted: vi.fn(),
  trackImageDownloaded: vi.fn(),
  trackPurchase: vi.fn(),
}));

vi.mock("@/features/portrait-flow/generation-client", () => ({
  getGeneration: mocks.getGeneration,
}));
vi.mock("@/features/portrait-flow/payment-client", () => ({
  createPaymentOrder: mocks.createPaymentOrder,
  openRazorpayCheckout: mocks.openRazorpayCheckout,
  verifyPayment: mocks.verifyPayment,
}));
vi.mock("@/lib/analytics", () => ({
  trackCheckoutStarted: mocks.trackCheckoutStarted,
  trackImageDownloaded: mocks.trackImageDownloaded,
  trackPurchase: mocks.trackPurchase,
}));

describe("PortraitDownloadButton", () => {
  const jobToken = "67de847e-8e05-4f44-a78b-b1d19dc0b227";
  let downloadedFileName: string | undefined;

  beforeEach(() => {
    downloadedFileName = undefined;
    vi.clearAllMocks();
    mocks.getGeneration.mockResolvedValue({
      jobToken,
      templateId: "janmashtami-little-krishna-001",
      status: "complete",
    });
    mocks.createPaymentOrder.mockResolvedValue({
      paymentId: jobToken,
      razorpayOrderId: "order_test",
      razorpayKeyId: "rzp_test_example",
      amount: 2900,
      currency: "INR",
      displayAmount: "₹29",
      paid: false,
    });
    mocks.openRazorpayCheckout.mockImplementation(
      async (_order: unknown, onOpened?: () => void) => {
        onOpened?.();
        return {
          razorpay_payment_id: "pay_test",
          razorpay_order_id: "order_test",
          razorpay_signature: "a".repeat(64),
        };
      },
    );
    mocks.verifyPayment.mockResolvedValue({ paid: true });
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

  it("takes payment before downloading the HD portrait", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onUnlocked = vi.fn();
    render(<PortraitDownloadButton jobToken={jobToken} onUnlocked={onUnlocked} />);

    fireEvent.click(screen.getByRole("button", { name: "Download HD Portrait" }));

    await waitFor(() => expect(downloadedFileName).toMatch(/\.png$/));
    expect(mocks.createPaymentOrder).toHaveBeenCalledWith(
      jobToken,
      "janmashtami-little-krishna-001",
    );
    expect(mocks.openRazorpayCheckout).toHaveBeenCalledOnce();
    expect(mocks.verifyPayment).toHaveBeenCalledOnce();
    expect(mocks.verifyPayment.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0]!,
    );
    expect(fetchMock).toHaveBeenCalledWith(`/api/generations/${jobToken}/output`, {
      credentials: "same-origin",
    });
    expect(onUnlocked).toHaveBeenCalledOnce();
    expect(mocks.trackImageDownloaded).toHaveBeenCalledOnce();
  });

  it("downloads immediately when the portrait is already paid", async () => {
    mocks.createPaymentOrder.mockResolvedValueOnce({
      paymentId: jobToken,
      razorpayOrderId: "order_paid",
      razorpayKeyId: "rzp_live_example",
      amount: 2900,
      currency: "INR",
      displayAmount: "₹29",
      paid: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        blob: vi
          .fn()
          .mockResolvedValue(new Blob([new Uint8Array([1])], { type: "image/jpeg" })),
      }),
    );
    render(<PortraitDownloadButton jobToken={jobToken} />);

    fireEvent.click(screen.getByRole("button", { name: "Download HD Portrait" }));

    await waitFor(() => expect(downloadedFileName).toMatch(/\.jpg$/));
    expect(mocks.openRazorpayCheckout).not.toHaveBeenCalled();
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
  });

  it("does not request the HD output when checkout is cancelled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.openRazorpayCheckout.mockRejectedValueOnce(
      new Error("Payment was not completed."),
    );
    render(<PortraitDownloadButton jobToken={jobToken} />);

    fireEvent.click(screen.getByRole("button", { name: "Download HD Portrait" }));

    expect(await screen.findByText("Payment was not completed.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
