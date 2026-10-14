import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sourceIdentity } from "./source-identity.mjs";

/** Optional forensic hook paired with `source-identity.mjs`; never part of the default gates. */
export default async function teardown() {
  const directory = process.env.ORIGAMI_EVIDENCE_DIR;

  assert.ok(directory, "The Playwright configuration selects the evidence directory");

  const initial = JSON.parse(await readFile(path.join(directory, "source-identity.json"), "utf8"));
  const final = await sourceIdentity();

  await writeFile(
    path.join(directory, "source-identity.after.json"),
    JSON.stringify(final, null, 2),
  );
  assert.deepEqual(
    final,
    initial,
    "Sources changed during verification; results are not current-result evidence",
  );
}
