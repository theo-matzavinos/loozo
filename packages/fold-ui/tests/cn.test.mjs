// Runs the built cn component (dist/), which Node loads by stripping its types: fold's theme
// names have to merge like Tailwind's own, and cn.ts has to list exactly theme.css's names.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const dist = new URL("../dist/", import.meta.url);
const { cn, tv, twMergeConfig } = await import(new URL("components/cn/cn.ts", dist).href);

function byName(left, right) {
  return left.localeCompare(right);
}

/**
 * A namespace's declared names in a stylesheet: `--text-title: 15px` → `title`, but not
 * `--text-title--line-height` or a declaration in a comment.
 */
function themeNames(css, namespace) {
  const active = css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, "");
  const declaration = new RegExp(`--${namespace}-([a-z0-9]+(?:-[a-z0-9]+)*)\\s*:`, "g");
  const names = [];

  for (const match of active.matchAll(declaration)) {
    names.push(match[1]);
  }

  return names.sort(byName);
}

describe("cn", () => {
  test("reads theme names from active declarations only", () => {
    const css = [
      "/* --shadow-popover: 0 8px 24px black; */",
      "--shadow-sheet : 0 1px 2px black;",
      "--shadow-edge:var(--edge);",
      "--text-title--line-height: 1.45;",
    ].join("\n");

    assert.deepEqual(themeNames(css, "shadow"), ["edge", "sheet"]);
    assert.deepEqual(themeNames(css, "text"), []);
  });

  test("lists exactly theme.css's text sizes, radii and shadows", async () => {
    const theme = await readFile(new URL("components/theme.css", dist), "utf8");

    for (const [namespace, names] of Object.entries(twMergeConfig.extend.theme)) {
      assert.deepEqual([...names].sort(byName), themeNames(theme, namespace), namespace);
    }

    assert.deepEqual(Object.keys(twMergeConfig.extend.theme).sort(byName), [
      "radius",
      "shadow",
      "text",
    ]);
  });

  test("keeps a theme text size next to a text color", () => {
    assert.equal(cn("text-title text-foreground"), "text-title text-foreground");
    assert.equal(cn("text-label text-primary-foreground"), "text-label text-primary-foreground");
  });

  test("lets the last text size, radius or shadow win", () => {
    assert.equal(cn("text-body text-label"), "text-label");
    assert.equal(cn("text-label text-sm"), "text-sm");
    assert.equal(cn("rounded-control rounded-control-sm"), "rounded-control-sm");
    assert.equal(cn("rounded-dialog rounded-lg"), "rounded-lg");
    assert.equal(cn("shadow-edge shadow-pressed"), "shadow-pressed");
    assert.equal(cn("shadow-dialog shadow-none"), "shadow-none");
  });

  test("tv merges variants and a class with theme.css's names", () => {
    const button = tv({
      base: "rounded-control text-body text-foreground shadow-edge",
      variants: {
        variant: { primary: "text-primary-foreground" },
        size: { sm: "rounded-control-sm text-label" },
      },
    });

    assert.equal(
      button({ variant: "primary", size: "sm" }),
      "shadow-edge text-primary-foreground rounded-control-sm text-label",
    );
    assert.equal(
      button({
        variant: "primary",
        size: "sm",
        class: "rounded-checkbox shadow-pressed text-title",
      }),
      "text-primary-foreground rounded-checkbox shadow-pressed text-title",
    );
  });
});
