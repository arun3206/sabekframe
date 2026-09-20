"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { googleAnalytics } from "@/config/analytics";
import { initializeGoogleAnalytics, trackPageView } from "@/lib/analytics";

export function GoogleAnalytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    initializeGoogleAnalytics();
    trackPageView(query ? `${pathname}?${query}` : pathname);
  }, [pathname, query]);

  return (
    <Script
      id="google-analytics"
      src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalytics.measurementId}`}
      strategy="afterInteractive"
    />
  );
}
