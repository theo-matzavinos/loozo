import {
  createCompilerHost,
  formatDiagnostics,
  NgtscProgram,
  readConfiguration,
  type DocEntry,
} from "@angular/compiler-cli";
import ts from "typescript";
import type { WorkspacePackage } from "./packages.ts";

/** The extractor's entries of one entry point, with the source declarations behind them. */
export interface ExtractedEntryPoint {
  readonly entries: readonly DocEntry[];
  readonly checker: ts.TypeChecker;
  /** Exported name → its declarations, with re-exports resolved. */
  readonly declarations: ReadonlyMap<string, readonly ts.Declaration[]>;
}

/**
 * Runs Angular's API extractor over every entry point of a package, one program per tsconfig.
 *
 * Fails on any configuration, TypeScript or Angular diagnostic: a program that cannot see a
 * directive's metadata would otherwise silently document it as an undecorated class.
 *
 * @returns Extracted entry points keyed by subpath. `source.filePath` is relative to `root`.
 */
export function extractPackage(
  root: string,
  workspacePackage: WorkspacePackage,
  paths: Record<string, string[]>,
): Map<string, ExtractedEntryPoint> {
  const byTsconfig = new Map<string, string[]>();

  for (const entryPoint of workspacePackage.entryPoints) {
    const subpaths = byTsconfig.get(entryPoint.tsconfig) ?? [];

    subpaths.push(entryPoint.subpath);
    byTsconfig.set(entryPoint.tsconfig, subpaths);
  }

  const result = new Map<string, ExtractedEntryPoint>();

  for (const [tsconfig, subpaths] of byTsconfig) {
    const program = createProgram(root, tsconfig, paths);
    const tsProgram = program.getTsProgram();
    const checker = tsProgram.getTypeChecker();

    for (const entryPoint of workspacePackage.entryPoints) {
      if (!subpaths.includes(entryPoint.subpath)) {
        continue;
      }

      const documentation = program.getApiDocumentation(entryPoint.sourceFile, new Set());
      const sourceFile = tsProgram.getSourceFile(entryPoint.sourceFile);

      if (sourceFile === undefined) {
        throw new Error(`${entryPoint.sourceFile}: entry point is not part of ${tsconfig}`);
      }

      const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

      if (moduleSymbol === undefined) {
        throw new Error(`${entryPoint.sourceFile}: entry point is not a module of ${tsconfig}`);
      }

      const declarations = new Map<string, readonly ts.Declaration[]>();

      for (const exported of checker.getExportsOfModule(moduleSymbol)) {
        let symbol = exported;

        if (symbol.flags & ts.SymbolFlags.Alias) {
          symbol = checker.getAliasedSymbol(symbol);
        }

        declarations.set(exported.name, symbol.declarations ?? []);
      }

      result.set(entryPoint.subpath, { entries: documentation.entries, checker, declarations });
    }
  }

  return result;
}

function createProgram(root: string, tsconfig: string, paths: Record<string, string[]>) {
  // Workspace imports resolve to sources outside the package, so widen rootDir to the repository.
  const config = readConfiguration(tsconfig, { paths, rootDir: root });

  failOnDiagnostics(tsconfig, config.errors);

  const host = createCompilerHost({ options: config.options });

  // The extractor reports source paths relative to the program's current directory.
  host.getCurrentDirectory = () => root;

  const program = new NgtscProgram(config.rootNames, config.options, host);

  failOnDiagnostics(tsconfig, [
    ...program.getTsOptionDiagnostics(),
    ...program.getNgOptionDiagnostics(),
    ...program.getTsSyntacticDiagnostics(),
    ...program.getTsSemanticDiagnostics(),
    ...program.getNgStructuralDiagnostics(),
    ...program.getNgSemanticDiagnostics(),
  ]);

  return program;
}

function failOnDiagnostics(tsconfig: string, diagnostics: readonly ts.Diagnostic[]): void {
  if (diagnostics.length === 0) {
    return;
  }

  throw new Error(`API extraction for ${tsconfig} failed:\n${formatDiagnostics(diagnostics)}`);
}
