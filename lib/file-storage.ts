import fs from "fs/promises";
import path from "path";

function normalizeAssetPath(assetPath: string) {
  return String(assetPath || "").replace(/^\/+/, "").replace(/\\/g, "/").trim();
}

function isWithinRoot(root: string, absolutePath: string) {
  const normalizedRoot = path.resolve(root);
  const normalizedPath = path.resolve(absolutePath);
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}${path.sep}`);
}

export function resolveStoredAssetPath(root: string, assetPath: string) {
  const relativePath = normalizeAssetPath(assetPath);
  if (!relativePath) return null;
  const absolutePath = path.resolve(root, relativePath);
  if (!isWithinRoot(root, absolutePath)) return null;
  return absolutePath;
}

export async function readStoredAssetFromRoots(assetPath: string | null | undefined, roots: string[]) {
  if (!assetPath) return null;
  for (const root of roots) {
    const absolutePath = resolveStoredAssetPath(root, assetPath);
    if (!absolutePath) continue;
    const buffer = await fs.readFile(absolutePath).catch(() => null);
    if (buffer) {
      return buffer;
    }
  }
  return null;
}
