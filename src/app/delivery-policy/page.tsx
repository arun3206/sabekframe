import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Digital Delivery Policy",
  description: "How Yaadon generates and electronically delivers digital AI portraits.",
};

export default function DeliveryPolicyPage() {
  return (
    <LegalPage
      eyebrow="Delivery"
      title="Digital Delivery / Shipping Policy"
      intro="Yaadon provides digital AI-generated products. Nothing is physically shipped."
    >
      <section>
        <h2>Digital product</h2>
        <p>
          The product is entirely digital. There is no physical product, courier shipment,
          or physical shipping charge.
        </p>
      </section>
      <section>
        <h2>Image portrait delivery</h2>
        <p>
          After you provide the required photograph, select a template, and confirm
          permission, Yaadon prepares a protected, lower-quality preview. Payment is
          requested only when you select Download HD Portrait. After our server verifies a
          captured payment, the private HD portrait becomes available through the result
          page and download interface.
        </p>
      </section>
      <section>
        <h2>Payment-first products</h2>
        <p>
          Some future products, including AI video, may be generated only after payment.
          The product screen will state this before checkout. After a captured payment is
          verified, generation begins and the completed digital product is delivered
          through the result and download interface.
        </p>
      </section>
      <section>
        <h2>Processing time and delays</h2>
        <p>
          Generation time varies because AI processing is involved. Temporary delays may
          occur because of provider demand, server load, connectivity, safety checks, or a
          technical issue. We do not guarantee an exact delivery time. Keep the result
          page available until you have saved the purchased file.
        </p>
      </section>
      <section>
        <h2>If delivery fails</h2>
        <p>
          If payment is captured but a verified technical failure prevents HD delivery or
          prevents a payment-first product from being generated, contact support. The
          issue may qualify for delivery assistance, regeneration, or a refund under our
          <Link href="/refund-policy"> Refund & Cancellation Policy</Link>.
        </p>
      </section>
    </LegalPage>
  );
}
