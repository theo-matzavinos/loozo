import { existsSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import type { Demo } from "./demos.ts";
import type { DemoControl } from "./model.ts";
import { SourceError } from "./snippets.ts";

/**
 * Returns a loader of the TypeScript program over `<packageDir>/snippets/tsconfig.json`, created on
 * first use. Playground controls need its type checker.
 */
export function snippetProgramLoader(packageDir: string): () => ts.Program {
  let program: ts.Program | undefined = undefined;

  return () => {
    if (program !== undefined) {
      return program;
    }

    const path = join(packageDir, "snippets/tsconfig.json");

    if (!existsSync(path)) {
      throw new Error(`${path}: playground snippets are typechecked with this tsconfig`);
    }

    const parsed = ts.getParsedCommandLineOfConfigFile(path, undefined, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(diagnostic) {
        throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
      },
    });

    if (parsed === undefined) {
      throw new Error(`${path}: could not be read`);
    }

    program = ts.createProgram(parsed.fileNames, parsed.options);

    return program;
  };
}

/**
 * Reads a playground's controls from the `input()` and `model()` properties of its component.
 *
 * @throws SourceError for a required input, which a playground has no value for.
 */
export function readControls(
  program: ts.Program,
  demo: Demo,
  file: string,
  line: number,
): DemoControl[] {
  const source = program.getSourceFile(demo.file);

  if (source === undefined) {
    throw new SourceError(file, line, `the snippets tsconfig doesn't include ${demo.file}`);
  }

  const checker = program.getTypeChecker();
  const controls: DemoControl[] = [];

  for (const statement of source.statements) {
    if (!ts.isClassDeclaration(statement) || statement.name?.text !== demo.exportName) {
      continue;
    }

    for (const member of statement.members) {
      const signal = signalInitializer(member);

      if (signal === undefined) {
        continue;
      }

      const { property, call } = signal;
      const name = publicName(signal);

      if (signal.required) {
        throw new SourceError(
          file,
          line,
          `a playground has no value for required input "${name}" of ${demo.exportName}`,
        );
      }

      const signalType = checker.getTypeAtLocation(property);
      const valueType = signalType.getCallSignatures()[0].getReturnType();

      controls.push({
        name,
        binding: signal.binding,
        ...control(checker, valueType, call.arguments[0]),
      });
    }
  }

  return controls;
}

/** A property initialized with `input(...)`, `model(...)` or their `.required(...)` forms. */
interface SignalProperty {
  readonly property: ts.PropertyDeclaration;
  readonly call: ts.CallExpression;
  readonly binding: "input" | "model";
  readonly required: boolean;
}

function signalInitializer(member: ts.ClassElement): SignalProperty | undefined {
  if (!ts.isPropertyDeclaration(member) || member.initializer === undefined) {
    return undefined;
  }

  const call = member.initializer;

  if (!ts.isCallExpression(call)) {
    return undefined;
  }

  let callee = call.expression;
  let required = false;

  if (ts.isPropertyAccessExpression(callee) && callee.name.text === "required") {
    callee = callee.expression;
    required = true;
  }

  if (!ts.isIdentifier(callee) || (callee.text !== "input" && callee.text !== "model")) {
    return undefined;
  }

  return { property: member, call, binding: callee.text, required };
}

/** The property name, or the `alias` of the options argument. */
function publicName({ property, call, required }: SignalProperty): string {
  // A required signal has no default, so its options come first.
  let options = call.arguments[1];

  if (required) {
    options = call.arguments[0];
  }

  if (options !== undefined && ts.isObjectLiteralExpression(options)) {
    for (const option of options.properties) {
      if (
        ts.isPropertyAssignment(option) &&
        option.name.getText() === "alias" &&
        ts.isStringLiteralLike(option.initializer)
      ) {
        return option.initializer.text;
      }
    }
  }

  return property.name.getText();
}

/** A control without its name and binding, per kind. */
type ControlKind = DemoControl extends infer Control
  ? Control extends unknown
    ? Omit<Control, "name" | "binding">
    : never
  : never;

/** The control for a value type and its default; "fixed" unless both are supported. */
function control(
  checker: ts.TypeChecker,
  type: ts.Type,
  initializer: ts.Expression | undefined,
): ControlKind {
  const initial = literalValue(initializer);

  const fixed: ControlKind = { kind: "fixed", type: checker.typeToString(type) };

  if (initial === undefined) {
    return fixed;
  }

  if (type.flags & ts.TypeFlags.Boolean && typeof initial === "boolean") {
    return { kind: "boolean", initial };
  }

  if (type.flags & ts.TypeFlags.Number && typeof initial === "number") {
    return { kind: "number", initial };
  }

  if (type.flags & ts.TypeFlags.String && typeof initial === "string") {
    return { kind: "string", initial };
  }

  let members = [type];

  if (type.isUnion()) {
    members = type.types;
  }

  const options: (string | null)[] = [];
  let nullable = false;

  for (const member of members) {
    if (member.isStringLiteral()) {
      options.push(member.value);
    } else if (member.flags & ts.TypeFlags.Null) {
      nullable = true;
    } else {
      return fixed;
    }
  }

  // "none" comes after the values.
  if (nullable) {
    options.push(null);
  }

  if (typeof initial === "boolean" || typeof initial === "number" || !options.includes(initial)) {
    return fixed;
  }

  return { kind: "options", options, initial };
}

/** A literal default's value: undefined when there's none or it isn't a literal. */
function literalValue(
  node: ts.Expression | undefined,
): string | number | boolean | null | undefined {
  if (node === undefined) {
    return undefined;
  }

  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }

  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }

  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null;
  }

  return undefined;
}
