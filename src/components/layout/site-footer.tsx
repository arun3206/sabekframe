import Link from "next/link";
import { business } from "@/config/business";

const policyLinks = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/refund-policy", label: "Refund & Cancellation" },
  { href: "/delivery-policy", label: "Digital Delivery" },
  { href: "/contact", label: "Contact Us" },
  { href: "/about", label: "About Us" },
] as const;

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="desktop-container site-footer-inner">
        <div>
          <Link className="footer-brand" href="/">
            {business.brandName}
          </Link>
          <p>{business.serviceDescription}.</p>
        </div>
        <nav className="footer-links" aria-label="Legal and support">
          {policyLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="footer-copyright">
          © {new Date().getFullYear()} {business.brandName}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
