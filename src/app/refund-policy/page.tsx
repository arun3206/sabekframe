import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { business } from "@/config/business";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description:
    "When a Yaadon AI portrait purchase may qualify for a refund or regeneration.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      eyebrow="Payments"
      title="Refund & Cancellation Policy"
      intro="This policy separates a request for a different creative result from a genuine payment, provider, or delivery failure."
    >
      <section>
        <h2>Before payment</h2>
        <p>
          Current image portraits show a protected preview before checkout. You may leave
          without paying if you do not want to unlock its HD version. Because no payment
          has been made at that stage, no cancellation or refund is required.
        </p>
      </section>
      <section>
        <h2>Purchased digital product</h2>
        <p>
          Once payment is captured and the purchased HD portrait is made available, the
          digital product is considered delivered. A delivered portrait is generally not
          refundable solely because you would prefer another expression, pose, style,
          artistic interpretation, or generated version. A different or additional
          generation may require a new purchase.
        </p>
      </section>
      <section>
        <h2>Payment-first products</h2>
        <p>
          A future product such as AI video may require payment before generation. If a
          verified provider or system failure prevents that paid product from being
          generated or delivered, we may provide another generation or a refund after
          checking the transaction and generation record.
        </p>
      </section>
      <section>
        <h2>Genuine technical or billing failures</h2>
        <p>
          After verification, we may offer delivery assistance, regeneration, or a refund
          when:
        </p>
        <ul>
          <li>payment was captured but the purchased HD file was not made available;</li>
          <li>a payment-first product could not be generated or delivered;</li>
          <li>the same customer was charged more than once for the same purchase; or</li>
          <li>another verified billing or technical issue occurred.</li>
        </ul>
      </section>
      <section>
        <h2>Refund timing</h2>
        <p>
          Once a refund is approved and initiated, the time it takes to appear in your
          original payment method depends on Razorpay, your bank, card network, UPI or
          banking system, or another applicable payment provider. We cannot promise
          instant settlement.
        </p>
      </section>
      <section>
        <h2>How to request help</h2>
        {business.supportEmail ? (
          <p>
            Email <a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a>
            with your transaction and generation reference and a short description of the
            issue. Do not send card details, CVV, OTP, or UPI PIN.
          </p>
        ) : (
          <p className="policy-note">
            The support email must be added before paid launch. It will appear on the
            <Link href="/contact"> Contact Us page</Link> once configured.
          </p>
        )}
      </section>
    </LegalPage>
  );
}
