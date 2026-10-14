import { chromium, firefox, webkit } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { webkitLaunchOptions } from "./webkit-launch.ts";

const engines = { chromium, firefox, webkit };
let selected = process.argv.slice(2);

// Default: all three. An explicit selection (fast gate) never inspects the other engines' setup.
if (selected.length === 0) {
  selected = Object.keys(engines);
}

for (const name of selected) {
  assert.ok(Object.hasOwn(engines, name), `Unknown engine: ${name}`);
}

const results = [];

for (const name of selected) {
  const type = engines[name];
  let browser;

  try {
    let options = { headless: true };

    if (name === "webkit") {
      options = webkitLaunchOptions();
    }

    browser = await type.launch(options);

    const page = await browser.newPage();

    await page.goto("data:text/html,<title>Native browser readiness</title>");
    results.push({
      engine: name,
      version: browser.version(),
      title: await page.title(),
      status: "passed",
      executablePath: options.executablePath ?? type.executablePath(),
      privateDependencies: name === "webkit" && Boolean(process.env.ORIGAMI_WEBKIT_DEPS_ROOT),
      productQualification: false,
    });
  } catch (error) {
    results.push({ engine: name, status: "blocked", error: String(error) });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

await mkdir(".acceptance-evidence", { recursive: true });

let receipt = "browser-readiness.json";

if (process.argv.length > 2) {
  receipt = `browser-readiness-${selected.join("-")}.json`;
}

await writeFile(`.acceptance-evidence/${receipt}`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

if (results.some((result) => result.status !== "passed")) {
  process.exitCode = 1;
}
