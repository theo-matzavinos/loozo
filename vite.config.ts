import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      "docs/generated/**/*.generated.ts",
      "docs/src/routes/**/route.generated.ts",
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
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
  },
});
