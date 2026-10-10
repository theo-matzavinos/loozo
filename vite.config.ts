import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      "SPEC.md",
      "consumer/generated/destinations.generated.ts",
      "consumer/generated/routes.generated.ts",
      "consumer/src/routes/home/route.generated.ts",
      "consumer/ssr-proof/generated/destinations.generated.ts",
      "consumer/ssr-proof/generated/routes.generated.ts",
      "consumer/ssr-proof/src/routes/handle-only/route.generated.ts",
      "consumer/ssr-proof/src/routes/home/route.generated.ts",
      "consumer/ssr-proof/src/routes/item/route.generated.ts",
      "consumer/ssr-proof/src/routes/team/route.generated.ts",
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
