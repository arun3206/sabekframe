import type { Metadata } from "next";
import { AppHeader } from "@/components/layout/app-header";

export const metadata: Metadata = {
  title: { default: "Your Yaadon Portrait", template: "%s | Yaadon" },
  robots: { index: false, follow: false },
};

export default function ResultLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
