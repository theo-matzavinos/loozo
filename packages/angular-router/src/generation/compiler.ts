import ts from "typescript";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

interface CachedSource {
  source: ts.SourceFile;
  languageVersion: ts.ScriptTarget;
  impliedNodeFormat: ts.ResolutionMode;
  jsDocParsingMode: ts.JSDocParsingMode | undefined;
}

// A fresh program, and its files' semantic diagnostics, carried over from the last checked
// program's for files nothing they depend on changed in.
export interface CheckedProgram {
  program: ts.Program;
  semanticDiagnostics(source: ts.SourceFile): readonly ts.Diagnostic[];
}

// TypeScript internals; the router pins its typescript dependency, so these can't shift under it.
type Versioned = ts.SourceFile & { version: string };
interface Resolutions {
  forEachResolvedModule(
    callback: (
      resolution: { resolvedModule?: { resolvedFileName: string } },
      name: string,
      mode: ts.ResolutionMode,
      file: ts.Path,
    ) => void,
  ): void;
  forEachResolvedTypeReferenceDirective(
    callback: (
      resolution: { resolvedTypeReferenceDirective?: { resolvedFileName?: string } },
      name: string,
      mode: ts.ResolutionMode,
      file: ts.Path,
    ) => void,
  ): void;
}

// One graph's content-aware SourceFiles, including native binding data, and the last checked
// program's per-file semantic diagnostics. Hosts, Programs, checkers and native resolution caches
// are fresh on every pass.
export class CompilerState {
  #files = new Map<string, CachedSource>();
  #optionsKey: string | undefined;
  #builder: ts.SemanticDiagnosticsBuilderProgram | undefined;
  // What each import and type reference of the last checked program resolved to.
  #resolutions = new Map<string, string | undefined>();

  clear(): void {
    this.#files.clear();
    this.#optionsKey = undefined;
    this.#builder = undefined;
    this.#resolutions.clear();
  }

  createProgram(
    rootNames: readonly string[],
    options: ts.CompilerOptions,
    host: ts.CompilerHost,
  ): ts.Program {
    // configFile is an AST, not an effective compiler setting. Configs and their
    // diagnostics are parsed afresh by discovery; never serialize/retain that AST.
    const { configFile: _configFile, ...settings } = options;
    const optionsKey = JSON.stringify(settings);

    if (optionsKey !== this.#optionsKey) {
      this.clear();
      this.#optionsKey = optionsKey;
    }

    host.getSourceFile = (file, language, _onError, shouldCreateNewSourceFile) => {
      const key = host.getCanonicalFileName(resolve(file));
      const text = host.readFile(file);

      if (text === undefined) {
        this.#files.delete(key);

        return undefined;
      }

      let languageVersion: ts.ScriptTarget;
      let impliedNodeFormat: ts.ResolutionMode;
      let jsDocParsingMode = host.jsDocParsingMode;

      if (typeof language === "object") {
        languageVersion = language.languageVersion;
        impliedNodeFormat = language.impliedNodeFormat;
        jsDocParsingMode = language.jsDocParsingMode;
      } else {
        languageVersion = language;
      }

      const cached = this.#files.get(key);

      // The external-module indicator supplied in `language` derives from the
      // effective settings above; implied format/JSDoc mode are per-file inputs.
      if (
        !shouldCreateNewSourceFile &&
        cached &&
        cached.source.text === text &&
        cached.languageVersion === languageVersion &&
        cached.impliedNodeFormat === impliedNodeFormat &&
        cached.jsDocParsingMode === jsDocParsingMode
      ) {
        return cached.source;
      }

      const source = ts.createSourceFile(file, text, language, true);

      // TypeScript's builder compares versions to find changed files; a SourceFile is reused
      // only for identical text, so the text's hash is its version.
      (source as Versioned).version = createHash("sha256").update(text).digest("base64");
      this.#files.set(key, { source, languageVersion, impliedNodeFormat, jsDocParsingMode });

      return source;
    };

    // Deliberately do not supply oldProgram: package metadata, missing lookups,
    // module/type/lib resolutions and directory existence must be current.
    const program = ts.createProgram({ rootNames, options, host });
    const retained = new Set<string>();

    for (const source of program.getSourceFiles()) {
      retained.add(host.getCanonicalFileName(resolve(source.fileName)));
    }

    for (const file of this.#files.keys()) {
      if (!retained.has(file)) {
        this.#files.delete(file);
      }
    }

    return program;
  }

  // The builder takes per-file semantic diagnostics from the last checked program for files
  // whose own text and dependencies' declaration shapes are unchanged; resolution stays fresh,
  // because the program is.
  createCheckedProgram(
    rootNames: readonly string[],
    options: ts.CompilerOptions,
    host: ts.CompilerHost,
  ): CheckedProgram {
    // A watch heuristic that stops invalidation at direct dependents; a cold pass checks them all.
    const { assumeChangesOnlyAffectDirectDependencies: _direct, ...checked } = options;
    const program = this.createProgram(rootNames, checked, host);
    // A changed file's dependents are rechecked only when its emitted declaration changes, and an
    // import retargeted under unchanged text, such as swapped package.json exports, can leave the
    // declaration's text intact while its types change. Such a pass checks everything afresh.
    const resolutions = new Map<string, string | undefined>();
    let retargeted = false;

    const record = (key: string, target: string | undefined) => {
      resolutions.set(key, target);

      if (this.#resolutions.has(key) && this.#resolutions.get(key) !== target) {
        retargeted = true;
      }
    };
    const internal = program as ts.Program & Resolutions;

    internal.forEachResolvedModule((resolution, name, mode, file) => {
      record(`${file}\0module\0${name}\0${mode}`, resolution.resolvedModule?.resolvedFileName);
    });
    internal.forEachResolvedTypeReferenceDirective((resolution, name, mode, file) => {
      record(
        `${file}\0types\0${name}\0${mode}`,
        resolution.resolvedTypeReferenceDirective?.resolvedFileName,
      );
    });
    this.#resolutions = resolutions;

    let previous = this.#builder;

    if (retargeted) {
      previous = undefined;
    }

    const builder = ts.createSemanticDiagnosticsBuilderProgram(program, host, previous);
    let drained = false;

    this.#builder = builder;

    return {
      program,
      semanticDiagnostics(source) {
        if (!drained) {
          drained = true;
          // Drops the carried diagnostics of every file this pass's changes affect, checking
          // none of them: a requested file without diagnostics is checked on demand.
          builder.getSemanticDiagnosticsOfNextAffectedFile(undefined, () => true);
        }

        return builder.getSemanticDiagnostics(source);
      },
    };
  }
}
