import { describe, expect, it } from "vitest";
import {
  applyExpectedFaceCount,
  classifyQuality,
  laplacianVariance,
} from "@/features/photo-upload/quality";

const base = {
  faceCount: 1,
  faceBoundingBox: { x: 0.2, y: 0.2, width: 0.5, height: 0.5 },
  faceSizeRatio: 0.25,
  faceSharpness: 120,
  overallSharpness: 100,
  brightness: 128,
  cropped: false,
  shortestSide: 1024,
};

describe("photo quality classification", () => {
  it("passes a clear, well-lit single face", () =>
    expect(classifyQuality(base).status).toBe("pass"));
  it("warns without blocking when no face is detected", () =>
    expect(
      classifyQuality({ ...base, faceCount: 0, faceBoundingBox: null }),
    ).toMatchObject({ status: "warning", reasons: ["no-face"] }));
  it("warns without blocking when multiple faces are detected", () =>
    expect(classifyQuality({ ...base, faceCount: 2 }).status).toBe("warning"));
  it("accepts exactly two detected faces when the template expects two people", () =>
    expect(
      applyExpectedFaceCount(classifyQuality({ ...base, faceCount: 2 }), 2),
    ).toMatchObject({ status: "pass", faceCount: 2, reasons: [] }));
  it("accepts exactly three detected faces when the template expects a family", () =>
    expect(
      applyExpectedFaceCount(classifyQuality({ ...base, faceCount: 3 }), 3),
    ).toMatchObject({ status: "pass", faceCount: 3, reasons: [] }));
  it("keeps the multiple-face warning when more people than expected are detected", () =>
    expect(
      applyExpectedFaceCount(classifyQuality({ ...base, faceCount: 3 }), 2).reasons,
    ).toContain("multiple-faces"));
  it("warns without blocking an extremely small face", () =>
    expect(classifyQuality({ ...base, faceSizeRatio: 0.005 }).status).toBe("warning"));
  it("warns without blocking a detailed face in a wider portrait", () =>
    expect(classifyQuality({ ...base, faceSizeRatio: 0.02 }).status).toBe("warning"));
  it("warns about borderline blur", () =>
    expect(classifyQuality({ ...base, faceSharpness: 60 }).reasons).toContain(
      "blur-warning",
    ));
  it("warns without blocking even for severe face blur", () => {
    const result = classifyQuality({ ...base, faceSharpness: 10 });
    expect(result.status).toBe("warning");
    expect(result.reasons).toContain("blur-warning");
  });
  it("warns when the face touches an image edge", () =>
    expect(classifyQuality({ ...base, cropped: true }).reasons).toContain(
      "face-cropped",
    ));
  it("warns without blocking severe darkness", () =>
    expect(classifyQuality({ ...base, brightness: 10 }).status).toBe("warning"));
  it("warns without blocking severe overexposure", () =>
    expect(classifyQuality({ ...base, brightness: 250 }).status).toBe("warning"));
  it("measures edges using Laplacian variance", () => {
    const flat = new Uint8ClampedArray(25).fill(100);
    const edged = new Uint8ClampedArray([
      0, 0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 255, 0, 0, 0, 0, 0, 0,
    ]);
    expect(laplacianVariance(edged, 5, 5)).toBeGreaterThan(laplacianVariance(flat, 5, 5));
  });
});
