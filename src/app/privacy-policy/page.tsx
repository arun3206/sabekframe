import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { business } from "@/config/business";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Yaadon handles uploaded photos, generated portraits, and service data.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      intro="This policy explains how Yaadon handles the photographs and limited information needed to create and deliver your AI portrait."
    >
      <section>
        <h2>Information we process</h2>
        <p>Depending on how you use the service, we may process:</p>
        <ul>
          <li>photographs you upload and the AI portraits created from them;</li>
          <li>random session, upload, generation, and result identifiers;</li>
          <li>basic technical information needed for security and reliability; and</li>
          <li>information you send when asking for support, deletion, or a refund.</li>
        </ul>
        <p>
          When payments are introduced, we may also receive transaction identifiers and
          payment status from the payment provider. Complete card details, CVV, UPI PIN,
          and similar payment credentials will be handled by the payment provider rather
          than stored directly by Yaadon.
        </p>
      </section>

      <section>
        <h2>Uploaded photos and AI processing</h2>
        <p>
          We use uploaded photos to create the portrait you request. A normalized copy is
          uploaded to private cloud storage, checked by our server, and sent with the
          selected template to the AI provider for processing. The result is returned to
          Yaadon, stored privately, and made available through the result and download
          experience.
        </p>
        <p>
          The current Janmashtami experience uses Amazon Web Services (AWS) for private
          storage and OpenAI for AI image processing. The separately available Raksha
          Bandhan experience uses Magic Hour for its image-processing workflow. Only the
          provider required for the experience you select receives the applicable image.
          These providers do not endorse Yaadon.
        </p>
        <p>We do not use customer photos to train our own AI models.</p>
      </section>

      <section>
        <h2>Children’s photographs</h2>
        <p>
          Yaadon is intended for adults. A person uploading a child’s photograph must be
          the child’s parent or legal guardian, or otherwise have appropriate authority
          and permission to upload and process it. Please do not upload a child’s photo
          without that authorization. Child photographs are processed only to provide the
          requested portrait service and for the limited operational purposes described in
          this policy.
        </p>
      </section>

      <section>
        <h2>Storage and retention</h2>
        <p>
          In the production architecture, media is stored in private AWS S3 buckets.
          Browser previews and downloads use short-lived, signed access or an owned result
          route; photographs are not placed in public buckets.
        </p>
        <ul>
          <li>
            Raw upload objects are deleted after successful server validation. Abandoned
            raw uploads expire after one hour, with scheduled cleanup and a one-day S3
            lifecycle backstop.
          </li>
          <li>
            Server-sanitized source photographs have a 24-hour retention deadline and a
            one-day S3 lifecycle rule.
          </li>
          <li>
            Generated portraits and their generation records are configured for seven-day
            retention so that results can be delivered and downloaded.
          </li>
        </ul>
        <p>
          AWS lifecycle deletion is asynchronous, so deletion may occur after the stated
          expiry time rather than at the exact second. Limited records may be retained
          longer where reasonably necessary for security, legal obligations, or dispute
          resolution. Retention practices may be updated as the service evolves, and this
          policy will be updated when they change.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          We use reasonable technical and organizational safeguards, including private
          cloud storage, access controls, short-lived signed URLs, server-side validation,
          and random identifiers. No online service can promise absolute security.
        </p>
      </section>

      <section>
        <h2>Analytics and logs</h2>
        <p>
          No third-party product analytics service is currently enabled. Operational logs
          may contain random job identifiers, provider and model names, processing times,
          provider request identifiers, and private storage object paths. They are not
          intended to contain image bytes, names, contact details, or public image URLs.
        </p>
      </section>

      <section>
        <h2>Deletion and privacy requests</h2>
        {business.supportEmail ? (
          <p>
            You may request deletion of uploaded or generated images, where applicable, by
            emailing{" "}
            <a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a>.
            Please include the result or job reference you still have so we can locate the
            relevant data without asking for unnecessary personal information.
          </p>
        ) : (
          <p className="policy-note">
            The customer support email is being finalized and must be published on our
            <Link href="/contact"> Contact Us page</Link> before launch. Automatic
            retention cleanup continues to apply in the meantime.
          </p>
        )}
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update this policy to reflect product, provider, legal, or operational
          changes. The “Last updated” date will show when it changed. For questions, use
          the details on our <Link href="/contact">Contact Us page</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
