import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Yaadon AI Portraits", template: "%s | Yaadon" },
  description: "Turn your photos into a beautiful family or festival portrait.",
  robots: { index: false, follow: false },
};

export default function CreateLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
