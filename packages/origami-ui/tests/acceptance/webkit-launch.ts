import type { LaunchOptions } from "playwright";
import { webkit } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import assert from "node:assert/strict";

/** Opt-in genuine SDK paths only. Never alter other browsers or the server environment. */
export function webkitLaunchOptions(): LaunchOptions {
  const runtime = process.env.ORIGAMI_WEBKIT_DEPS_ROOT;

  if (!runtime) {
    return { headless: true };
  }

  assert.equal(process.platform, "linux");
  assert.equal(process.arch, "x64");

  const bundle = dirname(webkit.executablePath());

  assert.equal(basename(bundle), "webkit-2359", "Private dependency pins target Playwright 1.63.0");

  const metadata = join(resolve(runtime), "metadata");
  const receipt = JSON.parse(readFileSync(join(metadata, "setup-receipt.json"), "utf8"));
  const manifest = readFileSync(new URL("./webkit-packages.json", import.meta.url));
  const manifestSha256 = createHash("sha256").update(manifest).digest("hex");

  assert.equal(receipt.status, "authenticated-relocations-passed");
  assert.equal(receipt.manifestSha256, manifestSha256, "Rerun setup after reviewing changed pins");
  assert.equal(receipt.webkitBundle, bundle);

  const root = join(resolve(runtime), "root");

  assert.equal(receipt.root, root);

  const wpe = join(bundle, "minibrowser-wpe");
  const executablePath = join(wpe, "bin/MiniBrowser");
  const vendor = join(root, "usr/share/glvnd/egl_vendor.d/50_mesa.json");

  assert.ok(existsSync(executablePath) && existsSync(vendor));

  return {
    headless: true,
    executablePath,
    env: {
      ...process.env,
      WEBKIT_EXEC_PATH: join(wpe, "bin"),
      WEBKIT_INJECTED_BUNDLE_PATH: join(wpe, "lib"),
      WEBKIT_INSPECTOR_RESOURCES_PATH: join(wpe, "share"),
      WEBKIT_FORCE_COMPLEX_TEXT: "1",
      LD_LIBRARY_PATH: `${root}/usr/lib/x86_64-linux-gnu:${wpe}/lib:${wpe}/sys/lib`,
      __EGL_VENDOR_LIBRARY_FILENAMES: vendor,
    },
  };
}
