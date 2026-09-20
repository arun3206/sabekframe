import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const directory = path.resolve("quality-samples");
const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
if (!entries.length)
  console.log(
    "Add consenting, non-production samples to quality-samples/ (this directory is gitignored).",
  );
for (const entry of entries) {
  if (!entry.isFile()) continue;
  try {
    const image = sharp(path.join(directory, entry.name)).rotate().greyscale();
    const { channels } = await image.stats();
    const metadata = await image.metadata();
    console.log(
      JSON.stringify({
        file: entry.name,
        width: metadata.width,
        height: metadata.height,
        brightness: channels[0]?.mean,
        standardDeviation: channels[0]?.stdev,
      }),
    );
  } catch {
    console.log(JSON.stringify({ file: entry.name, error: "unreadable" }));
  }
}
