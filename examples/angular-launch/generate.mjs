import { generate } from "@loozo/angular-launch/generation";
await generate(import.meta.dirname, {
  tsconfig: "tsconfig.app.json",
  scanDirectories: ["src/routes"],
  outDirectory: "generated",
  check: process.argv.includes("--check"),
});
