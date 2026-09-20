import type { Metadata } from "next";
import { PhotoUploadPage } from "@/features/photo-upload/components/photo-upload-page";

export const metadata: Metadata = {
  title: "Create your family portrait",
  description:
    "Choose a portrait experience, securely upload photos, and select a festive template.",
};

export default function CreatePage() {
  return <PhotoUploadPage />;
}
