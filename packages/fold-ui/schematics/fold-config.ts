import { SchematicsException, type Tree } from "@angular-devkit/schematics";
import { fileURLToPath } from "node:url";

/** The workspace's `fold.json`: where `add` copies components, and their selector prefix. */
export interface FoldConfig {
  readonly prefix: string;
  readonly path: string;
}

export const foldConfigPath = "fold.json";
export const prefixPattern = /^[a-z][a-z0-9]*$/;
/** fold's authored component sources, shipped next to the schematics. */
export const componentsDirectory = fileURLToPath(new URL("../components/", import.meta.url));

/**
 * Reads and validates `fold.json`, which the consumer owns and may have edited.
 *
 * @returns `undefined` when the workspace has no `fold.json`.
 * @throws SchematicsException when `fold.json` isn't a valid fold configuration.
 */
export function readFoldConfig(tree: Tree): FoldConfig | undefined {
  if (!tree.exists(foldConfigPath)) {
    return undefined;
  }

  const config: unknown = tree.readJson(foldConfigPath);

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new SchematicsException(`${foldConfigPath} must be an object.`);
  }

  const { prefix, path } = config as Record<string, unknown>;

  if (typeof prefix !== "string" || !prefixPattern.test(prefix)) {
    throw new SchematicsException(
      `${foldConfigPath}: "prefix" must be lowercase letters and digits, starting with a letter.`,
    );
  }

  if (typeof path !== "string" || path === "") {
    throw new SchematicsException(`${foldConfigPath}: "path" must be a folder path.`);
  }

  return { prefix, path };
}
