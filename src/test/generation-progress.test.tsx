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
  createPaymentOrder: vi.fn(),
  openRazorpayCheckout: vi.fn(),
  verifyPayment: vi.fn(),
  startGeneration: vi.fn(),
  getGeneration: vi.fn(),
  trackCheckoutStarted: vi.fn(),
  trackPurchase: vi.fn(),
  trackGenerationCompleted: vi.fn(),
  trackGenerationFailed: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
}));
vi.mock("@/features/portrait-flow/payment-client", () => ({
  createPaymentOrder: mocks.createPaymentOrder,
  openRazorpayCheckout: mocks.openRazorpayCheckout,
  verifyPayment: mocks.verifyPayment,
}));
vi.mock("@/features/portrait-flow/generation-client", () => ({
  startGeneration: mocks.startGeneration,
  getGeneration: mocks.getGeneration,
}));
vi.mock("@/lib/analytics", () => ({
  normalizeGenerationError: () => "generation_error",
  trackCheckoutStarted: mocks.trackCheckoutStarted,
  trackPurchase: mocks.trackPurchase,
  trackGenerationCompleted: mocks.trackGenerationCompleted,
  trackGenerationFailed: mocks.trackGenerationFailed,
}));

const requestId = "67de847e-8e05-4f44-a78b-b1d19dc0b227";

function intent(update: Partial<PendingGenerationIntent> = {}): PendingGenerationIntent {
  return {
    version: 1,
    requestId,
    templateId: "janmashtami-krishna-makhan-001",
    photos: { childAssetId: "47de847e-8e05-4f44-a78b-b1d19dc0b225" },
    phase: "PREPARING_PAYMENT",
    autoStart: true,
    ...update,
  };
}

describe("GenerationProgress payment experience", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    mocks.createPaymentOrder.mockResolvedValue({
      paymentId: requestId,
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
    mocks.startGeneration.mockResolvedValue({
      jobToken: requestId,
      templateId: "janmashtami-krishna-makhan-001",
      status: "complete",
    });
  });

  it("verifies payment before starting generation and redirects to the result", async () => {
    storePendingGenerationIntent(window.localStorage, intent());
    render(<GenerationProgress jobToken={requestId} />);

    expect(
      screen.getByRole("heading", { name: "Creating your special moment…" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(`/result/${requestId}`),
    );
    expect(mocks.createPaymentOrder).toHaveBeenCalledTimes(1);
    expect(mocks.openRazorpayCheckout).toHaveBeenCalledTimes(1);
    expect(mocks.verifyPayment).toHaveBeenCalledTimes(1);
    expect(mocks.verifyPayment.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.startGeneration.mock.invocationCallOrder[0]!,
    );
    expect(mocks.trackCheckoutStarted).toHaveBeenCalledOnce();
    expect(mocks.trackPurchase).toHaveBeenCalledWith(
      "order_test",
      expect.objectContaining({ currency: "INR", value: 29 }),
    );
    expect(mocks.trackGenerationCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ id: "janmashtami-krishna-makhan-001" }),
      requestId,
    );
  });

  it("keeps the user on the special-moment page and retries cancelled payment", async () => {
    const user = userEvent.setup();
    storePendingGenerationIntent(window.localStorage, intent());
    mocks.openRazorpayCheckout.mockRejectedValueOnce(
      new Error("Payment was not completed."),
    );
    render(<GenerationProgress jobToken={requestId} />);

    expect(await screen.findByText("Payment was not completed.")).toBeVisible();
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
    expect(mocks.startGeneration).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Try Payment Again" }));
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(`/result/${requestId}`),
    );
    expect(mocks.createPaymentOrder).toHaveBeenCalledTimes(2);
  });

  it("does not reopen Checkout automatically after a failed-page refresh", async () => {
    storePendingGenerationIntent(
      window.localStorage,
      intent({ phase: "FAILED", autoStart: false, failureKind: "PAYMENT" }),
    );
    render(<GenerationProgress jobToken={requestId} />);

    expect(await screen.findByText("Payment was not completed.")).toBeVisible();
    expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
    expect(mocks.startGeneration).not.toHaveBeenCalled();
  });

  it("retries a failed generation without reopening paid Checkout", async () => {
    const user = userEvent.setup();
    storePendingGenerationIntent(
      window.localStorage,
      intent({ phase: "FAILED", autoStart: false, failureKind: "GENERATION" }),
    );
    mocks.createPaymentOrder.mockResolvedValueOnce({
      paymentId: requestId,
      razorpayOrderId: "order_paid",
      razorpayKeyId: "rzp_live_example",
      amount: 2900,
      currency: "INR",
      displayAmount: "₹29",
      paid: true,
    });
    render(<GenerationProgress jobToken={requestId} />);

    await user.click(screen.getByRole("button", { name: "Try Generation Again" }));
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(`/result/${requestId}`),
    );
    expect(mocks.createPaymentOrder).toHaveBeenCalledOnce();
    expect(mocks.openRazorpayCheckout).not.toHaveBeenCalled();
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
    expect(mocks.startGeneration).toHaveBeenCalledOnce();
  });

  it("resumes an already-paid generation without creating another payment", async () => {
    storePendingGenerationIntent(
      window.localStorage,
      intent({ phase: "GENERATING", autoStart: false }),
    );
    render(<GenerationProgress jobToken={requestId} />);

    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(`/result/${requestId}`),
    );
    expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
    expect(mocks.startGeneration).toHaveBeenCalledTimes(1);
  });

  it("skips Checkout when a webhook already confirmed the payment", async () => {
    storePendingGenerationIntent(window.localStorage, intent());
    mocks.createPaymentOrder.mockResolvedValueOnce({
      paymentId: requestId,
      razorpayOrderId: "order_paid",
      razorpayKeyId: "rzp_live_example",
      amount: 2900,
      currency: "INR",
      displayAmount: "₹29",
      paid: true,
    });
    render(<GenerationProgress jobToken={requestId} />);

    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(`/result/${requestId}`),
    );
    expect(mocks.openRazorpayCheckout).not.toHaveBeenCalled();
    expect(mocks.verifyPayment).not.toHaveBeenCalled();
    expect(mocks.startGeneration).toHaveBeenCalledTimes(1);
    expect(mocks.trackPurchase).toHaveBeenCalledWith(
      "order_paid",
      expect.objectContaining({ currency: "INR", value: 29 }),
    );
  });
});
