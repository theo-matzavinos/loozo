import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      "packages/angular-router/SPEC.md",
      "examples/angular-router/generated/destinations.generated.ts",
      "examples/angular-router/generated/routes.generated.ts",
      "examples/angular-router/src/routes/home/route.generated.ts",
      "examples/angular-router/ssr-proof/generated/destinations.generated.ts",
      "examples/angular-router/ssr-proof/generated/routes.generated.ts",
      "examples/angular-router/ssr-proof/src/routes/handle-only/route.generated.ts",
      "examples/angular-router/ssr-proof/src/routes/home/route.generated.ts",
      "examples/angular-router/ssr-proof/src/routes/item/route.generated.ts",
      "examples/angular-router/ssr-proof/src/routes/team/route.generated.ts",
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
