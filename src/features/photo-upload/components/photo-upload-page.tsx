"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  CheckCircle2,
  ImagePlus,
  RefreshCw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { MobilePageContainer } from "@/components/layout/mobile-page-container";
import { StickyBottomAction } from "@/components/layout/sticky-bottom-action";
import { photoUploadRestrictions } from "@/config/photo-upload";
import { formatPrice, pricing } from "@/config/pricing";
import {
  getActivePortraitTemplate,
  getSelectablePortraitTemplateSections,
  getSelectablePortraitTemplatesForRelationship,
} from "@/config/portrait-templates";
import type { PortraitTemplateConfiguration } from "@/config/portrait-templates";
import { relationships } from "@/config/relationships";
import type {
  ImageQualityResult,
  NormalizedImage,
  PhotoRole,
  StoredUploadAsset,
} from "@/features/photo-upload/types";
import { normalizePhoto } from "@/features/photo-upload/normalization";
import {
  browserImageQualityAnalyzer,
  type ImageQualityAnalyzer,
} from "@/features/photo-upload/quality-analyzer";
import { applyExpectedFaceCount } from "@/features/photo-upload/quality";
import {
  deleteUpload,
  finalizeUpload,
  getPreview,
  prepareUpload,
  sendPreparedUpload,
} from "@/features/photo-upload/upload-client";
import {
  readStoredPortraitFlow,
  removeStoredAsset,
  storePortraitTemplate,
  storeRelationship,
  storeUploadedAsset,
} from "@/features/portrait-flow/storage";
import { storePendingGenerationIntent } from "@/features/portrait-flow/generation-intent-storage";
import type { PortraitTemplate, Relationship } from "@/features/portrait-flow/types";
import {
  trackGenerateClicked,
  trackPhotoUploaded,
  trackTemplateSelected,
} from "@/lib/analytics";
import styles from "./photo-upload-page.module.css";

type Stage =
  | "empty"
  | "reading"
  | "converting"
  | "normalizing"
  | "checking"
  | "warning"
  | "ready"
  | "uploading"
  | "server"
  | "success"
  | "failure";
type ValidationTarget = "template" | "upload" | "consent";
interface SlotState {
  stage: Stage;
  previewUrl?: string;
  normalized?: NormalizedImage;
  quality?: ImageQualityResult;
  asset?: StoredUploadAsset;
  progress?: number;
  message?: string;
}
const emptySlot = (): SlotState => ({ stage: "empty" });
const reasonMessages: Record<string, string> = {
  "no-face":
    "We couldn’t clearly detect a face. You can still use this photo, though a front-facing face may work better.",
  "multiple-faces":
    "We detected more than one person. You can still use this photo, but the AI may choose the wrong face.",
  "face-too-small":
    "The face appears far away. You can still use this photo, though a closer photograph may work better.",
  "face-cropped":
    "Part of the face appears cropped. A complete face will give you a better portrait.",
  "blur-warning":
    "This photo appears blurry. A clearer photo may produce a better result, or you can use this one anyway.",
  "too-dark":
    "The photo appears dark. You can still use it, though brighter lighting may work better.",
  "too-bright":
    "The photo appears overexposed. You can still use it, though softer lighting may work better.",
  "quality-check-unavailable":
    "We couldn’t complete the optional photo check. Your photo will still be uploaded.",
  "recommended-dimensions": "A larger photograph may produce a better portrait.",
};
function statusLabel(state: SlotState) {
  if (state.message) return state.message;
  return (
    {
      empty: "Add one clear individual photograph.",
      reading: "Reading photo…",
      converting: "Preparing your iPhone photo…",
      normalizing: "Preparing photo safely…",
      checking: "Checking face and photo quality…",
      warning: "Please review the photo quality.",
      ready: "Ready for upload.",
      uploading: `Uploading photo… ${state.progress ?? 0}%`,
      server: "Running secure server validation…",
      success: "Photo looks good",
      failure: "Choose another photo and try again.",
    } as const
  )[state.stage];
}
async function restoreSlot(asset: StoredUploadAsset): Promise<SlotState> {
  try {
    const preview = await getPreview(asset.assetId);
    return { stage: "success", asset, previewUrl: preview.url };
  } catch {
    removeStoredAsset(window.localStorage, asset.role);
    return {
      stage: "failure",
      message: "This saved photo has expired. Please upload it again.",
    };
  }
}

