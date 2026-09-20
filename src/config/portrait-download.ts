export const portraitDownloadFileBaseName = "my-krishna-portrait";

export function createPortraitDownloadFileName(
  extension: "jpg" | "png",
  date = new Date(),
  uniqueId = crypto.randomUUID(),
) {
  const timestamp = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
  return `${portraitDownloadFileBaseName}-${timestamp}-${uniqueId.slice(0, 8)}.${extension}`;
}
