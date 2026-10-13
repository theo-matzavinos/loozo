import ts from "typescript";
import { resolve } from "node:path";

interface CachedSource {
  source: ts.SourceFile;
  languageVersion: ts.ScriptTarget;
  impliedNodeFormat: ts.ResolutionMode;
  jsDocParsingMode: ts.JSDocParsingMode | undefined;
}

// One graph's content-aware SourceFiles, including native binding data.
// Hosts, Programs, checkers and native resolution caches are fresh on every pass.
export class CompilerState {
  #files = new Map<string, CachedSource>();
  #optionsKey: string | undefined;

  clear(): void {
    this.#files.clear();
    this.#optionsKey = undefined;
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
}
