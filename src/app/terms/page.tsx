import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { formatPrice, pricing } from "@/config/pricing";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "Terms for using Yaadon to create AI-generated family and festival portraits.",
};

export default function TermsPage() {
  const price = formatPrice(pricing.offer.amountMinor);
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms & Conditions"
      intro="These terms apply when you use Yaadon to upload photographs and create AI-generated family or festival portraits."
    >
      <section>
        <h2>The service</h2>
        <p>
          Yaadon creates digital AI-generated family and festival portraits using
          photographs you provide and templates you select. Nothing is physically shipped.
        </p>
      </section>
      <section>
        <h2>Eligibility and permission</h2>
        <p>
          You must be legally capable of using the service and have the right or
          permission to upload every photograph you provide. For a child’s photograph, you
          must be the parent or legal guardian or otherwise have appropriate
          authorization. You must not submit material that violates another person’s
          privacy, intellectual property, or other rights.
        </p>
      </section>
      <section>
        <h2>Price and HD portrait purchase</h2>
        <div className="price-card">
          <strong>{price}</strong>
          <span>{pricing.offer.label}</span>
          <p>{pricing.offer.description}</p>
        </div>
        <p>
          For current image products, Yaadon creates a protected preview before asking for
          payment. Selecting Download HD Portrait opens Razorpay Checkout. Each successful
          {price} purchase unlocks the downloadable HD version of that preview. Payments
          are processed through Razorpay and access is granted only after our server
          verifies that the payment was captured.
        </p>
        <p>
          A future product, such as an AI video, may require payment before generation
          because of its processing cost. When that applies, the product screen and
          checkout flow will clearly show it before you pay. A verified payment will
          authorize one generation of the selected product.
        </p>
      </section>
      <section>
        <h2>AI-generated results</h2>
        <p>
          AI outputs are probabilistic. A portrait may include natural variations from the
          source photograph, including differences in facial details, expression,
          clothing, background, pose, composition, or minor visual artifacts. We aim for a
          recognizable, appealing result but cannot guarantee an exact photographic
          reproduction.
        </p>
      </section>
      <section>
        <h2>Technical failures</h2>
        <p>
          If payment is captured but the purchased HD file cannot be delivered, or if a
          payment-first product cannot be generated because of a confirmed provider or
          server problem, support may provide delivery, regeneration, or a refund after
          verification. You will not be required to buy the same product again solely
          because our system failed technically. See the
          <Link href="/refund-policy"> Refund & Cancellation Policy</Link>.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>You must not use Yaadon to:</p>
        <ul>
          <li>
            upload unlawful content or another person’s photo without authorization;
          </li>
          <li>harass, deceive, or impersonate someone for fraud;</li>
          <li>exploit, sexualize, or abuse a minor;</li>
          <li>create illegal or harmful content; or</li>
          <li>misuse, disrupt, probe, or interfere with the service.</li>
        </ul>
      </section>
      <section>
        <h2>Intellectual property</h2>
        <p>
          You retain the rights you already hold in your original photographs. Yaadon’s
          branding, software, templates, and proprietary design elements remain owned or
          licensed by the service, as applicable. Use of generated images remains subject
          to applicable law and the relevant AI provider’s terms. We do not promise
          exclusive copyright ownership in an AI-generated output.
        </p>
      </section>
      <section>
        <h2>Availability and responsibility</h2>
        <p>
          AI and cloud services may occasionally be delayed or unavailable. We may reject
          unsafe or unauthorized content and may change or suspend features for security,
          legal, or operational reasons. Nothing in these terms excludes consumer rights
          or liability that cannot lawfully be excluded.
        </p>
      </section>
      <section>
        <h2>Questions</h2>
        <p>
          For help with these terms, an order, or a generation, visit our
          <Link href="/contact"> Contact Us page</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
