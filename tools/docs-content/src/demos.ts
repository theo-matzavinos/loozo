import { readFileSync } from "node:fs";
import ts from "typescript";
import { SourceError, type SnippetEmbed } from "./snippets.ts";

/** A component a guide page runs: the one exported component of a snippet file. */
export interface Demo {
  /** Key in `demos.generated.ts`: `<package slug>/<snippet caption>`. */
  readonly id: string;
  /** Absolute path of the snippet file. */
  readonly file: string;
  /** The component's export name. */
  readonly exportName: string;
}

/**
 * Finds the component a running view of `embed` renders.
 *
 * @throws SourceError unless the snippet file has exactly one named export that is a class
 * decorated with `@Component`.
 */
export function findDemo(slug: string, embed: SnippetEmbed, file: string, line: number): Demo {
  const source = ts.createSourceFile(
    embed.file,
    readFileSync(embed.file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const components: string[] = [];

  for (const statement of source.statements) {
    if (!ts.isClassDeclaration(statement) || statement.name === undefined) {
      continue;
    }

    let exported = false;
    let defaultExport = false;
    let component = false;

    for (const modifier of ts.getModifiers(statement) ?? []) {
      exported ||= modifier.kind === ts.SyntaxKind.ExportKeyword;
      defaultExport ||= modifier.kind === ts.SyntaxKind.DefaultKeyword;
    }

    for (const decorator of ts.getDecorators(statement) ?? []) {
      const call = decorator.expression;

      component ||=
        ts.isCallExpression(call) &&
        ts.isIdentifier(call.expression) &&
        call.expression.text === "Component";
    }

    if (exported && !defaultExport && component) {
      components.push(statement.name.text);
    }
  }

  if (components.length !== 1) {
    let found = String(components.length);

    if (components.length > 1) {
      found += ` (${components.join(", ")})`;
    }

    throw new SourceError(
      file,
      line,
      `a running snippet needs exactly one exported component, ${embed.caption} has ${found}`,
    );
  }

  return { id: `${slug}/${embed.caption}`, file: embed.file, exportName: components[0] };
}
