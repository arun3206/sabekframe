import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function AppHeader({
  backHref,
  brandName = "Yaadon",
  homeHref = "/",
  tagline = "Beautiful family memories",
}: {
  backHref?: string;
  brandName?: string;
  homeHref?: string;
  tagline?: string;
}) {
  return (
    <header className="app-header">
      <div className="desktop-container">
        {backHref ? (
          <Link className="header-back" href={backHref} aria-label="Back to home">
            <ArrowLeft aria-hidden="true" size={20} strokeWidth={1.8} />
          </Link>
        ) : null}
        <Link className="brand" href={homeHref} aria-label={`${brandName} home`}>
          {brandName}
        </Link>
        {backHref ? (
          <span className="header-spacer" aria-hidden="true" />
        ) : (
          <span className="tagline">{tagline}</span>
        )}
      </div>
    </header>
  );
}
