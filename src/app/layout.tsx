import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { GoogleAnalytics } from "@/components/analytics/google-analytics";
import { SiteFooter } from "@/components/layout/site-footer";
import "@/styles/globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      "https://sabekframe.arunjaiswal139.workers.dev",
  ),
  title: { default: "Yaadon", template: "%s | Yaadon" },
  description: "Turn your photos into beautiful AI family and festival portraits.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fffdf5",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="site-content">{children}</div>
        <SiteFooter />
        <Suspense fallback={null}>
          <GoogleAnalytics />
        </Suspense>
      </body>
    </html>
  );
}
