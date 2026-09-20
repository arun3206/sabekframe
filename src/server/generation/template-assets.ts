import { readFile } from "node:fs/promises";
import path from "node:path";

export async function readTemplateAsset(relativePath: string) {
  const prefix = "templates/";
  if (!relativePath.startsWith(prefix))
    throw new Error("Template asset path must use the templates directory.");
  const scopedPath = path.normalize(relativePath.slice(prefix.length));
  if (
    path.isAbsolute(scopedPath) ||
    scopedPath === ".." ||
    scopedPath.startsWith(`..${path.sep}`)
  )
    throw new Error("Template asset path is outside the templates directory.");
  return new Uint8Array(
    await readFile(path.join(process.cwd(), "templates", scopedPath)),
  );
}
