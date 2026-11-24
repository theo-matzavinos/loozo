import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      // Glob lines, not Markdown: the formatter would escape underscores and asterisks.
      ".macroscope/ignore.md",
      "docs/generated/**/*.generated.ts",
      "docs/src/routes/**/route.generated.ts",
      "docs/src/routes/**/destination.generated.ts",
      "docs/src/routes/**/children.generated.ts",
      "packages/angular-router/SPEC.md",
      "examples/angular-router/**/*.generated.ts",
      "packages/angular-router/snippets/**/*.generated.ts",
      "packages/origami-ui/SPEC.md",
      "packages/origami-ui/SPEC-POPOVER.md",
      "packages/origami-ui/acceptance/CASES.md",
      "packages/origami-ui/acceptance/types.ts",
    ],
  },
  lint: {
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      "./tools/origami-lint/plugin.mjs",
    ],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    overrides: [
      // Snippets are consumer code shown in the README; consumers' Angular specs import Vitest.
      {
        files: ["packages/angular-router/snippets/**"],
        rules: { "vite-plus/prefer-vite-plus-imports": "off" },
      },
      // Shipped Origami directives only: snippets are consumer code that may write these attributes.
      {
        files: ["packages/origami-ui/*/src/**/*.ts"],
        excludeFiles: ["packages/origami-ui/snippets/**", "**/*.spec.ts", "**/*.test.ts"],
        rules: { "origami/host-attribute-owner": "error" },
      },
    ],
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});
