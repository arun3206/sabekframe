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
          Yaadon creates AI-generated family and festival portraits using photographs you
          provide and templates you select. The service is digital and does not include a
          physical product.
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
        <h2>Price and one-generation purchase</h2>
        <div className="price-card">
          <strong>{price}</strong>
          <span>{pricing.offer.label}</span>
          <p>{pricing.offer.description}</p>
        </div>
        <p>
          Each {price} purchase covers one AI portrait generation. Because AI results can
          vary, a successful generation is considered delivery of that purchase. A request
          for a different artistic result or an additional generation may require a new
          purchase. Payments are processed securely through Razorpay. Generation begins
          only after the server verifies that the payment was captured.
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
          If a payment is captured but generation fails, no portrait is delivered, or a
          confirmed provider or server problem prevents delivery, support may provide a
          regeneration or refund after verification. You will not be required to buy the
          same generation again solely because our system failed technically. See the
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
