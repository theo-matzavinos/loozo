import ts from "typescript";
import { statSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";

export interface AnchoredDeclaration {
  file: string;
  kind: ts.SyntaxKind;
  pos: number;
  end: number;
}

// Factory name -> underlying declarations of the entry's unaliased export, or
// undefined when the export or its declarations are absent.
export type Anchor = ReadonlyMap<string, readonly AnchoredDeclaration[] | undefined>;

async function stamp(file: string): Promise<string> {
  try {
    const info = await stat(file);

    return `${info.mtimeMs}:${info.size}`;
  } catch {
    return "missing";
  }
}

// Immutable canonical factory descriptors for one generation session. Inputs are
// the effective options, entry, factory names and every file the anchor program
// read (sources and package metadata). A new higher-priority resolution candidate
// appearing mid-session is not detected; dependency changes need a new session.
// Recomputation builds a throwaway program, so no SourceFile or Symbol outlives it.
export class AnchorState {
  #key: string | undefined;
  #anchor: Anchor | undefined;
  #inputs = new Map<string, string>();

  clear(): void {
    this.#key = undefined;
    this.#anchor = undefined;
    this.#inputs.clear();
  }

  async anchor(
    entry: string,
    names: readonly string[],
    options: ts.CompilerOptions,
  ): Promise<Anchor> {
    const { configFile: _configFile, ...settings } = options;
    const key = JSON.stringify({ entry, names, settings });

    if (this.#anchor && key === this.#key) {
      const files = [...this.#inputs.keys()];
      const current = await Promise.all(files.map(stamp));
      let unchanged = true;

      for (let index = 0; index < files.length; index += 1) {
        if (current[index] !== this.#inputs.get(files[index])) {
          unchanged = false;
        }
      }

      if (unchanged) {
        return this.#anchor;
      }
    }

    this.#key = undefined;
    this.#anchor = undefined;
    this.#inputs.clear();

    const inputs = new Map<string, string>();
    const host = ts.createCompilerHost(options, true);
    const read = host.readFile.bind(host);

    // Stamp before reading, so an edit racing this pass invalidates the next one.
    host.readFile = (file) => {
      const path = resolve(file);

      try {
        const info = statSync(path);

        inputs.set(path, `${info.mtimeMs}:${info.size}`);
      } catch {
        inputs.set(path, "missing");
      }

      return read(file);
    };

    const program = ts.createProgram({ rootNames: [entry], options, host });
    const checker = program.getTypeChecker();
    const module = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!;
    const exports = checker.getExportsOfModule(module);
    const anchor = new Map<string, AnchoredDeclaration[] | undefined>();

    for (const name of names) {
      let symbol = exports.find((value) => value.name === name);

      if (symbol && symbol.flags & ts.SymbolFlags.Alias) {
        symbol = checker.getAliasedSymbol(symbol);
      }

      if (!symbol?.declarations?.length) {
        anchor.set(name, undefined);

        continue;
      }

      const declarations: AnchoredDeclaration[] = [];

      for (const declaration of symbol.declarations) {
        declarations.push({
          file: await realpath(declaration.getSourceFile().fileName),
          kind: declaration.kind,
          pos: declaration.pos,
          end: declaration.end,
        });
      }

      anchor.set(name, declarations);
    }

    this.#key = key;
    this.#anchor = anchor;
    this.#inputs = inputs;

    return anchor;
  }
}
