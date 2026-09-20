import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { relationships } from "@/config/relationships";
import { getPortraitTemplatesForRelationship } from "@/config/portrait-templates";
import { PhotoUploadPage } from "@/features/photo-upload/components/photo-upload-page";
import type { ImageQualityAnalyzer } from "@/features/photo-upload/quality-analyzer";
import type { ImageQualityResult } from "@/features/photo-upload/types";
import { PORTRAIT_FLOW_STORAGE_KEY } from "@/features/portrait-flow/storage";
import { readPendingGenerationIntent } from "@/features/portrait-flow/generation-intent-storage";

const mocks = vi.hoisted(() => ({
  startGeneration: vi.fn(),
  push: vi.fn(),
  normalize: vi.fn(),
  prepare: vi.fn(),
  send: vi.fn(),
  finalize: vi.fn(),
  remove: vi.fn(),
  preview: vi.fn(),
  createPaymentOrder: vi.fn(),
  openRazorpayCheckout: vi.fn(),
  verifyPayment: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/features/portrait-flow/generation-client", () => ({
  startGeneration: mocks.startGeneration,
}));
vi.mock("@/features/portrait-flow/payment-client", () => ({
  createPaymentOrder: mocks.createPaymentOrder,
  openRazorpayCheckout: mocks.openRazorpayCheckout,
  verifyPayment: mocks.verifyPayment,
}));
vi.mock("@/features/photo-upload/normalization", () => ({
  normalizePhoto: mocks.normalize,
}));
vi.mock("@/features/photo-upload/upload-client", () => ({
  prepareUpload: mocks.prepare,
  sendPreparedUpload: mocks.send,
  finalizeUpload: mocks.finalize,
  deleteUpload: mocks.remove,
  getPreview: mocks.preview,
}));

const passAnalyzer: ImageQualityAnalyzer = {
  analyze: vi.fn(async (): Promise<ImageQualityResult> => ({
    status: "pass",
    faceCount: 1,
    faceBoundingBox: { x: 0.1, y: 0.1, width: 0.7, height: 0.7 },
    faceSizeRatio: 0.49,
    faceSharpness: 120,
    overallSharpness: 100,
    brightness: 120,
    reasons: [],
  })),
};
const selectedFile = new File([new Uint8Array([1, 2, 3])], "portrait.jpg", {
  type: "image/jpeg",
});

