import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";
import { business } from "@/config/business";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Contact Yaadon about an order, generation, refund, or privacy request.",
};

export default function ContactPage() {
  return (
    <LegalPage
      eyebrow="Support"
      title="Contact Us"
      intro="For questions about your order, a generation failure, a privacy request, or a refund request, contact us using the details below."
    >
      <section className="contact-card">
        <h2>{business.brandName}</h2>
        <p>{business.serviceDescription}.</p>
        <h3>Website</h3>
        <p>
          <Link href={business.websitePath}>Yaadon website</Link>
        </p>
        <h3>Customer support</h3>
        {business.supportEmail ? (
          <p>
            <a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a>
          </p>
        ) : (
          <p className="policy-note">
            The customer support email has not yet been provided. It must be configured
            before public or paid launch.
          </p>
        )}
        {business.supportPhone ? (
          <>
            <h3>Phone</h3>
            <p>{business.supportPhone}</p>
          </>
        ) : null}
        {business.postalAddress ? (
          <>
            <h3>Business address</h3>
            <p>{business.postalAddress}</p>
          </>
        ) : null}
      </section>
      <section>
        <h2>What to include</h2>
        <p>
          Include your transaction or generation reference and a short description of the
          problem. For privacy requests, include the result reference you still have.
          Never send your CVV, OTP, UPI PIN, or complete card details.
        </p>
      </section>
    </LegalPage>
  );
}
