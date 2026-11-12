// Release notes for packages/<package>: the conventional commit subjects that touch
// it since its last <package>@<version> tag reachable from <ref> (default HEAD),
// grouped as breaking changes, features, fixes and other changes. Release commits
// are left out, so passing a release commit's parent lists exactly that release.
//
// Usage: node scripts/release-notes.mjs <package> [<ref>]
import { execFileSync } from "node:child_process";

const subjectPattern = /^(?<type>\w+)(?:\((?<scope>[^)]*)\))?(?<breaking>!)?: (?<description>.+)$/;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function previousTag(packageName, ref) {
  try {
    return git(["describe", "--tags", "--abbrev=0", "--match", `${packageName}@*`, ref]);
  } catch {
    return undefined;
  }
}

export function changesSinceRelease(packageName, ref = "HEAD") {
  const since = previousTag(packageName, ref);
  let range = ref;

  if (since) {
    range = `${since}..${ref}`;
  }

  const log = git(["log", "--format=%s", range, "--", `packages/${packageName}`]);
  const changes = { since, breaking: [], features: [], fixes: [], other: [] };

  for (const subject of log.split("\n")) {
    if (subject === "" || subject.startsWith("chore(release): ")) {
      continue;
    }

    const match = subjectPattern.exec(subject);

    if (!match) {
      changes.other.push(subject);
      continue;
    }

    const { type, breaking, description } = match.groups;

    if (breaking) {
      changes.breaking.push(description);
    } else if (type === "feat") {
      changes.features.push(description);
    } else if (type === "fix") {
      changes.fixes.push(description);
    } else {
      changes.other.push(`${type}: ${description}`);
    }
  }

  return changes;
}

export function renderReleaseNotes(changes) {
  const sections = [
    ["Breaking changes", changes.breaking],
    ["Features", changes.features],
    ["Fixes", changes.fixes],
    ["Other changes", changes.other],
  ];
  const lines = [];

  for (const [heading, entries] of sections) {
    if (entries.length === 0) {
      continue;
    }

    lines.push(`## ${heading}`, "");

    for (const entry of entries) {
      lines.push(`- ${entry}`);
    }

    lines.push("");
  }

  if (lines.length === 0) {
    lines.push("No changes to this package since its last release.", "");
  }

  if (changes.since) {
    lines.push(`Changes since ${changes.since}.`);
  } else {
    lines.push("First release.");
  }

  return `${lines.join("\n")}\n`;
}

if (import.meta.main) {
  const [packageName, ref] = process.argv.slice(2);

  if (!packageName) {
    throw new Error("Usage: node scripts/release-notes.mjs <package> [<ref>]");
  }

  process.stdout.write(renderReleaseNotes(changesSinceRelease(packageName, ref)));
}
