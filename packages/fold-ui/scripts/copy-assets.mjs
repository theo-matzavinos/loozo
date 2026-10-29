// Copies what tsc doesn't emit into dist/: the component sources the schematics copy into apps,
// and the schematics' JSON (collection, option schemas, fold.json schema).
import { cp, readdir } from "node:fs/promises";
import { join } from "node:path";

await cp("components", "dist/components", { recursive: true });

for (const entry of await readdir("schematics", { recursive: true, withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".json")) {
    const source = join(entry.parentPath, entry.name);

    await cp(source, join("dist", source));
  }
}
