import { SchematicsException, chain, type Rule, type Tree } from "@angular-devkit/schematics";
import {
  DependencyType,
  ExistingBehavior,
  addDependency,
  readWorkspace,
} from "@schematics/angular/utility";
import { JSONFile } from "@schematics/angular/utility/json-file";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import {
  componentsDirectory,
  foldConfigPath,
  readFoldConfig,
  type FoldConfig,
} from "../fold-config.js";

export interface NgAddOptions {
  readonly project: string;
  readonly prefix: string;
}

/**
 * What fold's components import at runtime, at the versions fold is tested with. Must equal
 * fold's devDependencies (Origami's: the workspace version), which a unit test checks.
 */
export const runtimeDependencies: Readonly<Record<string, string>> = {
  "@loozo/origami-ui": "0.0.1",
  "tailwind-variants": "3.3.1",
  "@lucide/angular": "1.62.0",
  "@fontsource-variable/hanken-grotesk": "5.3.0",
};

const tailwindImport = /@import\s+(["'])tailwindcss\1([^;]*);/;

export default function ngAdd(options: NgAddOptions): Rule {
  return async (tree, context) => {
    const workspace = await readWorkspace(tree);
    const project = workspace.projects.get(options.project);

    if (project === undefined || project.extensions["projectType"] !== "application") {
      throw new SchematicsException(
        `fold: "${options.project}" isn't an application in this workspace.`,
      );
    }

    const build = project.targets.get("build");

    if (build === undefined) {
      throw new SchematicsException(`fold: "${options.project}" has no build target.`);
    }

    const stylesheet = findTailwindStylesheet(tree, build.options?.["styles"]);
    const existingConfig = readFoldConfig(tree);
    let config: FoldConfig;

    if (existingConfig === undefined) {
      const sourceRoot = project.sourceRoot ?? posix.join(project.root, "src");

      config = { prefix: options.prefix, path: posix.join(sourceRoot, "ui") };
      tree.create(foldConfigPath, foldConfigText(config));
    } else {
      config = existingConfig;
      context.logger.info(
        `Using the existing ${foldConfigPath}: prefix "${config.prefix}", path "${config.path}".`,
      );
    }

    const themePath = posix.join(config.path, "theme.css");

    if (!tree.exists(themePath)) {
      tree.create(themePath, readFileSync(join(componentsDirectory, "theme.css"), "utf8"));
    }

    importTheme(tree, stylesheet, themePath);
    mapImports(tree, config);

    const declared = declaredDependencies(tree);
    const rules: Rule[] = [];

    for (const [name, version] of Object.entries(runtimeDependencies)) {
      if (declared.has(name)) {
        continue;
      }

      rules.push(
        addDependency(name, version, {
          type: DependencyType.Default,
          existing: ExistingBehavior.Skip,
        }),
      );
    }

    return chain(rules);
  };
}

/**
 * Every package the workspace's package.json already declares, in any dependency section, so a
 * development or peer declaration isn't shadowed by a second one in `dependencies`.
 */
function declaredDependencies(tree: Tree): Set<string> {
  const manifest = new JSONFile(tree, "package.json");
  const names = new Set<string>();

  for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
    const entries = manifest.get([section]);

    if (typeof entries === "object" && entries !== null) {
      for (const name of Object.keys(entries)) {
        names.add(name);
      }
    }
  }

  return names;
}

/** The first global `.css` stylesheet of the build that imports Tailwind CSS. */
function findTailwindStylesheet(tree: Tree, styles: unknown): string {
  const entries: unknown[] = [];

  if (Array.isArray(styles)) {
    entries.push(...styles);
  }

  for (const entry of entries) {
    let path: unknown = entry;

    if (typeof entry === "object" && entry !== null && "input" in entry) {
      path = entry.input;
    }

    if (typeof path !== "string" || !path.endsWith(".css") || !tree.exists(path)) {
      continue;
    }

    const match = tailwindImport.exec(withoutComments(tree.readText(path)));

    if (match === null) {
      continue;
    }

    if (match[2].includes("prefix(")) {
      throw new SchematicsException(
        `fold doesn't support Tailwind's prefix() option, which ${path} sets on its tailwindcss import.`,
      );
    }

    return path;
  }

  throw new SchematicsException(
    "fold needs Tailwind CSS v4 in this app. Run `ng add tailwindcss`, then `ng add @loozo/fold-ui` again.",
  );
}

function foldConfigText(config: FoldConfig): string {
  const content = {
    $schema: "./node_modules/@loozo/fold-ui/schematics/fold.schema.json",
    prefix: config.prefix,
    path: config.path,
  };

  return `${JSON.stringify(content, null, 2)}\n`;
}

/** Imports the theme right after Tailwind, unless the stylesheet already imports it. */
function importTheme(tree: Tree, stylesheet: string, themePath: string): void {
  let importPath = posix.relative(posix.dirname(stylesheet), themePath);

  if (!importPath.startsWith("../")) {
    importPath = `./${importPath}`;
  }

  const css = tree.readText(stylesheet);
  const active = withoutComments(css);
  const escaped = importPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const imported = new RegExp(`@import\\s+["']${escaped}["']`).test(active);

  if (imported) {
    return;
  }

  // findTailwindStylesheet found this import, so it matches.
  const match = tailwindImport.exec(active)!;
  const end = match.index + match[0].length;
  let rest = css.slice(end);

  if (!rest.startsWith("\n") && !rest.startsWith("\r\n")) {
    rest = `\n${rest.replace(/^[ \t]+/, "")}`;
  }

  tree.overwrite(stylesheet, `${css.slice(0, end)}\n@import "${importPath}";${rest}`);
}

/** The stylesheet with its comments blanked out, so every other character keeps its index. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, (comment) => comment.replace(/[^\n]/g, " "));
}

/** Maps `#ui/<name>` to each component's barrel, through package.json `imports`. */
function mapImports(tree: Tree, config: FoldConfig): void {
  const packageJson = new JSONFile(tree, "package.json");
  const target = `./${posix.join(config.path, "*", "index.ts")}`;
  const existing = packageJson.get(["imports", "#ui/*"]);

  if (existing === target) {
    return;
  }

  if (existing !== undefined) {
    throw new SchematicsException(
      `fold: package.json already maps "#ui/*" to ${JSON.stringify(existing)}, not "${target}".`,
    );
  }

  packageJson.modify(["imports", "#ui/*"], target);
}
