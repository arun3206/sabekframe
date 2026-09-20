import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "About Yaadon and its personalized AI-powered family and festival portraits.",
};

export default function AboutPage() {
  return (
    <LegalPage
      eyebrow="About"
      title="About Yaadon"
      intro="Yaadon helps families turn their own photographs into personalized AI-powered festival and occasion portraits."
    >
      <section>
        <h2>Made for meaningful family memories</h2>
        <p>
          Our guided experience lets you choose a portrait theme, upload the required
          photograph, and download the finished AI-generated image—without writing prompts
          or choosing technical settings.
        </p>
        <p>
          We are building Yaadon as an early-stage, mobile-first service for Indian
          families, with particular care for privacy, simple instructions, and culturally
          relevant festive portraits.
        </p>
      </section>
      <section>
        <h2>Create a portrait</h2>
        <p>
          Visit the <Link href="/create">portrait creator</Link> to see the available
          experiences and templates.
        </p>
      </section>
    </LegalPage>
  );
}