describe("PhotoUploadPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => `blob:${crypto.randomUUID()}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    mocks.normalize.mockResolvedValue({
      file: selectedFile,
      width: 800,
      height: 900,
      sourceFormat: "jpeg",
    });
    mocks.prepare.mockImplementation(async ({ role }: { role: string }) => ({
      uploadId:
        role === "first"
          ? "27de847e-8e05-4f44-a78b-b1d19dc0b223"
          : "37de847e-8e05-4f44-a78b-b1d19dc0b224",
      uploadUrl: "/raw",
      uploadKind: "binary",
      uploadHeaders: {},
    }));
    mocks.send.mockImplementation(
      async (_prepared: unknown, _file: File, progress: (value: number) => void) =>
        progress(100),
    );
    mocks.finalize.mockImplementation(async ({ role }: { role: "first" | "second" }) => ({
      assetId:
        role === "first"
          ? "47de847e-8e05-4f44-a78b-b1d19dc0b225"
          : "57de847e-8e05-4f44-a78b-b1d19dc0b226",
      role,
      validationStatus: "pass",
      width: 800,
      height: 900,
    }));
    mocks.remove.mockResolvedValue(undefined);
    mocks.startGeneration.mockResolvedValue({
      jobToken: "67de847e-8e05-4f44-a78b-b1d19dc0b227",
      templateId: "rakhi-brother-sister-traditional-001",
      status: "queued",
    });
    mocks.createPaymentOrder.mockResolvedValue({
      paymentId: "67de847e-8e05-4f44-a78b-b1d19dc0b227",
      razorpayOrderId: "order_test",
      razorpayKeyId: "rzp_test_example",
      amount: 2900,
      currency: "INR",
      displayAmount: "₹29",
    });
    mocks.openRazorpayCheckout.mockResolvedValue({
      razorpay_payment_id: "pay_test",
      razorpay_order_id: "order_test",
      razorpay_signature: "a".repeat(64),
    });
    mocks.verifyPayment.mockResolvedValue({ paid: true });
  });

  function selectRelationship(id: string) {
    const defaultTemplate = getPortraitTemplatesForRelationship(
      id as (typeof relationships)[number]["id"],
    )[0]?.id;
    window.localStorage.setItem(
      PORTRAIT_FLOW_STORAGE_KEY,
      JSON.stringify({ version: 1, relationship: id, template: defaultTemplate }),
    );
  }

  it.each(relationships)("uses configured labels for $title", async (relationship) => {
    selectRelationship(relationship.id);
    const view = render(<PhotoUploadPage analyzer={passAnalyzer} />);
    expect(
      await screen.findByRole("heading", { name: relationship.firstPersonLabel }),
    ).toBeVisible();
    if (relationship.photoCount === 2)
      expect(
        screen.getByRole("heading", { name: relationship.secondPersonLabel }),
      ).toBeVisible();
    else
      expect(
        screen.queryByRole("heading", { name: relationship.secondPersonLabel }),
      ).not.toBeInTheDocument();
    view.unmount();
  });

  it("starts the unified flow with a large static template gallery", async () => {
    const { container } = render(<PhotoUploadPage analyzer={passAnalyzer} />);
    expect(
      await screen.findByRole("heading", {
        name: "Choose your portrait template",
      }),
    ).toBeVisible();
    expect(
      screen.getAllByRole("radio").map((radio) => radio.getAttribute("value")),
    ).toEqual([
      "retro-girl-template-001",
      "retro-single-boy-001",
      "retro-couple-scooter-001",
      "retro-girl-car-001",
      "retro-couple-bullet-001",
      "retro-video-rental-001",
      "retro-girl-camera-001",
      "retro-boy-car-001",
      "retro-family-001",
      "janmashtami-little-krishna-001",
      "janmashtami-radha-krishna-couple-001",
      "janmashtami-wish-flute-001",
      "janmashtami-wish-portrait-001",
      "janmashtami-mother-daughter-radha-001",
    ]);
    expect(
      screen.queryByRole("radio", { name: /Traditional Rakhi Celebration/i }),
    ).toBeNull();
    expect(screen.queryByRole("radio", { name: /Makhan Chor Krishna/i })).toBeNull();
    expect(
      container.querySelector('img[src$="/templates/retro-girl-template-v1.webp"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('img[src^="/api/templates/"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeVisible();
  });

  it("keeps Next on /create and moves focus to the upload step", async () => {
    const user = userEvent.setup();
    selectRelationship("janmashtami-child");
    render(<PhotoUploadPage analyzer={passAnalyzer} />);

    await user.click(await screen.findByRole("button", { name: "Next" }));

    expect(
      screen.getByRole("heading", { name: "Upload Your Child's Photo" }),
    ).toHaveFocus();
    expect(screen.getByRole("button", { name: "Generate Portrait" })).toBeVisible();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("asks for a template before Next can advance", async () => {
    const user = userEvent.setup();
    render(<PhotoUploadPage analyzer={passAnalyzer} />);

    await user.click(await screen.findByRole("button", { name: "Next" }));

    expect(screen.getByText("Please select a template first.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(
      screen.getByRole("heading", { name: "Choose your portrait template" }),
    ).toHaveFocus();
  });

  it("provides a front-camera input with a gallery fallback", async () => {
    selectRelationship("janmashtami-child");
    const { container } = render(<PhotoUploadPage analyzer={passAnalyzer} />);
    await screen.findByText("Upload Your Child's Photo");
    const cameraInputs = container.querySelectorAll('input[type="file"][capture="user"]');
    expect(cameraInputs).toHaveLength(1);
    expect(container.querySelectorAll('input[type="file"]:not([capture])')).toHaveLength(
      1,
    );
  });

  it("accepts desktop drag and drop", async () => {
    selectRelationship("mother-child");
    const failAnalyzer: ImageQualityAnalyzer = {
      analyze: vi.fn(async (): Promise<ImageQualityResult> => ({
        status: "fail",
        faceCount: 0,
        faceBoundingBox: null,
        faceSizeRatio: 0,
        faceSharpness: 0,
        overallSharpness: 0,
        brightness: 0,
        reasons: ["no-face"],
      })),
    };
    render(<PhotoUploadPage analyzer={failAnalyzer} />);
    const card = (
      await screen.findByRole("heading", { name: "Mother & Daughter Photo" })
    ).closest("section");
    fireEvent.drop(card!, { dataTransfer: { files: [selectedFile] } });
    await waitFor(() =>
      expect(mocks.normalize).toHaveBeenCalledWith(selectedFile, expect.any(Function)),
    );
    await screen.findByText(/couldn’t clearly detect a face/i);
  });

  it("keeps Generate Portrait actionable and explains a missing child photo", async () => {
    const user = userEvent.setup();
    selectRelationship("janmashtami-child");
    render(<PhotoUploadPage analyzer={passAnalyzer} />);
    await user.click(await screen.findByRole("button", { name: "Next" }));

    const generateButton = await screen.findByRole("button", {
      name: "Generate Portrait",
    });
    expect(generateButton).toBeEnabled();
    await user.click(generateButton);

    expect(screen.getByText("Please upload your child's photo first.")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(
      screen.getByRole("heading", { name: "Upload Your Child's Photo" }),
    ).toHaveFocus();
    expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
    expect(mocks.startGeneration).not.toHaveBeenCalled();
  });

  it("uploads and permits a photo when no face is detected", async () => {
    const user = userEvent.setup();
    const failAnalyzer: ImageQualityAnalyzer = {
      analyze: vi.fn(async (): Promise<ImageQualityResult> => ({
        status: "fail",
        faceCount: 0,
        faceBoundingBox: null,
        faceSizeRatio: 0,
        faceSharpness: 0,
        overallSharpness: 0,
        brightness: 0,
        reasons: ["no-face"],
      })),
    };
    selectRelationship("janmashtami-child");
    render(<PhotoUploadPage analyzer={failAnalyzer} />);
    await user.click(await screen.findByRole("button", { name: "Next" }));
    await user.upload(
      (await screen.findAllByLabelText(/^Choose .+Photo$/))[0]!,
      selectedFile,
    );
    await waitFor(() =>
      expect(mocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({
          clientQualityStatus: "warning-accepted",
          faceBoundingBox: null,
        }),
      ),
    );
    expect(
      await screen.findByText(/You can still use this photo.*Photo uploaded and ready/i),
    ).toBeVisible();
  });

  it("uploads a photo automatically when quality has only a warning", async () => {
    const user = userEvent.setup();
    const warningAnalyzer: ImageQualityAnalyzer = {
      analyze: vi.fn(async (): Promise<ImageQualityResult> => ({
        status: "warning",
        faceCount: 1,
        faceBoundingBox: { x: 0.35, y: 0.2, width: 0.15, height: 0.2 },
        faceSizeRatio: 0.03,
        faceSharpness: 120,
        overallSharpness: 100,
        brightness: 120,
        reasons: ["face-too-small"],
      })),
    };
    selectRelationship("janmashtami-child");
    render(<PhotoUploadPage analyzer={warningAnalyzer} />);

    await user.upload(
      (await screen.findAllByLabelText(/^Choose .+Photo$/))[0]!,
      selectedFile,
    );

    await waitFor(() =>
      expect(mocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ clientQualityStatus: "warning-accepted" }),
      ),
    );
    expect(await screen.findByText(/Photo uploaded and ready to use/i)).toBeVisible();
  });

  it("retries storage without making the user select the photo again", async () => {
    const user = userEvent.setup();
    mocks.prepare.mockRejectedValueOnce(
      new Error("Photo storage is temporarily unavailable. Please retry in a moment."),
    );
    selectRelationship("janmashtami-child");
    render(<PhotoUploadPage analyzer={passAnalyzer} />);

    await user.upload(
      (await screen.findAllByLabelText(/^Choose .+Photo$/))[0]!,
      selectedFile,
    );
    await user.click(await screen.findByRole("button", { name: "Retry Upload" }));

    expect(await screen.findByText("Photo looks good")).toBeVisible();
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
  });

  it("does not restore a template removed from the selector", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      PORTRAIT_FLOW_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        relationship: "brother-sister",
        template: "rakhi-brother-sister-traditional-001",
      }),
    );
    render(<PhotoUploadPage analyzer={passAnalyzer} />);
    expect(
      await screen.findByRole("heading", { name: "Choose your portrait template" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("radio", { name: /Traditional Rakhi Celebration/i }),
    ).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Next" }));
    expect(screen.getByText("Please select a template first.")).toHaveAttribute(
      "role",
      "alert",
    );
  });

  it("asks for woman and man photos for the Radha Krishna couple", async () => {
    const user = userEvent.setup();
    selectRelationship("radha-krishna-couple");
    render(<PhotoUploadPage analyzer={passAnalyzer} />);

    expect(
      await screen.findByRole("radio", { name: /Radha Krishna Couple/i }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByText("Use close, front-facing or slight three-quarter portraits."),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Keep both faces sharp, well lit, unobstructed, and without filters.",
      ),
    ).toBeVisible();
    await user.upload(screen.getByLabelText("Choose Woman’s Photo"), selectedFile);
    await user.upload(screen.getByLabelText("Choose Man’s Photo"), selectedFile);
    await user.click(screen.getByRole("checkbox", { name: /permission/i }));
    await user.click(screen.getByRole("button", { name: /Generate/ }));

    const intent = readPendingGenerationIntent(window.localStorage);
    expect(intent).toMatchObject({
      templateId: "janmashtami-radha-krishna-couple-001",
      photos: {
        womanAssetId: "47de847e-8e05-4f44-a78b-b1d19dc0b225",
        manAssetId: "57de847e-8e05-4f44-a78b-b1d19dc0b226",
      },
    });
  });

  it("shows Retro templates first under the Trending category in mapped order", async () => {
    render(<PhotoUploadPage analyzer={passAnalyzer} />);
    expect(await screen.findByText("🔥 Trending")).toBeVisible();
    const templateNames = screen
      .getAllByRole("radio")
      .slice(0, 9)
      .map((radio) => radio.getAttribute("value"));
    expect(templateNames).toEqual([
      "retro-girl-template-001",
      "retro-single-boy-001",
      "retro-couple-scooter-001",
      "retro-girl-car-001",
      "retro-couple-bullet-001",
      "retro-video-rental-001",
      "retro-girl-camera-001",
      "retro-boy-car-001",
      "retro-family-001",
    ]);
  });

  it.each([
    [
      "Couple Bullet",
      "retro-couple-bullet-001",
      "Upload One Couple Photo",
      "Couple Photo",
    ],
    [
      "Couple Scooter",
      "retro-couple-scooter-001",
      "Upload One Couple Photo",
      "Couple Photo",
    ],
    ["Retro Family", "retro-family-001", "Upload One Family Photo", "Family Photo"],
  ])("collects one combined upload for %s", async (name, templateId, heading, label) => {
    const user = userEvent.setup();
    render(<PhotoUploadPage analyzer={passAnalyzer} />);
    await user.click(await screen.findByRole("radio", { name: new RegExp(name, "i") }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    await user.upload(screen.getByLabelText(`Choose ${label}`), selectedFile);
    await user.click(screen.getByRole("checkbox", { name: /permission/i }));
    await user.click(screen.getByRole("button", { name: /Generate/ }));

    expect(readPendingGenerationIntent(window.localStorage)).toMatchObject({
      templateId,
      photos: { subjectAssetId: "47de847e-8e05-4f44-a78b-b1d19dc0b225" },
    });
  });

  it("uses one subject upload for a standard Retro template", async () => {
    const user = userEvent.setup();
    render(<PhotoUploadPage analyzer={passAnalyzer} />);
    await user.click(await screen.findByRole("radio", { name: /80s Retro Girl/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Upload Your Photo" })).toBeVisible();
    await user.upload(screen.getByLabelText("Choose Your Photo"), selectedFile);
    await user.click(screen.getByRole("checkbox", { name: /permission/i }));
    await user.click(screen.getByRole("button", { name: /Generate/ }));

    expect(readPendingGenerationIntent(window.localStorage)).toMatchObject({
      templateId: "retro-girl-template-001",
      photos: { subjectAssetId: "47de847e-8e05-4f44-a78b-b1d19dc0b225" },
    });
  });

  it("clears an incompatible combined couple upload when switching templates", async () => {
    const user = userEvent.setup();
    const { container } = render(<PhotoUploadPage analyzer={passAnalyzer} />);
    await user.click(await screen.findByRole("radio", { name: /Couple Bullet/i }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.upload(screen.getByLabelText("Choose Couple Photo"), selectedFile);

    await user.click(screen.getByRole("radio", { name: /80s Retro Girl/i }));
    await user.click(await screen.findByRole("button", { name: "Next" }));

    expect(container.querySelectorAll('input[type="file"]:not([capture])')).toHaveLength(
      1,
    );
    expect(screen.queryByText("Photo looks good")).not.toBeInTheDocument();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
  });

  it("persists a Janmashtami intent with exactly one child photo", async () => {
    const user = userEvent.setup();
    selectRelationship("janmashtami-child");
    mocks.startGeneration.mockResolvedValueOnce({
      jobToken: "77de847e-8e05-4f44-a78b-b1d19dc0b228",
      templateId: "janmashtami-little-krishna-001",
      status: "complete",
    });
    const { container } = render(<PhotoUploadPage analyzer={passAnalyzer} />);
    expect(
      await screen.findByRole("radio", { name: /Little Krishna Matki/ }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(container.querySelectorAll('input[type="file"]:not([capture])')).toHaveLength(
      1,
    );
    await user.upload(screen.getByLabelText("Choose Child’s Photo"), selectedFile);
    await user.click(screen.getByRole("checkbox", { name: /permission/i }));
    await user.click(screen.getByRole("button", { name: /Generate/ }));
    const intent = readPendingGenerationIntent(window.localStorage);
    expect(intent).toMatchObject({
      templateId: "janmashtami-little-krishna-001",
      photos: { childAssetId: "47de847e-8e05-4f44-a78b-b1d19dc0b225" },
    });
    expect(mocks.push).toHaveBeenCalledWith(
      `/create/generating?jobToken=${intent!.requestId}`,
    );
  });

  it("accepts one combined mother-daughter photo for Mother & Little Radha", async () => {
    const user = userEvent.setup();
    selectRelationship("mother-child");
    const { container } = render(<PhotoUploadPage analyzer={passAnalyzer} />);

    expect(
      await screen.findByRole("radio", { name: /Mother & Little Radha/i }),
    ).toBeChecked();
    expect(screen.getAllByRole("radio").at(-1)).toHaveAccessibleName(
      /Mother & Little Radha/i,
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("heading", { name: "Upload One Mother & Daughter Photo" }),
    ).toBeVisible();
    expect(container.querySelectorAll('input[type="file"]:not([capture])')).toHaveLength(
      1,
    );
    await user.upload(
      screen.getByLabelText("Choose Mother & Daughter Photo"),
      selectedFile,
    );
    await user.click(screen.getByRole("checkbox", { name: /permission/i }));
    await user.click(screen.getByRole("button", { name: /Generate/ }));

    expect(readPendingGenerationIntent(window.localStorage)).toMatchObject({
      templateId: "janmashtami-mother-daughter-radha-001",
      photos: {
        motherDaughterAssetId: "47de847e-8e05-4f44-a78b-b1d19dc0b225",
      },
    });
  });

  it("does not show a multiple-face warning for the two-person mother-daughter template", async () => {
    const user = userEvent.setup();
    const twoFaceAnalyzer: ImageQualityAnalyzer = {
      analyze: vi.fn(async (): Promise<ImageQualityResult> => ({
        status: "warning",
        faceCount: 2,
        faceBoundingBox: null,
        faceSizeRatio: 0,
        faceSharpness: 120,
        overallSharpness: 100,
        brightness: 120,
        reasons: ["multiple-faces"],
      })),
    };
    selectRelationship("mother-child");
    render(<PhotoUploadPage analyzer={twoFaceAnalyzer} />);

    await user.upload(
      await screen.findByLabelText("Choose Mother & Daughter Photo"),
      selectedFile,
    );

    await waitFor(() =>
      expect(mocks.finalize).toHaveBeenCalledWith(
        expect.objectContaining({
          clientQualityStatus: "pass",
          faceBoundingBox: null,
        }),
      ),
    );
    expect(screen.queryByText(/more than one person/i)).not.toBeInTheDocument();
    expect(await screen.findByText("Photo looks good")).toBeVisible();
  });

  it("shows photo privacy, price, and linked child-photo consent before generation", async () => {
    const user = userEvent.setup();
    selectRelationship("janmashtami-child");
    render(<PhotoUploadPage analyzer={passAnalyzer} />);
    await screen.findByText("Upload Your Child's Photo");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("₹29")).toBeVisible();
    expect(screen.getByText("1 AI Portrait Generation")).toBeVisible();
    expect(screen.getByRole("button", { name: "Generate Portrait" })).toBeVisible();
    expect(
      screen.getByText(/Sanitized uploads are kept privately for up to 24 hours/i),
    ).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: /parent or legal guardian/i }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/privacy-policy",
    );
    expect(screen.getByRole("link", { name: "Terms & Conditions" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });

  it("revokes local previews when the component is removed", async () => {
    const user = userEvent.setup();
    selectRelationship("father-child");
    const view = render(<PhotoUploadPage analyzer={passAnalyzer} />);
    await user.upload(
      (await screen.findAllByLabelText(/^Choose .+Photo$/))[0]!,
      selectedFile,
    );
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
