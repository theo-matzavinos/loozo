// Bumps packages/<package> to the next 0.0.x. Launch also pins the router's
// current version as its exact peer dependency and in its README install command.
import { readFile, writeFile } from "node:fs/promises";

const name = process.argv[2];

function manifestUrl(packageName) {
  return new URL(`../packages/${packageName}/package.json`, import.meta.url);
}

async function readManifest(packageName) {
  return JSON.parse(await readFile(manifestUrl(packageName), "utf8"));
}

const manifest = await readManifest(name);
const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(manifest.version);

if (!version) {
  throw new Error(`Can't bump ${name}: version ${manifest.version} isn't plain major.minor.patch`);
}

manifest.version = `${version[1]}.${version[2]}.${Number(version[3]) + 1}`;

if (name === "angular-launch") {
  const router = await readManifest("angular-router");
  const readmeUrl = new URL("../packages/angular-launch/README.md", import.meta.url);
  const readme = await readFile(readmeUrl, "utf8");
  const install = /@loozo\/angular-router@\d+\.\d+\.\d+/g;

  if (!install.test(readme)) {
    throw new Error(
      "Can't find the @loozo/angular-router@<version> install command in Launch's README",
    );
  }

  manifest.peerDependencies["@loozo/angular-router"] = router.version;
  await writeFile(readmeUrl, readme.replace(install, `@loozo/angular-router@${router.version}`));
}

await writeFile(manifestUrl(name), `${JSON.stringify(manifest, null, 2)}\n`);