export function PhotoUploadPage({
  analyzer = browserImageQualityAnalyzer,
}: {
  analyzer?: ImageQualityAnalyzer;
}) {
  const router = useRouter();
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [template, setTemplate] = useState<PortraitTemplate | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [slots, setSlots] = useState<Record<PhotoRole, SlotState>>({
    first: emptySlot(),
    second: emptySlot(),
  });
  const [consent, setConsent] = useState(false);
  const [completionMessage, setCompletionMessage] = useState("");
  const [validationTarget, setValidationTarget] = useState<ValidationTarget | null>(null);
  const [uploadStepActive, setUploadStepActive] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const templateSection = useRef<HTMLElement>(null);
  const templateHeading = useRef<HTMLHeadingElement>(null);
  const uploadSection = useRef<HTMLElement>(null);
  const uploadHeading = useRef<HTMLHeadingElement>(null);
  const consentInput = useRef<HTMLInputElement>(null);
  const controllers = useRef<Partial<Record<PhotoRole, AbortController>>>({});
  const objectUrls = useRef(new Set<string>());
  useEffect(() => {
    const stored = readStoredPortraitFlow(window.localStorage);
    const configured = relationships.find(
      (item) => item.id === stored.relationship && item.enabled,
    );
    const configuredTemplates = getSelectablePortraitTemplatesForRelationship(
      configured?.id ?? null,
    );
    const restoredTemplate =
      stored.template &&
      configuredTemplates.some((candidate) => candidate.id === stored.template)
        ? stored.template
        : configuredTemplates.length === 1
          ? configuredTemplates[0]!.id
          : null;
    queueMicrotask(() => {
      setRelationship(configured?.id ?? null);
      setTemplate(restoredTemplate);
      if (restoredTemplate && restoredTemplate !== stored.template)
        storePortraitTemplate(window.localStorage, restoredTemplate);
      setHydrated(true);
    });
    if (!configured) return;
    const roles =
      configured.photoCount === 1 ? (["first"] as const) : (["first", "second"] as const);
    for (const role of roles) {
      const asset = stored.uploads?.[role];
      if (asset)
        void restoreSlot(asset).then((restored) =>
          setSlots((current) => ({ ...current, [role]: restored })),
        );
    }
  }, []);
  useEffect(
    () => () => {
      for (const controller of Object.values(controllers.current)) controller?.abort();
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  const relationshipConfig = relationships.find((item) => item.id === relationship);
  const setSlot = useCallback(
    (role: PhotoRole, update: SlotState | ((current: SlotState) => SlotState)) =>
      setSlots((current) => ({
        ...current,
        [role]: typeof update === "function" ? update(current[role]) : update,
      })),
    [],
  );

  const upload = useCallback(
    async (role: PhotoRole, state: SlotState, hasQualityWarning: boolean) => {
      if (!relationship || !state.normalized || !state.quality) return;
      const oldAsset = slots[role].asset;
      try {
        setSlot(role, { ...state, stage: "ready" });
        const prepared = await prepareUpload({ relationship, role });
        setSlot(role, { ...state, stage: "uploading", progress: 0 });
        await sendPreparedUpload(
          prepared,
          state.normalized.file,
          (progress) => setSlot(role, (current) => ({ ...current, progress })),
          controllers.current[role]?.signal,
        );
        setSlot(role, { ...state, stage: "server", progress: 100 });
        const result = await finalizeUpload({
          relationship,
          role,
          uploadId: prepared.uploadId,
          clientQualityStatus: hasQualityWarning ? "warning-accepted" : "pass",
          faceBoundingBox: state.quality.faceBoundingBox,
        });
        const asset: StoredUploadAsset = result;
        storeUploadedAsset(window.localStorage, asset);
        if (oldAsset && oldAsset.assetId !== asset.assetId)
          await deleteUpload(oldAsset.assetId).catch(() => undefined);
        setSlot(role, {
          ...state,
          stage: "success",
          asset,
          message: hasQualityWarning
            ? `${state.message ? `${state.message} ` : ""}Photo uploaded and ready to use.`
            : "Photo looks good",
        });
        const selectedTemplate = template ? getActivePortraitTemplate(template) : null;
        if (selectedTemplate) trackPhotoUploaded(selectedTemplate);
      } catch (error) {
        if ((error as Error).name !== "AbortError")
          setSlot(role, {
            ...state,
            stage: "failure",
            message:
              error instanceof Error
                ? error.message
                : "Upload interrupted. Please retry.",
          });
      }
    },
    [relationship, setSlot, slots, template],
  );

  const choose = useCallback(
    async (role: PhotoRole, file?: File) => {
      if (!file) return;
      setCompletionMessage("");
      setValidationTarget(null);
      controllers.current[role]?.abort();
      const controller = new AbortController();
      controllers.current[role] = controller;
      const previous = slots[role];
      try {
        setSlot(role, { ...previous, stage: "reading", message: undefined });
        const normalized = await normalizePhoto(file, (stage) =>
          setSlot(role, (current) => ({ ...current, stage })),
        );
        if (controller.signal.aborted) return;
        const previewUrl = URL.createObjectURL(normalized.file);
        objectUrls.current.add(previewUrl);
        if (previous.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(previous.previewUrl);
          objectUrls.current.delete(previous.previewUrl);
        }
        setSlot(role, { ...previous, stage: "checking", normalized, previewUrl });
        let quality: ImageQualityResult;
        try {
          quality = await analyzer.analyze(normalized.file, controller.signal);
          const selectedTemplate = template ? getActivePortraitTemplate(template) : null;
          const expectedFaceCount =
            selectedTemplate?.provider === "OPENAI" &&
            selectedTemplate.identityMode === "RETRO_FAMILY"
              ? 3
              : selectedTemplate?.provider === "OPENAI" &&
                  (selectedTemplate.identityMode === "MOTHER_DAUGHTER_COMBINED" ||
                    selectedTemplate.identityMode === "RETRO_COUPLE")
                ? 2
                : 1;
          quality = applyExpectedFaceCount(quality, expectedFaceCount);
        } catch (error) {
          if ((error as Error).name === "AbortError") throw error;
          quality = {
            status: "warning",
            faceCount: 0,
            faceBoundingBox: null,
            faceSizeRatio: 0,
            faceSharpness: 0,
            overallSharpness: 0,
            brightness: 0,
            reasons: ["quality-check-unavailable"],
          };
        }
        const advisoryQuality: ImageQualityResult =
          quality.status === "fail" ? { ...quality, status: "warning" } : quality;
        if (advisoryQuality.status === "warning") {
          const next = {
            ...previous,
            stage: "warning" as const,
            normalized,
            previewUrl,
            quality: advisoryQuality,
            message: advisoryQuality.reasons
              .map((reason) => reasonMessages[reason])
              .filter(Boolean)
              .join(" "),
          };
          setSlot(role, next);
          await upload(role, next, true);
        } else {
          const next = {
            ...previous,
            stage: "ready" as const,
            normalized,
            previewUrl,
            quality: advisoryQuality,
          };
          setSlot(role, next);
          await upload(role, next, false);
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError")
          setSlot(role, {
            ...previous,
            stage: "failure",
            message:
              error instanceof Error
                ? error.message
                : "This photo could not be prepared.",
          });
      }
    },
    [analyzer, setSlot, slots, template, upload],
  );

  const remove = useCallback(
    async (role: PhotoRole) => {
      setCompletionMessage("");
      setValidationTarget(null);
      controllers.current[role]?.abort();
      const current = slots[role];
      if (current.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(current.previewUrl);
        objectUrls.current.delete(current.previewUrl);
      }
      setSlot(role, emptySlot());
      removeStoredAsset(window.localStorage, role);
      if (current.asset)
        await deleteUpload(current.asset.assetId).catch(() =>
          setSlot(role, {
            stage: "failure",
            message: "The photo could not be removed from storage. Please retry.",
          }),
        );
    },
    [setSlot, slots],
  );
  const requiredRoles = useMemo(
    () =>
      relationshipConfig?.photoCount === 1
        ? (["first"] as const)
        : (["first", "second"] as const),
    [relationshipConfig],
  );
  const ready = requiredRoles.every((role) => slots[role].stage === "success");
  const requiredSlots = requiredRoles.map((role) => slots[role]);
  const busy = requiredSlots.some((slot) =>
    [
      "reading",
      "converting",
      "normalizing",
      "checking",
      "ready",
      "uploading",
      "server",
    ].includes(slot.stage),
  );
  const cards = useMemo(
    () =>
      relationshipConfig
        ? requiredRoles.map((role) => ({
            role,
            label:
              role === "first"
                ? relationshipConfig.firstPersonLabel
                : relationshipConfig.secondPersonLabel,
          }))
        : [],
    [relationshipConfig, requiredRoles],
  );
  const templateSections = useMemo(() => getSelectablePortraitTemplateSections(), []);
  const selectedTemplateConfig = template ? getActivePortraitTemplate(template) : null;
  const selectTemplate = (nextTemplate: PortraitTemplateConfiguration) => {
    if (relationship && relationship !== nextTemplate.relationshipId) {
      for (const role of ["first", "second"] as const) {
        controllers.current[role]?.abort();
        const current = slots[role];
        if (current.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(current.previewUrl);
          objectUrls.current.delete(current.previewUrl);
        }
        removeStoredAsset(window.localStorage, role);
        if (current.asset)
          void deleteUpload(current.asset.assetId).catch(() => undefined);
      }
      setSlots({ first: emptySlot(), second: emptySlot() });
      setConsent(false);
    }
    storeRelationship(window.localStorage, nextTemplate.relationshipId);
    storePortraitTemplate(window.localStorage, nextTemplate.id);
    setRelationship(nextTemplate.relationshipId);
    setTemplate(nextTemplate.id);
    setUploadStepActive(false);
    setCompletionMessage("");
    setValidationTarget(null);
    trackTemplateSelected(nextTemplate);
  };
  const moveTo = (section: HTMLElement | null, focusTarget: HTMLElement | null) => {
    section?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    focusTarget?.focus({ preventScroll: true });
  };
  const showValidation = (target: ValidationTarget, message: string) => {
    setValidationTarget(target);
    setCompletionMessage(message);
    if (target === "template") moveTo(templateSection.current, templateHeading.current);
    else if (target === "upload") moveTo(uploadSection.current, uploadHeading.current);
    else moveTo(consentInput.current, consentInput.current);
  };
  const handleNext = () => {
    if (!relationship || !template) {
      showValidation("template", "Please select a template first.");
      return;
    }
    setCompletionMessage("");
    setValidationTarget(null);
    setUploadStepActive(true);
    moveTo(uploadSection.current, uploadHeading.current);
  };
  const handleGenerate = () => {
    if (!relationship || !template) {
      showValidation("template", "Please select a template first.");
      return;
    }
    if (!ready) {
      const retroMissingMessage =
        selectedTemplateConfig?.provider === "OPENAI" &&
        selectedTemplateConfig.identityMode === "RETRO_COUPLE"
          ? "Please upload one photo containing the couple."
          : selectedTemplateConfig?.provider === "OPENAI" &&
              selectedTemplateConfig.identityMode === "RETRO_FAMILY"
            ? "Please upload one photo containing the father, mother, and child."
            : selectedTemplateConfig?.provider === "OPENAI" &&
                selectedTemplateConfig.identityMode === "RETRO_SINGLE"
              ? "Please upload your photo first."
              : null;
      showValidation(
        "upload",
        retroMissingMessage ??
          (selectedTemplateConfig?.provider === "OPENAI" &&
          selectedTemplateConfig.identityMode === "MOTHER_DAUGHTER_COMBINED"
            ? "Please upload one photo containing the mother and daughter first."
            : relationshipConfig?.photoCount === 1
              ? "Please upload your child's photo first."
              : "Please upload both photos first."),
      );
      return;
    }
    if (!consent) {
      showValidation(
        "consent",
        "Please confirm that you have permission to upload and process this photo.",
      );
      return;
    }
    const selectedTemplate = getActivePortraitTemplate(template);
    if (!selectedTemplate) {
      showValidation("template", "Please select a template first.");
      return;
    }
    setIsGenerating(true);
    const requestId = crypto.randomUUID();
    const photos =
      selectedTemplate.provider === "OPENAI"
        ? selectedTemplate.identityMode === "RETRO_SINGLE" ||
          selectedTemplate.identityMode === "RETRO_COUPLE" ||
          selectedTemplate.identityMode === "RETRO_FAMILY"
          ? slots.first.asset
            ? { subjectAssetId: slots.first.asset.assetId }
            : null
          : selectedTemplate.identityMode === "COUPLE"
            ? slots.first.asset && slots.second.asset
              ? {
                  womanAssetId: slots.first.asset.assetId,
                  manAssetId: slots.second.asset.assetId,
                }
              : null
            : selectedTemplate.identityMode === "MOTHER_DAUGHTER_COMBINED"
              ? slots.first.asset
                ? { motherDaughterAssetId: slots.first.asset.assetId }
                : null
              : slots.first.asset
                ? { childAssetId: slots.first.asset.assetId }
                : null
        : slots.first.asset && slots.second.asset
          ? {
              brotherAssetId: slots.first.asset.assetId,
              sisterAssetId: slots.second.asset.assetId,
            }
          : null;
    if (!photos) {
      showValidation("upload", "Please upload the required photos first.");
      setIsGenerating(false);
      return;
    }
    storePendingGenerationIntent(window.localStorage, {
      version: 1,
      requestId,
      templateId: template,
      photos,
      phase: "PREPARING_PAYMENT",
      autoStart: true,
    });
    trackGenerateClicked(selectedTemplate);
    router.push(`/create/generating?jobToken=${encodeURIComponent(requestId)}`);
  };
  if (!hydrated)
    return (
      <p className={styles.loading} role="status">
        Opening your portrait creator…
      </p>
    );
  return (
    <>
      <AppHeader />
      <MobilePageContainer className={styles.page}>
        <header className={styles.heading}>
          <p className="eyebrow">Create your portrait</p>
          <h1>One simple journey to your family memory</h1>
          <p className="muted">
            Choose an experience, add the required clear photo, and pick the portrait
            style you love.
          </p>
        </header>

        <section
          ref={templateSection}
          className={`${styles.flowSection} ${
            validationTarget === "template" ? styles.validationSection : ""
          }`}
          aria-labelledby="relationship-heading"
        >
          <div className={styles.sectionHeading}>
            <span className={styles.sectionNumber}>1</span>
            <div>
              <h2 ref={templateHeading} id="relationship-heading" tabIndex={-1}>
                Choose your portrait template
              </h2>
              <p>Select a festival special or family portrait.</p>
            </div>
          </div>
          {templateSections.map((section) => (
            <fieldset key={section.id} className={styles.templateGroup}>
              <legend className={styles.templateGroupTitle}>{section.title}</legend>
              <div className={styles.templateGrid}>
                {section.templates.map((option, index) => {
                  const selected = template === option.id;
                  return (
                    <label
                      key={option.id}
                      className={`${styles.templateOption} ${
                        selected ? styles.templateSelected : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="portrait-template"
                        value={option.id}
                        checked={selected}
                        onChange={() => selectTemplate(option)}
                      />
                      <span className={styles.templateArtwork}>
                        <TemplatePreview
                          template={option}
                          priority={section.id === "TRENDING" && index < 2}
                          sizes="(max-width: 767px) calc(50vw - 26px), (max-width: 1099px) 30vw, 230px"
                        />
                      </span>
                      <span className={styles.templateCopy}>
                        <strong>{option.name}</strong>
                        <small>{option.description}</small>
                      </span>
                      {selected ? <Check aria-hidden="true" /> : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {validationTarget === "template" && completionMessage ? (
            <p className={styles.validationMessage} role="alert">
              {completionMessage}
            </p>
          ) : null}
        </section>

        <section
          ref={uploadSection}
          className={`${styles.flowSection} ${
            validationTarget === "upload" ? styles.validationSection : ""
          }`}
          aria-labelledby="photos-heading"
        >
          <div className={styles.sectionHeading}>
            <span className={styles.sectionNumber}>2</span>
            <div>
              <h2 ref={uploadHeading} id="photos-heading" tabIndex={-1}>
                {selectedTemplateConfig?.provider === "OPENAI" &&
                selectedTemplateConfig.identityMode === "MOTHER_DAUGHTER_COMBINED"
                  ? "Upload One Mother & Daughter Photo"
                  : selectedTemplateConfig?.provider === "OPENAI" &&
                      selectedTemplateConfig.identityMode === "RETRO_SINGLE"
                    ? "Upload Your Photo"
                    : selectedTemplateConfig?.provider === "OPENAI" &&
                        selectedTemplateConfig.identityMode === "RETRO_COUPLE"
                      ? "Upload One Couple Photo"
                      : selectedTemplateConfig?.provider === "OPENAI" &&
                          selectedTemplateConfig.identityMode === "RETRO_FAMILY"
                        ? "Upload One Family Photo"
                        : relationshipConfig?.photoCount === 1
                          ? "Upload Your Child's Photo"
                          : "Upload Both Photographs"}
              </h2>
              <p>Choose a clear photo with the face fully visible for the best result.</p>
            </div>
          </div>
          {selectedTemplateConfig ? (
            <aside className={styles.selectedTemplate} aria-label="Selected style">
              <span className={styles.selectedTemplateImage} aria-hidden="true">
                <TemplatePreview
                  template={selectedTemplateConfig}
                  decorative
                  sizes="64px"
                />
              </span>
              <span>
                <small>Selected Style</small>
                <strong>{selectedTemplateConfig.name}</strong>
              </span>
              <button
                type="button"
                className={styles.changeTemplate}
                onClick={() => {
                  setUploadStepActive(false);
                  moveTo(templateSection.current, templateHeading.current);
                }}
              >
                Change
              </button>
            </aside>
          ) : null}
          {relationshipConfig ? (
            <>
              {selectedTemplateConfig?.provider === "OPENAI" &&
              selectedTemplateConfig.identityMode === "MOTHER_DAUGHTER_COMBINED" ? (
                <ul className={styles.photoGuidance}>
                  <li>Use one photo containing only the mother and her daughter.</li>
                  <li>Keep both faces clear, well lit, and reasonably front-facing.</li>
                  <li>Avoid blur, face obstruction, heavy filters, and distant faces.</li>
                </ul>
              ) : selectedTemplateConfig?.provider === "OPENAI" &&
                selectedTemplateConfig.identityMode === "RETRO_SINGLE" ? (
                <ul className={styles.photoGuidance}>
                  <li>Upload one clear photo of the person you want in the portrait.</li>
                  <li>Keep the face visible, sharp, and well lit.</li>
                  <li>Avoid heavy filters, blur, and face obstruction.</li>
                </ul>
              ) : selectedTemplateConfig?.provider === "OPENAI" &&
                selectedTemplateConfig.identityMode === "RETRO_COUPLE" ? (
                <ul className={styles.photoGuidance}>
                  <li>Upload one photo containing only the couple together.</li>
                  <li>Keep both faces clear, well lit, and reasonably front-facing.</li>
                  <li>Avoid heavy filters, blur, and face obstruction.</li>
                </ul>
              ) : selectedTemplateConfig?.provider === "OPENAI" &&
                selectedTemplateConfig.identityMode === "RETRO_FAMILY" ? (
                <ul className={styles.photoGuidance}>
                  <li>
                    Upload one photo containing the father, mother, and child together.
                  </li>
                  <li>
                    Keep all three faces clear, well lit, and reasonably front-facing.
                  </li>
                  <li>Avoid heavy filters, blur, and face obstruction.</li>
                </ul>
              ) : relationshipConfig.photoCount === 1 ? (
                <ul className={styles.photoGuidance}>
                  <li>For the best result, use one clear child photo.</li>
                  <li>Keep the face visible, front-facing, and free from sunglasses.</li>
                  <li>Avoid blur, heavy obstruction, and very dark lighting.</li>
                </ul>
              ) : relationship === "radha-krishna-couple" ? (
                <ul className={styles.photoGuidance}>
                  <li>For the best result, upload one adult in each separate photo.</li>
                  <li>Use close, front-facing or slight three-quarter portraits.</li>
                  <li>
                    Keep both faces sharp, well lit, unobstructed, and without filters.
                  </li>
                </ul>
              ) : null}
              <div
                className={`${styles.cards} ${relationshipConfig.photoCount === 1 ? styles.singleCard : ""}`}
              >
                {cards.map(({ role, label }) => (
                  <UploadCard
                    key={role}
                    role={role}
                    label={label}
                    state={slots[role]}
                    onChoose={(file) => void choose(role, file)}
                    onRemove={() => void remove(role)}
                    onUseAnyway={() => void upload(role, slots[role], true)}
                    onRetry={() =>
                      void upload(
                        role,
                        slots[role],
                        slots[role].quality?.status === "warning",
                      )
                    }
                  />
                ))}
              </div>
              {validationTarget === "upload" && completionMessage ? (
                <p className={styles.validationMessage} role="alert">
                  {completionMessage}
                </p>
              ) : null}
            </>
          ) : (
            <div className={styles.lockedPanel}>
              Choose an experience above to see the correct photo slots.
            </div>
          )}
          <aside className={styles.privacy}>
            <p>
              <strong>Your photo is used to create your selected AI portrait.</strong>{" "}
              Sanitized uploads are kept privately for up to 24 hours; generated portraits
              are configured for seven-day retention.
            </p>
            <Link href="/privacy-policy">See how processing and storage work</Link>
          </aside>
        </section>

        <aside className={styles.purchaseNote} aria-label="Launch price">
          <strong>{formatPrice(pricing.offer.amountMinor)}</strong>
          <span>{pricing.offer.label}</span>
          <p>One payment includes one AI-generated portrait.</p>
          <small>Secure checkout powered by Razorpay.</small>
        </aside>

        <div className={styles.consent}>
          <input
            ref={consentInput}
            id="photo-permission"
            type="checkbox"
            checked={consent}
            onChange={(event) => {
              setConsent(event.target.checked);
              if (event.target.checked && validationTarget === "consent") {
                setCompletionMessage("");
                setValidationTarget(null);
              }
            }}
          />
          <label htmlFor="photo-permission">
            I confirm that I am the parent or legal guardian of any child shown, or
            otherwise have permission to upload and process the photographs.
          </label>
          <p>
            By continuing, you agree to the <Link href="/terms">Terms & Conditions</Link>{" "}
            and acknowledge the <Link href="/privacy-policy">Privacy Policy</Link>.
          </p>
        </div>
        {validationTarget === "consent" && completionMessage ? (
          <p className={styles.validationMessage} role="alert">
            {completionMessage}
          </p>
        ) : null}
      </MobilePageContainer>
      <StickyBottomAction>
        <button
          className="button"
          type="button"
          disabled={uploadStepActive && (busy || isGenerating)}
          onClick={uploadStepActive ? handleGenerate : handleNext}
        >
          {uploadStepActive ? "Generate Portrait" : "Next"}
        </button>
      </StickyBottomAction>
    </>
  );
}

function TemplatePreview({
  template,
  priority = false,
  decorative = false,
  sizes,
}: {
  template: PortraitTemplateConfiguration;
  priority?: boolean;
  decorative?: boolean;
  sizes: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span
        className={styles.previewFallback}
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : `${template.name} preview unavailable`}
      >
        Preview unavailable
      </span>
    );
  return (
    <Image
      src={template.previewImage}
      alt={decorative ? "" : `${template.name} portrait template preview`}
      fill
      unoptimized
      priority={priority}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      sizes={sizes}
      onError={() => setFailed(true)}
    />
  );
}

function UploadCard({
  role,
  label,
  state,
  onChoose,
  onRemove,
  onUseAnyway,
  onRetry,
}: {
  role: PhotoRole;
  label: string;
  state: SlotState;
  onChoose(file?: File): void;
  onRemove(): void;
  onUseAnyway(): void;
  onRetry(): void;
}) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const error = state.stage === "failure";
  useEffect(() => {
    if (error) status.current?.focus();
  }, [error]);
  const trigger = () => gallery.current?.click();
  return (
    <section
      className={`${styles.card} ${error ? styles.error : ""}`}
      aria-labelledby={`${role}-label`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onChoose(event.dataTransfer.files[0]);
      }}
    >
      <div className={styles.cardTitle}>
        <span className={styles.roleNumber}>{role === "first" ? "1" : "2"}</span>
        <h2 id={`${role}-label`}>{label}</h2>
        {state.stage === "success" ? <CheckCircle2 aria-label="Uploaded" /> : null}
      </div>
      <input
        ref={gallery}
        className={styles.hiddenInput}
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(event) => {
          onChoose(event.target.files?.[0]);
          event.target.value = "";
        }}
        aria-label={`Choose ${label}`}
      />
      <input
        ref={camera}
        className={styles.hiddenInput}
        type="file"
        accept="image/*"
        capture="user"
        onChange={(event) => {
          onChoose(event.target.files?.[0]);
          event.target.value = "";
        }}
        aria-label={`Take ${label}`}
      />
      {state.previewUrl ? (
        <div className={styles.preview}>
          <Image
            src={state.previewUrl}
            alt={`Preview of ${label}`}
            fill
            unoptimized
            sizes="(max-width: 768px) 90vw, 400px"
          />
        </div>
      ) : (
        <button type="button" className={styles.dropzone} onClick={trigger}>
          <UploadCloud aria-hidden="true" />
          <span>Tap or drop a photo here</span>
          <small>
            JPEG, PNG, WebP, HEIC · up to{" "}
            {photoUploadRestrictions.maxSourceFileSizeMegabytes} MB
          </small>
        </button>
      )}
      <p
        ref={status}
        className={styles.status}
        role="status"
        aria-live="polite"
        tabIndex={error ? -1 : undefined}
      >
        {statusLabel(state)}
      </p>
      {state.stage === "uploading" ? (
        <progress
          className={styles.uploadProgress}
          max="100"
          value={state.progress ?? 0}
          aria-label={`${label} upload progress`}
        />
      ) : null}
      <div className={styles.actions}>
        {state.stage === "warning" ? (
          <>
            <button type="button" className="button" onClick={onUseAnyway}>
              Upload Anyway
            </button>
            <button type="button" className={styles.secondary} onClick={trigger}>
              Choose Another Photo
            </button>
          </>
        ) : state.stage === "failure" && state.normalized && state.quality ? (
          <>
            <button type="button" className="button" onClick={onRetry}>
              Retry Upload
            </button>
            <button type="button" className={styles.secondary} onClick={trigger}>
              <RefreshCw aria-hidden="true" /> Replace
            </button>
            <button type="button" className={styles.secondary} onClick={onRemove}>
              <Trash2 aria-hidden="true" /> Remove
            </button>
          </>
        ) : state.previewUrl ? (
          <>
            <button type="button" className={styles.secondary} onClick={trigger}>
              <RefreshCw aria-hidden="true" /> Replace
            </button>
            <button type="button" className={styles.secondary} onClick={onRemove}>
              <Trash2 aria-hidden="true" /> Remove
            </button>
          </>
        ) : (
          <>
            <button type="button" className="button" onClick={trigger}>
              <ImagePlus aria-hidden="true" /> Choose Photo
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => camera.current?.click()}
            >
              <Camera aria-hidden="true" /> Take a Photo
            </button>
          </>
        )}
      </div>
    </section>
  );
}
