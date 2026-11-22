import { lstat } from "node:fs/promises";
import { extname } from "node:path";

// Files no generation pass reads: Angular's template compiler never runs in generation, and
// TypeScript resolves an import of one of these to its declaration (a companion such as
// `x.d.svg.ts`, or a `declare module "*.svg"` wildcard), never to the file itself.
const inertExtensions = new Set([
  ".html",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".md",
]);

/**
 * Whether a serve watcher event touched only a file no generation pass reads, so it needs no
 * pass: an added, changed or removed template, style, image, font or Markdown file that's a
 * regular file now (or gone, for a removal) and isn't one of the locale `catalogs`. Anything
 * else, a directory event or a symlink included, needs one. The builder still decides whether
 * its pass state allows skipping.
 */
export async function isInertFileEvent(
  event: string,
  path: string,
  catalogs: readonly string[],
): Promise<boolean> {
  if (event !== "add" && event !== "change" && event !== "unlink") {
    return false;
  }

  if (!inertExtensions.has(extname(path).toLowerCase())) {
    return false;
  }

  // Compared without case: on a case-sensitive filesystem that only costs a pass.
  const lowerPath = path.toLowerCase();

  for (const catalog of catalogs) {
    if (catalog.toLowerCase() === lowerPath) {
      return false;
    }
  }

  // A symlink can point generation's walk somewhere else, and a delayed removal can arrive while
  // a dangling one sits at the path, so only a regular file, or nothing for a removal, is inert.
  try {
    const entry = await lstat(path);

    return entry.isFile();
  } catch (error) {
    return event === "unlink" && (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}
