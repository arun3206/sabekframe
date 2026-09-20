import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { MobilePageContainer } from "@/components/layout/mobile-page-container";
import { legalLastUpdated } from "@/config/business";

export function LegalPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <>
      <AppHeader backHref="/" />
      <MobilePageContainer className="legal-page">
        <article>
          <header className="legal-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="legal-updated">Last updated: {legalLastUpdated}</p>
            <p className="legal-intro">{intro}</p>
          </header>
          <div className="legal-content">{children}</div>
        </article>
      </MobilePageContainer>
    </>
  );
}
