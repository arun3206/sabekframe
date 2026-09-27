import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Check, Download, Images, LockKeyhole, Sparkles } from "lucide-react";
import { getSelectablePortraitTemplates } from "@/config/portrait-templates";
import { formatPrice, pricing } from "@/config/pricing";
import { AppHeader } from "@/components/layout/app-header";
import styles from "./page.module.css";

const pageTitle = "AI Photo Generator for Indian Retro Portraits";
const pageDescription =
  "Turn your photo into a personalized 80s or 90s Indian retro portrait. Choose a ready-made style, upload securely and create without writing prompts.";
const siteUrl = (
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "https://sabekframe.arunjaiswal139.workers.dev"
).replace(/\/$/, "");

export const metadata: Metadata = {
  title: pageTitle,
  description: pageDescription,
  alternates: { canonical: "/ai-photo-generator" },
  openGraph: {
    title: `${pageTitle} | Yaadon`,
    description: pageDescription,
    url: "/ai-photo-generator",
    siteName: "Yaadon",
    type: "website",
    images: [
      {
        url: "/templates/retro-girl-template-v1.webp",
        alt: "An AI-generated 1980s Indian retro portrait",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${pageTitle} | Yaadon`,
    description: pageDescription,
    images: ["/templates/retro-girl-template-v1.webp"],
  },
};

const steps = [
  {
    title: "Choose a portrait style",
    description: "Pick an Indian retro, couple, family or festival-inspired template.",
  },
  {
    title: "Upload your photo",
    description: "Use a clear photo and confirm that you have permission to use it.",
  },
  {
    title: "Preview, unlock and download",
    description:
      "See a blurred preview first. Pay only when you choose to download the HD portrait.",
  },
] as const;

const faqs = [
  {
    question: "Do I need to write an AI prompt?",
    answer:
      "No. Choose a ready-made portrait style and upload the requested photo. Yaadon handles the generation instructions for you.",
  },
  {
    question: "How much does one AI portrait cost?",
    answer: `${formatPrice(pricing.offer.amountMinor)} is charged for one portrait generation. There is no subscription.`,
  },
  {
    question: "Which photo gives the best result?",
    answer:
      "Use a clear, well-lit photo where every required face is visible and not covered by sunglasses, hands or heavy filters.",
  },
  {
    question: "What happens to my uploaded photo?",
    answer:
      "Uploads are kept private for processing. Server-sanitized source photographs have a 24-hour retention deadline, as explained in the privacy policy.",
  },
] as const;

export default function AiPhotoGeneratorPage() {
  const templates = getSelectablePortraitTemplates().filter(
    (template) => template.category === "RETRO",
  );
  const featuredTemplates = templates.slice(0, 6);
  const price = formatPrice(pricing.offer.amountMinor);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Yaadon AI Photo Generator",
    url: `${siteUrl}/ai-photo-generator`,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    description: pageDescription,
    offers: {
      "@type": "Offer",
      price: (pricing.offer.amountMinor / 100).toFixed(2),
      priceCurrency: pricing.currency,
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <div className={styles.shell}>
      <AppHeader />
      <main>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>No prompts. No editing skills.</p>
              <h1>AI Photo Generator for Indian Retro Portraits</h1>
              <p className={styles.lead}>
                Turn one everyday photo into an 80s or 90s-inspired portrait made for
                Instagram, WhatsApp and keepsakes.
              </p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryCta} href="/create">
                  Create Your AI Portrait <Sparkles size={19} aria-hidden="true" />
                </Link>
                <a className={styles.secondaryCta} href="#styles">
                  View portrait styles
                </a>
              </div>
              <ul className={styles.trustList} aria-label="Portrait purchase details">
                <li>
                  <Check size={17} aria-hidden="true" /> Preview before paying
                </li>
                <li>
                  <Check size={17} aria-hidden="true" /> No account required
                </li>
                <li>
                  <Check size={17} aria-hidden="true" /> Private photo processing
                </li>
              </ul>
            </div>
            <div className={styles.heroGallery} aria-label="Example AI retro portraits">
              {featuredTemplates.slice(0, 3).map((template, index) => (
                <figure key={template.id} className={styles[`heroPortrait${index + 1}`]}>
                  <Image
                    src={template.previewImage}
                    alt={`${template.name} AI portrait example`}
                    fill
                    priority={index === 0}
                    sizes="(min-width: 760px) 20rem, 45vw"
                  />
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.benefitStrip} aria-label="AI portrait benefits">
          <div>
            <Sparkles aria-hidden="true" />
            <span>Ready-made Indian styles</span>
          </div>
          <div>
            <LockKeyhole aria-hidden="true" />
            <span>Secure photo uploads</span>
          </div>
          <div>
            <Images aria-hidden="true" />
            <span>Your recognizable face</span>
          </div>
          <div>
            <Download aria-hidden="true" />
            <span>Downloadable result</span>
          </div>
        </section>

        <section className={styles.section} id="styles">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Choose your look</p>
            <h2>Retro AI portrait styles</h2>
            <p>
              Choose a preset designed for Indian individuals, couples and families. You
              do not need to copy prompts or configure an AI model.
            </p>
          </div>
          <div className={styles.styleGrid}>
            {featuredTemplates.map((template) => (
              <article className={styles.styleCard} key={template.id}>
                <div className={styles.styleImage}>
                  <Image
                    src={template.previewImage}
                    alt={`${template.name} retro AI photo style`}
                    fill
                    sizes="(min-width: 960px) 22rem, (min-width: 620px) 45vw, 92vw"
                  />
                </div>
                <div className={styles.styleCopy}>
                  <h3>{template.name}</h3>
                  <p>{template.description}</p>
                  <Link href="/create">Use this style</Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.howSection}`}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Simple from your phone</p>
            <h2>How the AI photo generator works</h2>
          </div>
          <ol className={styles.steps}>
            {steps.map((step, index) => (
              <li key={step.title}>
                <span>{index + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section}>
          <div className={styles.photoGuide}>
            <div>
              <p className={styles.eyebrow}>For a more recognizable result</p>
              <h2>Start with a clear photo</h2>
              <p>
                Use natural lighting, keep faces fully visible and avoid beauty filters.
                Couple and family styles work best when everyone appears clearly in the
                same source photo.
              </p>
            </div>
            <ul>
              <li>
                <Check aria-hidden="true" /> Face the camera or use a gentle angle
              </li>
              <li>
                <Check aria-hidden="true" /> Avoid blur and harsh shadows
              </li>
              <li>
                <Check aria-hidden="true" /> Keep the original photo uncropped
              </li>
            </ul>
          </div>
        </section>

        <section className={`${styles.section} ${styles.faqSection}`} id="faq">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Questions before you create</p>
            <h2>AI portrait FAQ</h2>
          </div>
          <div className={styles.faqList}>
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.finalCta}>
          <p className={styles.eyebrow}>Your retro portrait starts here</p>
          <h2>Choose a style and turn your photo into a memory</h2>
          <p>Preview free, then unlock the HD portrait for {price}. No subscription.</p>
          <Link className={styles.primaryCta} href="/create">
            Create Your AI Portrait <Sparkles size={19} aria-hidden="true" />
          </Link>
        </section>
      </main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
    </div>
  );
}
