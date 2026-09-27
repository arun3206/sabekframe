import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationProgress } from "@/features/portrait-flow/components/generation-progress";
import {
  storePendingGenerationIntent,
  type PendingGenerationIntent,
} from "@/features/portrait-flow/generation-intent-storage";

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn() },
  getPaymentTiming: vi.fn(() => "PREVIEW_THEN_PAY"),
  startGeneration: vi.fn(),
  getGeneration: vi.fn(),
  createPaymentOrder: vi.fn(),
  openRazorpayCheckout: vi.fn(),
  verifyPayment: vi.fn(),
  trackCheckoutStarted: vi.fn(),
  trackGenerationCompleted: vi.fn(),
  trackGenerationFailed: vi.fn(),
  trackPurchase: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));
vi.mock("@/config/portrait-templates", () => ({
  getActivePortraitTemplate: (templateId: string) => ({
    id: templateId,
    name: "Test portrait",
    paymentTiming: mocks.getPaymentTiming(),
  }),
}));
vi.mock("@/features/portrait-flow/generation-client", () => ({
  startGeneration: mocks.startGeneration,
  getGeneration: mocks.getGeneration,
}));
vi.mock("@/features/portrait-flow/payment-client", () => ({
  createPaymentOrder: mocks.createPaymentOrder,
  openRazorpayCheckout: mocks.openRazorpayCheckout,
  verifyPayment: mocks.verifyPayment,
}));
vi.mock("@/lib/analytics", () => ({
  normalizeGenerationError: () => "generation_error",
  trackCheckoutStarted: mocks.trackCheckoutStarted,
  trackGenerationCompleted: mocks.trackGenerationCompleted,
  trackGenerationFailed: mocks.trackGenerationFailed,
  trackPurchase: mocks.trackPurchase,
}));

const requestId = "67de847e-8e05-4f44-a78b-b1d19dc0b227";
const templateId = "janmashtami-krishna-makhan-001";

function intent(update: Partial<PendingGenerationIntent> = {}): PendingGenerationIntent {
  return {
    version: 1,
    requestId,
    templateId,
    photos: { childAssetId: "47de847e-8e05-4f44-a78b-b1d19dc0b225" },
    phase: "GENERATING",
    autoStart: true,
    ...update,
  };
}

describe("GenerationProgress payment timing", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mocks.getPaymentTiming.mockReturnValue("PREVIEW_THEN_PAY");
    mocks.startGeneration.mockResolvedValue({
      jobToken: requestId,
      templateId,
      status: "complete",
    });
    mocks.createPaymentOrder.mockResolvedValue({
      paymentId: requestId,
      razorpayOrderId: "order_test",
      razorpayKeyId: "rzp_test_key",
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
          razorpay_signature: "signature",
        };
      },
    );
    mocks.verifyPayment.mockResolvedValue({ paid: true });
  });

  it("starts preview-first generation without opening payment", async () => {
    storePendingGenerationIntent(window.localStorage, intent());
    render(<GenerationProgress jobToken={requestId} />);

    expect(
      screen.getByRole("heading", { name: "Creating your special moment…" }),
    ).toBeVisible();
    expect(screen.getByText(/No payment is needed yet/)).toBeVisible();
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(`/result/${requestId}`),
    );
    expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
    expect(mocks.startGeneration).toHaveBeenCalledTimes(1);
    expect(mocks.trackGenerationCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ id: templateId }),
      requestId,
    );
  });

  it("verifies payment before starting a payment-first generation", async () => {
    mocks.getPaymentTiming.mockReturnValue("PAY_THEN_GENERATE");
    storePendingGenerationIntent(window.localStorage, intent());
    render(<GenerationProgress jobToken={requestId} />);

    await waitFor(() => expect(mocks.startGeneration).toHaveBeenCalledOnce());

    expect(mocks.createPaymentOrder).toHaveBeenCalledWith(requestId, templateId);
    expect(mocks.openRazorpayCheckout).toHaveBeenCalledOnce();
    expect(mocks.verifyPayment).toHaveBeenCalledWith(requestId, {
      razorpay_payment_id: "pay_test",
      razorpay_order_id: "order_test",
      razorpay_signature: "signature",
    });
    expect(mocks.verifyPayment.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.startGeneration.mock.invocationCallOrder[0],
    );
    expect(mocks.trackCheckoutStarted).toHaveBeenCalledOnce();
    expect(mocks.trackPurchase).toHaveBeenCalledOnce();
  });

  it("keeps a failed generation paused until the user retries", async () => {
    const user = userEvent.setup();
    storePendingGenerationIntent(
      window.localStorage,
      intent({ phase: "FAILED", autoStart: false, failureKind: "GENERATION" }),
    );
    render(<GenerationProgress jobToken={requestId} />);

    expect(await screen.findByText("We couldn’t finish this portrait.")).toBeVisible();
    expect(mocks.startGeneration).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Try Generation Again" }));
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(`/result/${requestId}`),
    );
    expect(mocks.startGeneration).toHaveBeenCalledOnce();
  });

  it("restores a failed payment with the payment retry action", async () => {
    mocks.getPaymentTiming.mockReturnValue("PAY_THEN_GENERATE");
    storePendingGenerationIntent(
      window.localStorage,
      intent({ phase: "FAILED", autoStart: false, failureKind: "PAYMENT" }),
    );
    render(<GenerationProgress jobToken={requestId} />);

    expect(await screen.findByText("Payment was not completed.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Try Payment Again" })).toBeVisible();
    expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("restores an existing job by polling when local generation details are absent", async () => {
    mocks.getGeneration.mockResolvedValue({
      jobToken: requestId,
      templateId,
      status: "complete",
    });
    render(<GenerationProgress jobToken={requestId} />);

    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(`/result/${requestId}`),
    );
    expect(mocks.getGeneration).toHaveBeenCalledWith(requestId);
    expect(mocks.startGeneration).not.toHaveBeenCalled();
  });
});
